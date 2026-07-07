import {
  BAGGIES_PER_DRIED,
  DRY_CAPACITY,
  DRY_TIME_S,
  GROW_TIME_S,
  HARVEST_YIELD,
  PACK_QUEUE_MAX,
  PACK_TIME_S,
  SEED_PRICE,
  baggiePriceAt,
  districtIdAt,
  type BuildingSnapshot,
  type ClientMessage,
  type NpcSnapshot,
  type PlayerSnapshot,
} from "@koks/shared";

type OpenTarget = { type: "building"; id: string } | { type: "npc"; id: string } | null;

interface ActionButton {
  el: HTMLButtonElement;
  /** Liefert bei jedem Refresh (Text, klickbar?) */
  refresh: (b: BuildingSnapshot | NpcSnapshot, me: PlayerSnapshot) => boolean;
}

/**
 * Bottom-Sheet für Gebäude (Produktions-Aktionen) und Passanten (Verkauf).
 * Wird bei jedem Snapshot mit den Live-Zahlen aktualisiert.
 */
export class Panels {
  private open: OpenTarget = null;
  private buttons: ActionButton[] = [];
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

  openBuilding(b: BuildingSnapshot, me: PlayerSnapshot): void {
    this.open = { type: "building", id: b.id };
    this.buttons = [];
    this.actionsEl.replaceChildren();

    const mine = b.owner.toLowerCase() === me.name.toLowerCase();
    if (mine) {
      switch (b.kind) {
        case "growbox":
          this.addButton(`1 Samen kaufen (${SEED_PRICE} €)`, { t: "buySeeds", buildingId: b.id, count: 1 }, (_, p) =>
            p.money.clean + p.money.dirty >= SEED_PRICE,
          );
          this.addButton(
            `5 Samen kaufen (${5 * SEED_PRICE} €)`,
            { t: "buySeeds", buildingId: b.id, count: 5 },
            (_, p) => p.money.clean + p.money.dirty >= 5 * SEED_PRICE,
          );
          this.addButton("Pflanzen (1 Samen)", { t: "plant", buildingId: b.id }, (eb, p) =>
            "kind" in eb && eb.kind === "growbox" && eb.plant === null && p.inv.seeds > 0,
          );
          this.addButton(`Ernten (+${HARVEST_YIELD} Ernte)`, { t: "harvest", buildingId: b.id }, (eb) =>
            "kind" in eb && eb.kind === "growbox" && eb.plant !== null && eb.plant >= 1,
          );
          break;
        case "trockenraum":
          this.addButton("Ernte aufhängen", { t: "store", buildingId: b.id }, (eb, p) =>
            "kind" in eb && eb.kind === "trockenraum" && p.inv.harvest > 0 && DRY_CAPACITY - eb.drying.length - eb.dried > 0,
          );
          this.addButton("Getrocknetes entnehmen", { t: "collect", buildingId: b.id }, (eb) =>
            "kind" in eb && eb.kind === "trockenraum" && eb.dried > 0,
          );
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

    this.addButton("1 Baggie verkaufen", { t: "sell", npcId: n.id }, (en, p) => {
      const npc = en as NpcSnapshot;
      return npc.cooldown === 0 && p.inv.baggies > 0;
    });

    this.renderNpc(n, me);
    this.panel.hidden = false;
  }

  /** Bei jedem Snapshot: offenes Panel mit frischen Zahlen füllen (oder schließen, wenn weg). */
  refresh(buildings: BuildingSnapshot[], npcs: NpcSnapshot[], me: PlayerSnapshot | undefined): void {
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
  ): void {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "action-btn";
    el.textContent = label;
    el.addEventListener("click", () => this.send(msg));
    this.actionsEl.appendChild(el);
    this.buttons.push({ el, refresh: enabled });
  }

  private refreshButtons(entity: BuildingSnapshot | NpcSnapshot, me: PlayerSnapshot): void {
    for (const btn of this.buttons) btn.el.disabled = !btn.refresh(entity, me);
  }

  private renderBuilding(b: BuildingSnapshot, me: PlayerSnapshot, mine: boolean): void {
    const lines: string[] = [];
    switch (b.kind) {
      case "growbox":
        this.titleEl.textContent = "Growbox";
        lines.push(
          b.plant === null
            ? "Beet: leer"
            : b.plant >= 1
              ? "Pflanze: REIF — ernten!"
              : `Pflanze: ${Math.round(b.plant * 100)} % (${GROW_TIME_S} s Wachstum)`,
        );
        lines.push(`Samen dabei: ${me.inv.seeds}`);
        break;
      case "trockenraum":
        this.titleEl.textContent = "Trockenraum";
        lines.push(`Trocknet: ${b.drying.length} (je ${DRY_TIME_S} s)`);
        lines.push(`Fertig: ${b.dried}`);
        lines.push(`Frei: ${DRY_CAPACITY - b.drying.length - b.dried}/${DRY_CAPACITY}`);
        lines.push(`Ernte dabei: ${me.inv.harvest}`);
        break;
      case "packtisch":
        this.titleEl.textContent = "Packtisch";
        lines.push(`Warteschlange: ${b.queue}`);
        lines.push(b.packing === null ? "In Arbeit: —" : `In Arbeit: ${Math.round(b.packing * 100)} % (${PACK_TIME_S} s)`);
        lines.push(`Fertige Baggies: ${b.baggies} (${BAGGIES_PER_DRIED} je Einheit)`);
        lines.push(`Weed dabei: ${me.inv.dried}`);
        break;
    }
    if (!mine) lines.unshift(`Gehört ${b.owner} — nur der Besitzer kann hier arbeiten.`);
    this.bodyEl.innerHTML = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
    this.refreshButtons(b, me);
  }

  private renderNpc(n: NpcSnapshot, me: PlayerSnapshot): void {
    this.titleEl.textContent = "Passant";
    const price = baggiePriceAt(this.priceFactors, Math.floor(n.x), Math.floor(n.y));
    const factor = this.priceFactors[districtIdAt(Math.floor(n.x), Math.floor(n.y))]!;
    const lines = [
      `Distrikt-Faktor: ×${factor.toFixed(2)}`,
      `Baggie-Preis hier: ${price} € (schmutzig)`,
      n.cooldown > 0 ? `Hat gerade gekauft — wartet noch ${n.cooldown} s` : "Kaufbereit",
      `Baggies dabei: ${me.inv.baggies}`,
    ];
    this.bodyEl.innerHTML = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
    const sellBtn = this.buttons[0];
    if (sellBtn) sellBtn.el.textContent = `1 Baggie verkaufen (+${price} €)`;
    this.refreshButtons(n, me);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
