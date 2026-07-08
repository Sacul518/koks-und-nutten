const HINT_KEY = "koks-show-hint";
const PERF_KEY = "koks-perf-mode";

/** Performance-Modus: rendert mit fester Auflösung 1 statt devicePixelRatio (spart GPU-Füllrate auf Retina-iPads). */
export function loadPerfMode(): boolean {
  return localStorage.getItem(PERF_KEY) === "1";
}

export function loadShowHint(): boolean {
  return localStorage.getItem(HINT_KEY) !== "0";
}

/** Settings-Panel (Taste O): Steuerungs-Hinweis ein/aus, Performance-Modus, Spiel verlassen. */
export class SettingsScreen {
  private readonly root = document.getElementById("settings")!;
  private readonly bodyEl = document.getElementById("settings-body")!;
  private readonly hintEl = document.getElementById("controls-hint")!;

  constructor(private readonly onLeave: () => void) {
    (document.getElementById("settings-close") as HTMLButtonElement).onclick = () => this.close();
    this.root.hidden = true;
    this.hintEl.hidden = !loadShowHint();
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

  private render(): void {
    this.bodyEl.replaceChildren();

    const hintRow = document.createElement("div");
    hintRow.className = "settings-row";
    const hintLabel = document.createElement("label");
    const hintCheck = document.createElement("input");
    hintCheck.type = "checkbox";
    hintCheck.checked = loadShowHint();
    hintCheck.onchange = () => {
      localStorage.setItem(HINT_KEY, hintCheck.checked ? "1" : "0");
      this.hintEl.hidden = !hintCheck.checked;
    };
    hintLabel.append(hintCheck, document.createTextNode("Steuerungs-Hinweis anzeigen"));
    hintRow.appendChild(hintLabel);
    this.bodyEl.appendChild(hintRow);

    const perfRow = document.createElement("div");
    perfRow.className = "settings-row";
    const perfLabel = document.createElement("label");
    const perfCheck = document.createElement("input");
    perfCheck.type = "checkbox";
    perfCheck.checked = loadPerfMode();
    perfCheck.onchange = () => {
      localStorage.setItem(PERF_KEY, perfCheck.checked ? "1" : "0");
      location.reload();
    };
    perfLabel.append(perfCheck, document.createTextNode("Performance-Modus (niedrigere Auflösung, hilft auf älteren iPads)"));
    perfRow.appendChild(perfLabel);
    const perfHint = document.createElement("div");
    perfHint.className = "settings-hint";
    perfHint.textContent = "Wirkt nach dem Neuladen der Seite.";
    perfRow.appendChild(perfHint);
    this.bodyEl.appendChild(perfRow);

    const leaveBtn = document.createElement("button");
    leaveBtn.type = "button";
    leaveBtn.id = "leave-button";
    leaveBtn.className = "action-btn";
    leaveBtn.textContent = "Spiel verlassen";
    leaveBtn.onclick = () => this.onLeave();
    this.bodyEl.appendChild(leaveBtn);
  }
}
