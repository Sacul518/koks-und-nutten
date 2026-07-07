import type { PlayerSnapshot } from "@koks/shared";

/** Ein Wert im HUD: 16×16-Icon (falls vorhanden), sonst Text-Label. */
interface Stat {
  valueEl: HTMLElement;
  last: number;
}

const ICON_DIR = "/assets/icons";

/** HUD oben rechts: Geld (sauber/schmutzig getrennt) + Tascheninhalt, dazu Toasts. */
export class Hud {
  private readonly stats = new Map<string, Stat>();
  private readonly toastEl: HTMLElement;
  private toastTimer: number | null = null;

  constructor() {
    this.toastEl = document.getElementById("toast")!;
    const money = document.getElementById("money-row")!;
    const inv = document.getElementById("inv-row")!;
    // bei Rejoin nicht doppelt aufbauen
    money.replaceChildren();
    inv.replaceChildren();
    this.addStat(money, "clean", "geld-sauber.png", "Sauber", "€", "stat-clean");
    this.addStat(money, "dirty", "geld-schmutzig.png", "Schmutzig", "€", "stat-dirty");
    this.addStat(inv, "seeds", "samen.png", "Samen", "");
    this.addStat(inv, "harvest", "ernte.png", "Ernte", "");
    this.addStat(inv, "dried", "weed.png", "Weed", "");
    this.addStat(inv, "baggies", "baggie.png", "Baggies", "");
  }

  update(me: PlayerSnapshot): void {
    this.setStat("clean", me.money.clean);
    this.setStat("dirty", me.money.dirty);
    this.setStat("seeds", me.inv.seeds);
    this.setStat("harvest", me.inv.harvest);
    this.setStat("dried", me.inv.dried);
    this.setStat("baggies", me.inv.baggies);
  }

  toast(text: string, kind: "ok" | "error"): void {
    this.toastEl.textContent = text;
    this.toastEl.className = kind;
    this.toastEl.hidden = false;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, 2500);
  }

  private addStat(
    parent: HTMLElement,
    key: string,
    iconFile: string,
    label: string,
    suffix: string,
    extraClass = "",
  ): void {
    const wrap = document.createElement("span");
    wrap.className = `stat ${extraClass}`.trim();

    // Icon vom parallelen Asset-Agenten nutzen, falls vorhanden — sonst Text-Label.
    const labelEl = document.createElement("span");
    labelEl.className = "stat-label";
    labelEl.textContent = label;
    const icon = new Image(16, 16);
    icon.className = "stat-icon";
    icon.alt = label;
    icon.src = `${ICON_DIR}/${iconFile}`;
    icon.onload = () => labelEl.replaceChildren(icon);

    const valueEl = document.createElement("span");
    valueEl.className = "stat-value";
    valueEl.textContent = `0${suffix ? ` ${suffix}` : ""}`;

    wrap.append(labelEl, valueEl);
    parent.appendChild(wrap);
    this.stats.set(key, { valueEl, last: 0 });
    // Suffix am Element merken, damit setStat ihn nicht kennen muss
    valueEl.dataset.suffix = suffix;
  }

  private setStat(key: string, value: number): void {
    const stat = this.stats.get(key);
    if (!stat || stat.last === value) return;
    stat.last = value;
    const suffix = stat.valueEl.dataset.suffix;
    stat.valueEl.textContent = suffix ? `${value} ${suffix}` : String(value);
  }
}
