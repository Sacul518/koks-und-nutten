import {
  BRIBE_COST_PER_PERIOD,
  BUILDING_SPECS,
  DISTRICT_GRID,
  LEDGER_PERIOD_S,
  WORKER_SPECS,
  ledgerExpenses,
  ledgerProfit,
  type BuildingSnapshot,
  type ClientMessage,
  type DistrictSnapshot,
  type LedgerLive,
  type LedgerPeriod,
  type PlayerSnapshot,
  type WorkerSnapshot,
} from "@koks/shared";

/** Serienfarben (dataviz-geprüft für dunklen Grund: Lightness, Chroma, CVD, Kontrast). */
const COLOR_INCOME = "#46a463";
const COLOR_EXPENSES = "#5f7ff2";
const COLOR_GRID = "#2a2d38";
const COLOR_MUTED = "#9a9aa8";

interface SnapshotData {
  ledger: LedgerLive;
  workers: WorkerSnapshot[];
  buildings: BuildingSnapshot[];
  me: PlayerSnapshot | undefined;
  districts: DistrictSnapshot[];
}

/**
 * Vollbild-Ledger (Taste L): Team-weite Einnahmen/Ausgaben/Produktion pro Periode,
 * Verlaufsgraph (Canvas, ohne Chart-Library) und Personal-Liste mit Entlassen-Buttons.
 */
export class LedgerScreen {
  private readonly root = document.getElementById("ledger")!;
  private readonly periodEl = document.getElementById("ledger-period")!;
  private readonly tableEl = document.getElementById("ledger-table")!;
  private readonly canvas = document.getElementById("ledger-chart") as HTMLCanvasElement;
  private readonly chartInfoEl = document.getElementById("ledger-chart-info")!;
  private readonly bribeButton = document.getElementById("bribe-button") as HTMLButtonElement;
  private readonly districtsEl = document.getElementById("ledger-districts")!;
  private readonly personalEl = document.getElementById("ledger-personal")!;

  private history: LedgerPeriod[] = [];
  private latest: SnapshotData | null = null;
  private chartSignature = "";
  private personalSignature = "";
  private readonly personalStatus = new Map<string, HTMLElement>();

