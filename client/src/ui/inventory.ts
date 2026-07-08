import type { PlayerSnapshot } from "@koks/shared";

/** Übersichtliches Inventar-Panel (Taste I) — gruppierte Vollansicht neben der kompakten HUD-Leiste. */
export class InventoryScreen {
  private readonly root = document.getElementById("inventory")!;
  private readonly bodyEl = document.getElementById("inventory-body")!;
  private latest: PlayerSnapshot | null = null;

  constructor() {
    (document.getElementById("inventory-close") as HTMLButtonElement).onclick = () => this.close();
    this.root.hidden = true;
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
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Bei jedem Snapshot aufrufen — gerendert wird nur, wenn der Screen offen ist. */
  update(me: PlayerSnapshot | undefined): void {
    this.latest = me ?? null;
    if (this.isOpen()) this.render();
  }

  private render(): void {
    if (!this.latest) return;
    const p = this.latest;
    const section = (title: string) => `<div class="inv-section-title">${title}</div>`;
    const row = (label: string, value: string) =>
      `<div class="inv-row"><span>${label}</span><span class="inv-row-value">${value}</span></div>`;
    this.bodyEl.innerHTML = [
      section("Geld"),
      row("Sauber", `${p.money.clean} €`),
      row("Schmutzig", `${p.money.dirty} €`),
      row("Heat", `${Math.round(p.heat)}`),
      section("Weed-Kette"),
      row("Samen", `${p.inv.seeds}`),
      row("Ernte (roh)", `${p.inv.harvest}`),
      row("Weed (getrocknet)", `${p.inv.dried}`),
      row("Baggies", `${p.inv.baggies}`),
      section("Meth-Kette"),
      row("Chemikalien", `${p.inv.chemicals}`),
      row("Meth-Baggies", `${p.inv.methBaggies}`),
    ].join("");
  }
}
