import {
  BAGGIE_PRICE_BASE,
  BAGGIES_PER_DRIED,
  CHEMICAL_PRICE,
  COOK_TIME_S,
  DISTRICT_GRID,
  DRY_CAPACITY,
  DRY_TIME_S,
  GROW_TIME_S,
  HARVEST_YIELD,
  LABOR_STORE_MAX,
  LAUNDER_SPECS,
  METH_BAGGIE_PRICE_BASE,
  METH_YIELD,
  PACK_QUEUE_MAX,
  PACK_TIME_S,
  SEED_PRICE,
  WORKER_SPECS,
  districtIdAt,
  priceFromFactor,
  type BuildingSnapshot,
  type ClientMessage,
  type DistrictSnapshot,
  type NpcSnapshot,
  type PlayerSnapshot,
  type WorkerSnapshot,
} from "@koks/shared";

type OpenTarget = { type: "building"; id: string } | { type: "npc"; id: string } | null;

interface ActionButton {
  el: HTMLButtonElement;
  /** Liefert bei jedem Refresh (Text, klickbar?) */
  refresh: (b: BuildingSnapshot | NpcSnapshot, me: PlayerSnapshot) => boolean;
}

const money = (p: PlayerSnapshot) => p.money.clean + p.money.dirty;

/**
 * Bottom-Sheet für Gebäude (Produktion + Personal) und Passanten (Verkauf).
 * Wird bei jedem Snapshot mit den Live-Zahlen aktualisiert.
 */
export class Panels {
  private open: OpenTarget = null;
  private buttons: ActionButton[] = [];
  private workers: WorkerSnapshot[] = [];
  private districts: DistrictSnapshot[] = [];
  private readonly panel = document.getElementById("panel")!;
  private readonly titleEl = document.getElementById("panel-title")!;
  private readonly bodyEl = document.getElementById("panel-body")!;
  private readonly actionsEl = document.getElementById("panel-actions")!;

  constructor(
    private readonly send: (msg: ClientMessage) => void,
    private readonly priceFactors: number[],
  ) {
    // onclick-Zuweisung statt addEventListener: bei Rejoin wird der alte Handler ersetzt
    (document.getElementById("panel-close") as HTMLButtonElement).onclick = () => this.close();
    this.panel.hidden = true;
  }

  isOpen(): boolean {
    return this.open !== null;
  }

  setDistricts(districts: DistrictSnapshot[]): void {
    this.districts = districts;
  }