  constructor(private readonly send: (msg: ClientMessage) => void, private readonly priceFactors: number[]) {
    (document.getElementById("ledger-close") as HTMLButtonElement).onclick = () => this.close();
    this.canvas.onpointerdown = (e) => this.inspectChart(e);
    this.bribeButton.onclick = () => {
      const bribing = this.latest?.me?.bribing ?? false;
      this.send({ t: "bribe", on: !bribing });
    };
    this.root.hidden = true;
    this.chartSignature = "";
    this.personalSignature = "";
    this.personalEl.replaceChildren();
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  open(): void {
    this.root.hidden = false;
    this.chartSignature = ""; // Canvas-Größe kann sich geändert haben → neu zeichnen
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  setHistory(history: LedgerPeriod[]): void {
    this.history = history;
    if (this.isOpen()) this.render();
  }

  /** Bei jedem Snapshot aufrufen — gerendert wird nur, wenn der Screen offen ist. */
  update(data: SnapshotData): void {
    this.latest = data;
    if (this.isOpen()) this.render();
  }

  private render(): void {
    if (!this.latest) return;
    const { ledger } = this.latest;
    const remaining = Math.max(0, Math.round(LEDGER_PERIOD_S - ledger.elapsedS));
    this.periodEl.textContent = `Periode #${ledger.n} · endet in ${remaining} s · Team-weit`;
    this.renderTable(ledger);
    this.renderChart(ledger);
    this.renderBribe();
    this.renderDistricts();
    this.renderPersonal();
  }

  // ── Bestechung ───────────────────────────────────────────────────────────

  private renderBribe(): void {
    const bribing = this.latest?.me?.bribing ?? false;
    this.bribeButton.textContent = bribing
      ? "Bestechung: AN — abschalten"
      : `Bestechung: AUS (${BRIBE_COST_PER_PERIOD} €/Periode) — anschalten`;
    this.bribeButton.classList.toggle("bribe-active", bribing);
  }

  // ── Reviere ─────────────────────────────────────────────────────────────────

  private renderDistricts(): void {
    const districts = this.latest!.districts;
    this.districtsEl.replaceChildren();
    for (let d = 0; d < DISTRICT_GRID * DISTRICT_GRID; d++) {
      const gx = d % DISTRICT_GRID;
      const gy = Math.floor(d / DISTRICT_GRID);
      const dist = districts.find((x) => x.id === d);
      const control = dist?.control ?? 0.5;
      const tile = document.createElement("div");
      tile.className = "district-tile";
      tile.style.background = `hsl(${Math.round(control * 120)}, 55%, 22%)`;
      tile.innerHTML = [
        `<div class="district-tile-pos">${gx + 1}|${gy + 1}</div>`,
        `<div>${Math.round(control * 100)} % Kontrolle</div>`,
        `<div>×${(dist?.priceFactor ?? 1).toFixed(2)} Preis</div>`,
        `<div>×${(dist?.policeMultiplier ?? 1).toFixed(2)} Polizei</div>`,
      ].join("");
      this.districtsEl.appendChild(tile);
    }
  }

  // ── Zahlen-Tabelle ─────────────────────────────────────────────────────────

  private renderTable(current: LedgerLive): void {
    const sum = (get: (p: LedgerPeriod) => number) =>
      this.history.reduce((acc, p) => acc + get(p), 0) + get(current);
    const last = this.history[this.history.length - 1] ?? null;
    const euro = (v: number) => `${v} €`;
    const cell = (p: LedgerPeriod | null, get: (p: LedgerPeriod) => number, fmt: (v: number) => string) =>
      p === null ? "—" : fmt(get(p));

    interface Row {
      label: string;
      get: (p: LedgerPeriod) => number;
      fmt?: (v: number) => string;
      cls?: string;
    }
    const rows: Row[] = [
      { label: "Einnahmen (Verkäufe)", get: (p) => p.income, fmt: euro, cls: "ledger-income" },
      { label: "Ausgaben", get: ledgerExpenses, fmt: euro, cls: "ledger-expense" },
      { label: "· Samen", get: (p) => p.seedCost, fmt: euro, cls: "ledger-sub" },
      { label: "· Löhne", get: (p) => p.wageCost, fmt: euro, cls: "ledger-sub" },
      { label: "· Bau", get: (p) => p.buildCost, fmt: euro, cls: "ledger-sub" },
      { label: "· Razzien", get: (p) => p.raidLoss, fmt: euro, cls: "ledger-sub" },
      { label: "· Bestechung", get: (p) => p.bribeCost, fmt: euro, cls: "ledger-sub" },
      { label: "· Geldwäsche-Gebühr", get: (p) => p.launderFee, fmt: euro, cls: "ledger-sub" },
      { label: "· Abgefangene Kuriere", get: (p) => p.interceptLoss, fmt: euro, cls: "ledger-sub" },
      { label: "Gewinn", get: ledgerProfit, fmt: (v) => `${v >= 0 ? "+" : ""}${v} €`, cls: "ledger-profit" },
      { label: "Geerntet", get: (p) => p.harvested },
      { label: "Getrocknet", get: (p) => p.dried },
      { label: "Verpackt", get: (p) => p.packed },
      { label: "Verkauft (Baggies)", get: (p) => p.sales },
    ];

    const html = [
      `<tr><th></th><th>Aktuell</th><th>Letzte</th><th>Gesamt</th></tr>`,
      ...rows.map((r) => {
        const fmt = r.fmt ?? String;
        const profitCls =
          r.cls === "ledger-profit" ? (ledgerProfit(current) >= 0 ? " ledger-pos" : " ledger-neg") : "";
        return (
          `<tr class="${r.cls ?? ""}${profitCls}"><td>${r.label}</td>` +
          `<td>${fmt(r.get(current))}</td>` +
          `<td>${cell(last, r.get, fmt)}</td>` +
          `<td>${fmt(sum(r.get))}</td></tr>`
        );
      }),
    ];
    this.tableEl.innerHTML = html.join("");
  }

  // ── Verlaufsgraph (Canvas) ─────────────────────────────────────────────────

  private chartPeriods(current: LedgerLive): LedgerPeriod[] {
    return [...this.history, current];
  }

  private renderChart(current: LedgerLive): void {
    const periods = this.chartPeriods(current);
    const width = this.canvas.clientWidth;
    const signature = `${width}|${periods.map((p) => `${p.n}:${p.income}:${ledgerExpenses(p)}`).join(",")}`;
    if (signature === this.chartSignature) return;
    this.chartSignature = signature;

    const height = this.canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padL = 44;
    const padR = 8;
    const padT = 8;
    const padB = 20;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    if (plotW <= 0 || plotH <= 0) return;

    const maxVal = Math.max(10, ...periods.map((p) => Math.max(p.income, ledgerExpenses(p))));
    const yMax = niceCeil(maxVal);
    const y = (v: number) => padT + plotH - (v / yMax) * plotH;

    // Gitter: dezent, 4 Linien + Beschriftung
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      ctx.strokeStyle = COLOR_GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y(v));
      ctx.lineTo(width - padR, y(v));
      ctx.stroke();
      ctx.fillStyle = COLOR_MUTED;
      ctx.fillText(`${Math.round(v)} €`, padL - 6, y(v));
    }

    // Balkenpaare: Einnahmen | Ausgaben, 2px Lücke, laufende Periode halbtransparent
    const group = plotW / periods.length;
    const barW = Math.max(2, Math.min(16, (group - 6) / 2));
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    periods.forEach((p, i) => {
      const cx = padL + group * i + group / 2;
      const isLive = i === periods.length - 1;
      ctx.globalAlpha = isLive ? 0.55 : 1;
      drawBar(ctx, cx - barW - 1, y(p.income), barW, padT + plotH, COLOR_INCOME);
      drawBar(ctx, cx + 1, y(ledgerExpenses(p)), barW, padT + plotH, COLOR_EXPENSES);
      ctx.globalAlpha = 1;
      // X-Beschriftung: nicht jede Periode, sonst Kollision
      const step = Math.max(1, Math.ceil(periods.length / 8));
      if ((periods.length - 1 - i) % step === 0) {
        ctx.fillStyle = COLOR_MUTED;
        ctx.fillText(`#${p.n}`, cx, height - 6);
      }
    });

    // Direktbeschriftung: letzte abgeschlossene Periode
    const lastDone = periods.length >= 2 ? periods[periods.length - 2]! : null;
    if (lastDone) {
      const i = periods.length - 2;
      const cx = padL + group * i + group / 2;
      ctx.fillStyle = "#e8e8ee";
      ctx.fillText(`${lastDone.income}`, cx - barW / 2 - 1, y(lastDone.income) - 3);
      ctx.fillText(`${ledgerExpenses(lastDone)}`, cx + barW / 2 + 1, y(ledgerExpenses(lastDone)) - 3);
    }

    if (this.history.length === 0) {
      this.chartInfoEl.textContent = "Noch keine abgeschlossene Periode — die laufende ist halbtransparent.";
    }
  }

