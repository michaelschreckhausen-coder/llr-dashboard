# DESIGN-SYSTEM.md ⭐ — CI der App (1:1 leadesk.de)

> Damit jede neue Ansicht **automatisch** konsistent aussieht, statt hinterher angeglichen zu werden. Quelle der Wahrheit sind die Tokens/Klassen in `src/index.css` (dieses Doc erklärt sie + die Regeln dahinter). Bei Abweichung gilt der Live-Stand von `leadesk.de`.

## Grundprinzipien (Julians Vorgaben)

1. **Verlauf nur für den einen Haupt-CTA** je Ansicht. Alle anderen Aktionsbuttons = **Navy solid**. Nie flächig Verlauf.
2. **Ruhige Hover.** Nur der Verlaufs-CTA hebt ab (`translateY(-2px)`), der Rest wechselt nur dezent Farbe/Helligkeit. Kein „alles springt".
3. **Dünne Schrift** in Buttons/Dropdowns (500), nicht fett.
4. **Ein Dropdown-Look** app-weit: gleiche Textfarbe für Platzhalter *und* Wert (dunkel), gleiche Border/Radius.
5. **Navy = Primary-Surface, Cyan/Blau = Akzent.** Solide Füllungen sind Navy; `color:`/Icons/Borders dürfen Akzentblau sein.
6. **Inline-Styles können kein `:hover`** → neue Buttons/Dropdowns **immer** über `lk-*`-Klassen, nicht inline. `style` nur für Width/Margin-Overrides.

## Tokens (aus `:root`)

| Zweck | Variable | Wert |
|---|---|---|
| Primary (Navy) | `--primary` | `var(--wl-primary, rgb(0,48,96))` |
| Primary Hover | `--primary-hover` | `rgb(0,32,72)` |
| Akzent Cyan | `--accent` | `#16A8DC` |
| Akzent Blau | `--accent-mid` | `#0A6FB0` |
| Marken-Verlauf 120° | `--grad` | `linear-gradient(120deg,#16A8DC 0%,#0A6FB0 48%,#003060 100%)` |
| Radius Button / Card / sm | `--radius-btn/card/sm` | `8 / 16 / 10 px` |
| Shadow Card / Hover | `--shadow-card/-hover` | `0 10px 30px rgba(14,22,51,.06)` / `0 18px 46px rgba(14,22,51,.12)` |
| BG Soft | `--bg-body` | `#F6F7FB` |

**Tints** (Karten-Hintergründe): `--tint-blue #EEF4FE`, `--tint-cyan #EAF8FE`, `--tint-lav #F2F1FE`, `--tint-green #EBFAF3`, `--tint-navy #EDF2F8`, `--tint-peach #FFF7F2`.
**Kategoriefarben** (funktionale Datenkodierung, **nicht** als Chrome-Akzent verwenden): `--ci-orange #E07B39`, `--ci-purple #7A5AF8`, `--ci-li #2E6BE6`, `--ci-content #12B886`, `--ci-success #039855`, `--ci-pink #DD2A7B`.

## Schrift

**Inter**, self-hosted (`public/fonts/inter-{400..800}.woff2`) — kein Google-Fonts-Call (DSGVO/ISO). Keine Schreibschrift mehr (Caveat ausgemustert). Überschriften **Inter 800**. Body 400/500.

## Buttons — welche Klasse wann

| Klasse | Einsatz | Optik |
|---|---|---|
| `lk-btn lk-btn-cta` | **der eine** Haupt-CTA je Ansicht (Speichern/Anlegen/Generieren…) | Verlauf, hebt bei Hover ab |
| `lk-btn lk-btn-navy` | alle übrigen primären Aktionen | Navy solid, dezenter Hover |
| `lk-btn lk-btn-ghost` | sekundär | weiß + 1px Border, Hover → Cyan-Tint |
| `lk-btn lk-btn-danger` / `-danger-ghost` | Löschen/destruktiv | Rot |
| `lk-btn lk-btn-strike` / `-strike-ghost` | Strike2-Bereich | **Orange `#F97316`** (bewusst eigene Farbe) |
| Größen | `lk-btn-lg` / `lk-btn-sm` / `lk-btn-block` | |

Basis `.lk-btn`: Inter 13px/500, Radius 8, `padding 8×15`. `:disabled` ist zentral gestylt (opacity .55, kein Hover).

## Dropdowns

Alle eigenen Dropdowns (PillSelect / `Form.Select`) nutzen `.lk-dd-trigger`: 1.5px Border, Radius 9, `min-height 40`, **font 500/13px**, Textfarbe `--text-primary` (Platzhalter = Wert, **eine** Farbe). Optionen `.lk-dd-opt` mit Cyan-Tint-Hover. **Keine nativen `<select>`** in gerenderten Views.

## Eyebrows, Karten, Empty-States

- **Eyebrow:** `.lk-eyebrow` — Inter 700, uppercase, Letter-Spacing, mit Verlaufs-Strich (`::before`). Strike2-Variante: `lk-eyebrow-strike` (Orange-Strich).
- **Karten:** `.lk-card` (Radius 16, 1px Border, `--shadow-card`), optional `.lk-card-hover`. ⚠️ Nicht jeden Radius-14-Container beschatten — das sind oft **Modals** mit eigenem Shadow.
- **Leere Screens:** `EmptyOrb.jsx` / `.lk-orb` — Pulsing-Rings um das Favicon-Zeichen, statt fettem Icon.

## Fallstricke aus dem CI-Rollout (nicht wiederholen)

- **Toggles/Filter/Tabs nie zu `lk-btn` machen.** Jeder zustandsabhängige Background (`active ? X : Y`, `aria-pressed`, Icon-only mit `width`+`height`) ist ein Toggle → Finger weg, sonst wird er zum statischen Verlaufsblock.
- **Token-Replace:** Member-Access (`COLORS.primary`) und Bool-Props (`primary ? …`) beim Suchen/Ersetzen ausschließen; nach jedem Codemod `build` + grep auf Korruption.
- **Kein blinder `primaryBtn`→cta-Sweep** — es gibt Dutzende Ad-hoc-Button-Konstanten (teils Icon-Kreise), die dabei brechen. Pro Seite prüfen.
- Nach jeder Style-/Select-Konvertierung **Browser-Check** — der Build fängt Runtime-Crashes nicht.
- Pipeline-/Stage-/Avatar-**Kategoriefarben bewusst belassen** (Datenkodierung, kein Off-Brand).