  openBuilding(b: BuildingSnapshot, me: PlayerSnapshot, buildings: BuildingSnapshot[], workers: WorkerSnapshot[]): void {
    this.open = { type: "building", id: b.id };
    this.buttons = [];
    this.workers = workers;
    this.actionsEl.replaceChildren();

    const mine = b.owner.toLowerCase() === me.name.toLowerCase();
    if (mine) {
      switch (b.kind) {
        case "growbox":
          this.addButton(`1 Samen kaufen (${SEED_PRICE} €)`, { t: "buySeeds", buildingId: b.id, count: 1 }, (_, p) =>
            money(p) >= SEED_PRICE,
          );
          this.addButton(
            `5 Samen kaufen (${5 * SEED_PRICE} €)`,
            { t: "buySeeds", buildingId: b.id, count: 5 },
            (_, p) => money(p) >= 5 * SEED_PRICE,
          );
          this.addButton("Pflanzen (1 Samen)", { t: "plant", buildingId: b.id }, (eb, p) =>
            "kind" in eb && eb.kind === "growbox" && eb.plant === null && p.inv.seeds > 0,
          );
          this.addButton(`Ernten (+${HARVEST_YIELD} Ernte)`, { t: "harvest", buildingId: b.id }, (eb) =>
            "kind" in eb && eb.kind === "growbox" && eb.plant !== null && eb.plant >= 1,
          );
          this.addButton("Ernte-Lager entnehmen", { t: "collect", buildingId: b.id }, (eb) =>
            "kind" in eb && eb.kind === "growbox" && eb.store > 0,
          );
          this.addHireGardener(b);
          this.addHireCouriers(b, buildings, "trockenraum");
          break;
        case "trockenraum":
          this.addButton("Ernte aufhängen", { t: "store", buildingId: b.id }, (eb, p) =>
            "kind" in eb && eb.kind === "trockenraum" && p.inv.harvest > 0 && DRY_CAPACITY - eb.drying.length - eb.dried > 0,
          );
          this.addButton("Getrocknetes entnehmen", { t: "collect", buildingId: b.id }, (eb) =>
            "kind" in eb && eb.kind === "trockenraum" && eb.dried > 0,
          );
          this.addHireCouriers(b, buildings, "packtisch");
          break;
        case "packtisch":
          this.addButton("Weed verpacken", { t: "pack", buildingId: b.id }, (eb, p) =>
            "kind" in eb &&
            eb.kind === "packtisch" &&
            p.inv.dried > 0 &&
            PACK_QUEUE_MAX - eb.queue - (eb.packing === null ? 0 : 1) > 0,
          );
          this.addButton("Baggies entnehmen", { t: "collect", buildingId: b.id }, (eb) =>
            "kind" in eb && eb.kind === "packtisch" && eb.baggies > 0,
          );
          this.addHireDealer(b);
          break;
        case "waschsalon":
        case "bar":
          this.addLaunderButton(b, 50);
          this.addLaunderButton(b, 200);
          this.addLaunderButton(b, 1000);
          break;
        case "labor":
          this.addButton(
            `1 Chemikalie kaufen (${CHEMICAL_PRICE} €)`,
            { t: "buyChemicals", buildingId: b.id, count: 1 },
            (_, p) => money(p) >= CHEMICAL_PRICE,
          );
          this.addButton(
            `5 Chemikalien kaufen (${5 * CHEMICAL_PRICE} €)`,
            { t: "buyChemicals", buildingId: b.id, count: 5 },
            (_, p) => money(p) >= 5 * CHEMICAL_PRICE,
          );
          this.addButton("Charge kochen (1 Chemikalie)", { t: "plant", buildingId: b.id }, (eb, p) =>
            "kind" in eb && eb.kind === "labor" && eb.cook === null && p.inv.chemicals > 0,
          );
          this.addButton(`Charge entnehmen (+${METH_YIELD} Meth)`, { t: "harvest", buildingId: b.id }, (eb) =>
            "kind" in eb &&
            eb.kind === "labor" &&
            eb.cook !== null &&
            eb.cook >= 1 &&
            eb.store + METH_YIELD <= LABOR_STORE_MAX,
          );
          this.addButton("Meth-Lager entnehmen", { t: "collect", buildingId: b.id }, (eb) =>
            "kind" in eb && eb.kind === "labor" && eb.store > 0,
          );
          break;
      }
    }

    this.renderBuilding(b, me, mine);
    this.panel.hidden = false;
  }

  openNpc(n: NpcSnapshot, me: PlayerSnapshot): void {
    this.open = { type: "npc", id: n.id };
    this.buttons = [];
    this.actionsEl.replaceChildren();

    this.addButton("1 Baggie verkaufen", { t: "sell", npcId: n.id, drug: "weed" }, (en, p) => {
      const npc = en as NpcSnapshot;
      return npc.cooldown === 0 && p.inv.baggies > 0;
    });
    this.addButton("1 Meth verkaufen", { t: "sell", npcId: n.id, drug: "meth" }, (en, p) => {
      const npc = en as NpcSnapshot;
      return npc.cooldown === 0 && p.inv.methBaggies > 0;
    });

    this.renderNpc(n, me);
    this.panel.hidden = false;
  }

  /** Bei jedem Snapshot: offenes Panel mit frischen Zahlen füllen (oder schließen, wenn weg). */
  refresh(
    buildings: BuildingSnapshot[],
    npcs: NpcSnapshot[],
    workers: WorkerSnapshot[],
    me: PlayerSnapshot | undefined,
  ): void {
    this.workers = workers;
    if (!this.open || !me) return;
    if (this.open.type === "building") {
      const b = buildings.find((x) => x.id === this.open!.id);
      if (!b) return this.close();
      this.renderBuilding(b, me, b.owner.toLowerCase() === me.name.toLowerCase());
    } else {
      const n = npcs.find((x) => x.id === this.open!.id);
      if (!n) return this.close();
      this.renderNpc(n, me);
    }
  }

  close(): void {
    this.open = null;
    this.buttons = [];
    this.panel.hidden = true;
  }