  /** Tap auf den Graphen: Werte der angetippten Periode als Textzeile. */
  private inspectChart(e: PointerEvent): void {
    if (!this.latest) return;
    const periods = this.chartPeriods(this.latest.ledger);
    const rect = this.canvas.getBoundingClientRect();
    const plotW = rect.width - 44 - 8;
    const i = Math.floor(((e.clientX - rect.left - 44) / plotW) * periods.length);
    const p = periods[Math.max(0, Math.min(periods.length - 1, i))];
    if (!p) return;
    const live = i === periods.length - 1 ? " (läuft)" : "";
    this.chartInfoEl.textContent =
      `Periode #${p.n}${live}: Einnahmen ${p.income} € · Ausgaben ${ledgerExpenses(p)} € · ` +
      `Gewinn ${ledgerProfit(p) >= 0 ? "+" : ""}${ledgerProfit(p)} € · ${p.sales} verkauft`;
  }

  // ── Personal-Liste ─────────────────────────────────────────────────────────

  private renderPersonal(): void {
    const { workers, buildings, me } = this.latest!;
    const signature = workers.map((w) => `${w.id}:${w.paused ? 1 : 0}`).join(",") + `|${me?.name ?? ""}`;
    if (signature !== this.personalSignature) {
      this.personalSignature = signature;
      this.rebuildPersonal(workers, buildings, me);
    }
    for (const w of workers) {
      const el = this.personalStatus.get(w.id);
      if (el) el.textContent = this.workerStatus(w);
    }
  }