  private addButton(
    label: string,
    msg: ClientMessage,
    enabled: (entity: BuildingSnapshot | NpcSnapshot, me: PlayerSnapshot) => boolean,
    parent: HTMLElement = this.actionsEl,
  ): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "action-btn";
    el.textContent = label;
    el.addEventListener("click", () => this.send(msg));
    parent.appendChild(el);
    this.buttons.push({ el, refresh: enabled });
    return el;
  }

  // ── Personal anheuern ──────────────────────────────────────────────────────

  private hasGardener(buildingId: string): boolean {
    return this.workers.some((w) => w.kind === "gaertner" && w.buildingId === buildingId);
  }

  private addHireGardener(b: BuildingSnapshot): void {
    const wage = WORKER_SPECS.gaertner.wage;
    this.addButton(
      `Gärtner anheuern (${wage} €/Periode)`,
      { t: "hire", kind: "gaertner", buildingId: b.id },
      (_, p) => !this.hasGardener(b.id) && money(p) >= wage,
    );
  }

  /** Kurier-Buttons: ein Button je eigenem Zielgebäude, nach Entfernung sortiert. */
  private addHireCouriers(b: BuildingSnapshot, buildings: BuildingSnapshot[], targetKind: "trockenraum" | "packtisch"): void {
    const wage = WORKER_SPECS.kurier.wage;
    const targets = buildings
      .filter((t) => t.kind === targetKind && t.owner.toLowerCase() === b.owner.toLowerCase())
      .map((t) => ({ t, dist: Math.round(Math.hypot(t.x - b.x, t.y - b.y)) }))
      .sort((a, z) => a.dist - z.dist)
      .slice(0, 4);
    const label = targetKind === "trockenraum" ? "Trockenraum" : "Packtisch";
    for (const { t, dist } of targets) {
      this.addButton(
        `Kurier → ${label} ${t.id} · ${dist} Tiles (${wage} €/Periode)`,
        { t: "hire", kind: "kurier", buildingId: b.id, targetBuildingId: t.id },
        (_, p) => money(p) >= wage,
      );
    }
  }

  /** Dealer: Distrikt direkt im Panel wählen — 4×4-Raster mit Preisfaktoren. */
  private addHireDealer(b: BuildingSnapshot): void {
    const wage = WORKER_SPECS.dealer.wage;
    const caption = document.createElement("div");
    caption.className = "district-caption";
    caption.textContent = `Dealer anheuern (${wage} €/Periode) — Verkaufs-Distrikt wählen:`;
    this.actionsEl.appendChild(caption);

    const grid = document.createElement("div");
    grid.className = "district-grid";
    this.actionsEl.appendChild(grid);
    const homeDistrict = districtIdAt(b.x, b.y);
    for (let d = 0; d < DISTRICT_GRID * DISTRICT_GRID; d++) {
      const factor = this.districts.find((x) => x.id === d)?.priceFactor ?? this.priceFactors[d]!;
      const control = this.controlFor(d);
      const el = this.addButton(
        `×${factor.toFixed(2)} · ${Math.round(control * 100)}%`,
        { t: "hire", kind: "dealer", buildingId: b.id, district: d },
        (_, p) => money(p) >= wage,
        grid,
      );
      el.classList.add("district-btn");
      el.classList.add(control < 0.35 ? "district-rival" : control > 0.65 ? "district-mine" : "district-contested");
      if (d === homeDistrict) el.classList.add("district-home");
    }
  }

  // ── Geldwäsche ──────────────────────────────────────────────────────────────

  private addLaunderButton(b: BuildingSnapshot, amount: number): void {
    this.addButton(`${amount} € waschen`, { t: "launder", buildingId: b.id, amount }, (eb, p) => {
      if (!("kind" in eb) || (eb.kind !== "waschsalon" && eb.kind !== "bar")) return false;
      return p.money.dirty >= amount && eb.queued + amount <= LAUNDER_SPECS[eb.kind].queueMax;
    });
  }

  private controlFor(districtId: number): number {
    return this.districts.find((d) => d.id === districtId)?.control ?? 0.5;
  }

  private refreshButtons(entity: BuildingSnapshot | NpcSnapshot, me: PlayerSnapshot): void {
    for (const btn of this.buttons) btn.el.disabled = !btn.refresh(entity, me);
  }

  private renderBuilding(b: BuildingSnapshot, me: PlayerSnapshot, mine: boolean): void {
    const lines: string[] = [];
    switch (b.kind) {
      case "growbox":
        this.titleEl.textContent = `Growbox ${b.id}`;
        lines.push(
          b.plant === null
            ? "Beet: leer"
            : b.plant >= 1
              ? "Pflanze: REIF — ernten!"
              : `Pflanze: ${Math.round(b.plant * 100)} % (${GROW_TIME_S} s Wachstum)`,
        );
        lines.push(`Ernte-Lager: ${b.store}`);
        lines.push(`Gärtner: ${this.hasGardener(b.id) ? "angestellt" : "—"}`);
        lines.push(`Samen dabei: ${me.inv.seeds}`);
        break;
      case "trockenraum":
        this.titleEl.textContent = `Trockenraum ${b.id}`;
        lines.push(`Trocknet: ${b.drying.length} (je ${DRY_TIME_S} s)`);
        lines.push(`Fertig: ${b.dried}`);
        lines.push(`Frei: ${DRY_CAPACITY - b.drying.length - b.dried}/${DRY_CAPACITY}`);
        lines.push(`Ernte dabei: ${me.inv.harvest}`);
        break;
      case "packtisch":
        this.titleEl.textContent = `Packtisch ${b.id}`;
        lines.push(`Warteschlange: ${b.queue}`);
        lines.push(b.packing === null ? "In Arbeit: —" : `In Arbeit: ${Math.round(b.packing * 100)} % (${PACK_TIME_S} s)`);
        lines.push(`Fertige Baggies: ${b.baggies} (${BAGGIES_PER_DRIED} je Einheit)`);
        lines.push(`Weed dabei: ${me.inv.dried}`);
        break;
      case "waschsalon":
      case "bar": {
        const spec = LAUNDER_SPECS[b.kind];
        this.titleEl.textContent = `${b.kind === "waschsalon" ? "Waschsalon" : "Bar"} ${b.id}`;
        lines.push(`Warteschlange: ${b.queued} / ${spec.queueMax} €`);
        lines.push(`Durchsatz: ${spec.ratePerS} €/s · ${Math.round(spec.feePct * 100)} % Gebühr`);
        lines.push(`Schmutziges Geld dabei: ${me.money.dirty} €`);
        break;
      }
      case "labor":
        this.titleEl.textContent = `Labor ${b.id}`;
        lines.push(
          b.cook === null
            ? "Kocht: nichts"
            : b.cook >= 1
              ? "Charge: FERTIG — entnehmen!"
              : `Kocht: ${Math.round(b.cook * 100)} % (${COOK_TIME_S} s)`,
        );
        lines.push(`Lager: ${b.store} / ${LABOR_STORE_MAX} Meth`);
        lines.push(`Chemikalien dabei: ${me.inv.chemicals}`);
        break;
    }
    const staff = this.workers.filter((w) => w.buildingId === b.id || w.targetBuildingId === b.id);
    if (staff.length > 0) {
      lines.push(`Personal hier: ${staff.map((w) => WORKER_SPECS[w.kind].name).join(", ")}`);
    }
    if (!mine) lines.unshift(`Gehört ${b.owner} — nur der Besitzer kann hier arbeiten.`);
    this.bodyEl.innerHTML = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
    this.refreshButtons(b, me);
  }

  private renderNpc(n: NpcSnapshot, me: PlayerSnapshot): void {
    this.titleEl.textContent = "Passant";
    const districtId = districtIdAt(Math.floor(n.x), Math.floor(n.y));
    const control = this.controlFor(districtId);
    const factor = this.districts.find((x) => x.id === districtId)?.priceFactor ?? this.priceFactors[districtId]!;
    const weedPrice = priceFromFactor(factor, control, BAGGIE_PRICE_BASE);
    const methPrice = priceFromFactor(factor, control, METH_BAGGIE_PRICE_BASE);
    const lines = [
      `Distrikt-Faktor: ×${factor.toFixed(2)}`,
      `Revier-Kontrolle: ${Math.round(control * 100)} % ${control >= 0.5 ? "(dein Revier)" : "(Rivalen dominieren)"}`,
      `Baggie-Preis hier: ${weedPrice} € (schmutzig)`,
      `Meth-Preis hier: ${methPrice} € (schmutzig)`,
      n.cooldown > 0 ? `Hat gerade gekauft — wartet noch ${n.cooldown} s` : "Kaufbereit",
      `Baggies dabei: ${me.inv.baggies} · Meth dabei: ${me.inv.methBaggies}`,
    ];
    this.bodyEl.innerHTML = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
    const sellWeedBtn = this.buttons[0];
    if (sellWeedBtn) sellWeedBtn.el.textContent = `1 Baggie verkaufen (+${weedPrice} €)`;
    const sellMethBtn = this.buttons[1];
    if (sellMethBtn) sellMethBtn.el.textContent = `1 Meth verkaufen (+${methPrice} €)`;
    this.refreshButtons(n, me);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