  private rebuildPersonal(
    workers: WorkerSnapshot[],
    buildings: BuildingSnapshot[],
    me: PlayerSnapshot | undefined,
  ): void {
    this.personalStatus.clear();
    this.personalEl.replaceChildren();
    if (workers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ledger-empty";
      empty.textContent = "Kein Personal — anheuern im Panel des jeweiligen Gebäudes (Growbox/Trockenraum/Packtisch).";
      this.personalEl.appendChild(empty);
      return;
    }
    const buildingName = (id: string | null): string => {
      if (id === null) return "?";
      const b = buildings.find((x) => x.id === id);
      return b ? `${BUILDING_SPECS[b.kind].name} ${b.id}` : id;
    };
    for (const w of workers) {
      const row = document.createElement("div");
      row.className = "personal-row" + (w.paused ? " personal-paused" : "");

      const info = document.createElement("div");
      info.className = "personal-info";
      const spec = WORKER_SPECS[w.kind];
      let assignment = buildingName(w.buildingId);
      if (w.kind === "kurier") assignment += ` → ${buildingName(w.targetBuildingId)}`;
      if (w.kind === "dealer" && w.district !== null) {
        const gx = w.district % DISTRICT_GRID;
        const gy = Math.floor(w.district / DISTRICT_GRID);
        assignment += ` → Distrikt ${gx + 1}|${gy + 1} ×${this.priceFactors[w.district]!.toFixed(2)}`;
      }
      const title = document.createElement("div");
      title.textContent = `${spec.name} · ${assignment} · ${spec.wage} €/Periode · ${w.owner}`;
      const status = document.createElement("div");
      status.className = "personal-status";
      status.textContent = this.workerStatus(w);
      info.append(title, status);

      const fire = document.createElement("button");
      fire.type = "button";
      fire.className = "personal-fire";
      fire.textContent = "Entlassen";
      const mine = me !== undefined && w.owner.toLowerCase() === me.name.toLowerCase();
      fire.disabled = !mine;
      fire.onclick = () => this.send({ t: "fire", workerId: w.id });

      row.append(info, fire);
      this.personalEl.appendChild(row);
      this.personalStatus.set(w.id, status);
    }
  }

  private workerStatus(w: WorkerSnapshot): string {
    if (w.paused) return "PAUSIERT — Lohn konnte nicht gezahlt werden";
    if (w.carrying > 0) return `aktiv · trägt ${w.carrying}`;
    return "aktiv";
  }
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, bottom: number, color: string): void {
  const h = bottom - top;
  if (h <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  const r = Math.min(2, w / 2, h);
  ctx.roundRect(x, top, w, h, [r, r, 0, 0]);
  ctx.fill();
}

/** Rundet auf eine "schöne" Achsen-Obergrenze (1/2/5 × 10^k). */
function niceCeil(v: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) {
    if (m * mag >= v) return m * mag;
  }
  return 10 * mag;
}
