# Clean Duo — Design System & UI Handoff

Documento tecnico per replicare **fedelmente** lo stile grafico, l'architettura mobile-first e le interazioni di Clean Duo (e della "famiglia" MoneyDuo) su altre web app.
Ogni regola qui sotto è ricavata dal codice reale del repository: gli snippet sono estratti dai file indicati e i valori sono quelli in produzione.

> **Per un agente AI.** Leggi prima la sezione 0 (differenze rispetto alle descrizioni "teoriche" del Liquid Glass) e poi la sezione 5 (prompt di bootstrap).
> I file sorgente di riferimento sono elencati nell'**Appendice A**: quando devi replicare un componente, copia il file e adattane solo i dati.

## Indice
0. [Sintesi e verità sul codice](#0-sintesi-e-verità-sul-codice)
1. [Identità visiva e filosofia Liquid Glass](#1-identità-visiva-e-filosofia-liquid-glass)
2. [Architettura layout e navigazione mobile-first](#2-architettura-layout-e-navigazione-mobile-first)
3. [Libreria componenti UI](#3-libreria-componenti-ui)
4. [Elementi illustrativi e mascotte (i gattini)](#4-elementi-illustrativi-e-mascotte-i-gattini)
5. [Come applicare questo Design System a un nuovo progetto](#5-come-applicare-questo-design-system-a-un-nuovo-progetto)
- [Appendice A — Mappa dei file](#appendice-a--mappa-dei-file-da-copiare)
- [Appendice B — Checklist di conformità](#appendice-b--checklist-di-conformità)
- [Appendice C — Limiti noti](#appendice-c--limiti-noti-e-cose-non-implementate)

---

## 0. Sintesi e verità sul codice

**Stack:** React 19 · Vite 8 · TypeScript · Tailwind CSS **3.4** (non 4) · Framer Motion 14 · lucide-react · vite-plugin-pwa. Nessun webfont, nessuna libreria di componenti UI, nessun Lottie, nessun SVG illustrativo.

**Il design in una frase:** *app mobile-first dal tono caldo e giocoso, con due temi (Mochi chiaro crema/arancio, Zenitsu scuro ardesia/oro), contenuti su **card piene** e "vetro liquido" riservato a navigazione, comandi, fogli e avvisi che galleggiano sopra uno sfondo vivo; due gattini fanno capolino sulle schermate.*

### 0.1 Come il codice reale si discosta dal "Liquid Glass da manuale"
Chi parte da un brief del tipo «`bg-white/60 dark:bg-slate-900/50 backdrop-blur-2xl`, mesh gradient pastello, glass ovunque» **non** otterrà questo stile. Differenze **volute** e da rispettare:

| Brief "teorico" | Cosa fa davvero Clean Duo | Perché |
|---|---|---|
| Colori Tailwind fissi (`bg-white/60`, `slate-900/50`) | **Token CSS** in RGB (`--glass`, `--surface`, `--ink`…) esposti come colori Tailwind (`bg-surface`, `text-ink`…). Nessuna classe `dark:` nei componenti | Un solo punto di verità per due temi + tema manuale/automatico senza classi duplicate |
| Glass su ogni card | **Card piene** (`.card`, opache). Il vetro è solo su: barra di navigazione, pulsanti, FAB, fogli (bottom sheet), toast | Leggibilità dei contenuti e framerate su mobile (vedi §1.8) |
| Mesh gradient CSS | **3 blob colorati sfocati e animati** (`div` con `blur-3xl`) su `bg-bg` | Danno al vetro qualcosa da sfocare/rifrangere con costo contenuto, animati solo con `transform` |
| Light mode pastello multicolore | **Mochi**: crema `#fff7ee` + arancio bruciato `#b0520f`. **Zenitsu**: ardesia `#16181d` + oro `#e6bb78` | Palette derivata dai due gattini (identità di brand) |
| Mascotte come SVG/Lottie animati | **PNG raster statici** (3 file) usati come immagini decorative | Vedi §4: non esiste alcuna animazione dei gattini |
| Font "SF Pro / Inter" caricati | **Stack di sistema** con `ui-rounded` in testa (SF Pro Rounded su Apple) | Zero richieste di rete, aspetto "morbido" nativo |
| Header che si comprimono allo scroll | **Header statico** che scorre con il contenuto | Semplicità; nessun header sticky/collassabile nel progetto |

### 0.2 Principi (le regole da non violare)
1. **Contenuto pieno, controlli di vetro.** Mai testo lungo o liste su una superficie `backdrop-filter`.
2. **Un token, un significato.** Mai colori esadecimali nei componenti. Eccezioni reali e uniche: colori di stanza/membro e relativi default (dati scelti dall'utente), coriandoli della celebrazione, riquadri di anteprima del selettore tema (`#fff7ee`/`#16181d`), colore di ripiego dell'avatar (`#cbd5e1`) e `THEME_COLOR` per la barra di stato.
3. **Tutto dipende dai token.** Niente `dark:`: i temi cambiano solo le variabili CSS.
4. **Mobile prima.** Layout da 360–430 px; su desktop l'app resta una "colonna telefono" centrata (`max-w-md`).
5. **Tocco generoso.** Obiettivi ≥ 40 px; feedback immediato (`active:scale-95`) e aptico dove possibile.
6. **Il bordo alto è la luce.** Ogni superficie di vetro ha un riflesso speculare sul bordo alto (`inset 0 1.5px 0`).

---

## 1. Identità visiva e filosofia Liquid Glass

### 1.1 Meccanismo dei token (copiare tale e quale)

I colori sono **terne RGB senza `rgb()`** così Tailwind può applicare l'opacità (`bg-brand/15`) e il CSS può comporre sfumature (`rgb(var(--brand) / 0.14)`).

`tailwind.config.js`
```js
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'), surface: token('surface'), ink: token('ink'), muted: token('muted'), line: token('line'),
        brand: token('brand'), onbrand: token('onbrand'),
        inc: token('inc'), exp: token('exp'), trf: token('trf'),
      },
      fontFamily: {
        sans: ['ui-rounded', 'SF Pro Rounded', 'Nunito', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        float1: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(30px,40px) scale(1.15)' } },
        float2: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(-40px,30px) scale(1.1)' } },
        float3: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(20px,-40px) scale(1.2)' } },
      },
      animation: {
        float1: 'float1 18s ease-in-out infinite',
        float2: 'float2 22s ease-in-out infinite',
        float3: 'float3 26s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
```
> `darkMode` **non** è configurato: non si usa mai `dark:`.

### 1.2 Palette — tema **Mochi** (chiaro) e **Zenitsu** (scuro)

| Token | Classe Tailwind | **Mochi** RGB | Mochi HEX | **Zenitsu** RGB | Zenitsu HEX | Uso |
|---|---|---|---|---|---|---|
| `--bg` | `bg-bg` | `255 247 238` | `#fff7ee` | `22 24 29` | `#16181d` | Sfondo pagina, campi input |
| `--surface` | `bg-surface` | `255 253 249` | `#fffdf9` | `33 36 43` | `#21242b` | Card piene, segmented attivo, cursori |
| `--ink` | `text-ink` | `67 50 42` | `#43322a` | `236 238 242` | `#eceef2` | Testo principale, scrim |
| `--muted` | `text-muted` | `125 106 93` | `#7d6a5d` | `163 169 181` | `#a3a9b5` | Testo secondario, icone inattive |
| `--line` | `border-line` | `240 225 209` | `#f0e1d1` | `53 58 68` | `#353a44` | Bordi, divisori, binari barre, stelle vuote |
| `--brand` | `text-brand`/`bg-brand` | `176 82 15` | `#b0520f` | `230 187 120` | `#e6bb78` | Azione primaria, tab attiva, stelle, accenti |
| `--onbrand` | `text-onbrand` | `255 255 255` | `#ffffff` | `28 23 16` | `#1c1710` | Testo/icone **sopra** `brand` |
| `--inc` | `text-inc` | `35 118 75` | `#23764b` | `111 214 163` | `#6fd6a3` | Positivo / sincronizzato |
| `--exp` | `text-exp` | `192 40 63` | `#c0283f` | `244 144 154` | `#f4909a` | Errore, scaduto, badge numerici |
| `--trf` | `text-trf` | `42 107 153` | `#2a6b99` | `124 196 234` | `#7cc4ea` | Informativo ("tra 2 giorni") |

**Token del vetro e dello sfondo**

| Token | Mochi | Zenitsu | Significato |
|---|---|---|---|
| `--glass` | `255 253 249 / 0.78` | `33 36 43 / 0.72` | Velo del vetro standard |
| `--glass-strong` | `255 253 249 / 0.9` | `33 36 43 / 0.9` | Velo dei fogli (più opaco) |
| `--glass-edge` | `255 255 255 / 0.75` | `255 255 255 / 0.22` | Riflesso speculare sul bordo alto |
| `--glass-edge-soft` | `255 255 255 / 0.35` | `255 255 255 / 0.08` | Bordo perimetrale sottile e riflesso basso |
| `--glass-shade` | `67 50 42 / 0.16` | `0 0 0 / 0.5` | Ombre diffuse del vetro |
| `--blob-a` | `255 160 80 / 0.38` | `230 187 120 / 0.2` | Blob sfondo (arancio / oro) |
| `--blob-b` | `255 205 150 / 0.5` | `124 140 190 / 0.22` | Blob sfondo (pesca / blu ardesia) |
| `--blob-c` | `240 130 110 / 0.28` | `90 110 160 / 0.2` | Blob sfondo (corallo / blu profondo) |

**Dichiarazione CSS completa** (`src/index.css`, parte tokens). Notare la **triplice dichiarazione** dello scuro: `@media` (tema automatico), `[data-theme='dark']` (scelta manuale) e `:root[data-theme='light']` per forzare il chiaro:
```css
:root {
  --bg: 255 247 238;  --surface: 255 253 249;  --ink: 67 50 42;   --muted: 125 106 93;  --line: 240 225 209;
  --brand: 176 82 15; --onbrand: 255 255 255;
  --inc: 35 118 75;   --exp: 192 40 63;         --trf: 42 107 153;
  --glass: 255 253 249 / 0.78;  --glass-strong: 255 253 249 / 0.9;
  --glass-edge: 255 255 255 / 0.75;  --glass-edge-soft: 255 255 255 / 0.35;  --glass-shade: 67 50 42 / 0.16;
  --blob-a: 255 160 80 / 0.38;  --blob-b: 255 205 150 / 0.5;  --blob-c: 240 130 110 / 0.28;
  color-scheme: light dark;
}
:root[data-theme='light'] { color-scheme: light; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: 22 24 29;  --surface: 33 36 43;  --ink: 236 238 242;  --muted: 163 169 181;  --line: 53 58 68;
    --brand: 230 187 120;  --onbrand: 28 23 16;
    --inc: 111 214 163;  --exp: 244 144 154;  --trf: 124 196 234;
    --glass: 33 36 43 / 0.72;  --glass-strong: 33 36 43 / 0.9;
    --glass-edge: 255 255 255 / 0.22;  --glass-edge-soft: 255 255 255 / 0.08;  --glass-shade: 0 0 0 / 0.5;
    --blob-a: 230 187 120 / 0.2;  --blob-b: 124 140 190 / 0.22;  --blob-c: 90 110 160 / 0.2;
    color-scheme: dark;
  }
}
:root[data-theme='dark'] { /* …stessi valori scuri di sopra… */ color-scheme: dark; }
```
> Regola: **ogni nuovo token va dichiarato in tutti e tre i blocchi** (chiaro, `@media` scuro, `[data-theme='dark']`).

### 1.3 Selezione e applicazione del tema

Tre scelte: `auto` (segue il dispositivo), `light` (Mochi), `dark` (Zenitsu). `src/lib/theme.ts`:
```ts
export type Theme = 'auto' | 'light' | 'dark'
export const THEME_COLOR = { light: '#fff7ee', dark: '#16181d' }   // = --bg dei due temi

export function applyTheme(t: Theme): void {
  const root = document.documentElement
  if (t === 'auto') delete root.dataset.theme            // lascia decidere la media query
  else root.dataset.theme = t
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const mode = (m.media || '').includes('dark') ? 'dark' : 'light'
    m.content = t === 'auto' ? THEME_COLOR[mode] : THEME_COLOR[t]   // barra di stato = sfondo
  })
}
```
**Niente "lampo" del tema sbagliato:** `index.html` applica il tema salvato *prima* del primo paint con uno script inline (e due `theme-color` con `media`):
```html
<meta name="theme-color" content="#fff7ee" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#16181d" media="(prefers-color-scheme: dark)" />
<script>
  try {
    var t = localStorage.getItem('cleanduo:theme')
    if (t === 'light' || t === 'dark') {
      document.documentElement.dataset.theme = t
      var c = t === 'dark' ? '#16181d' : '#fff7ee'
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.content = c })
    }
  } catch (e) {}
</script>
```
Il selettore del tema (`AppearanceCard`) mostra per ogni opzione il gattino del tema su un riquadro del colore di sfondo (vedi §4.4).

### 1.4 Sfondo "vivo" (blob sfocati animati)

Lo sfondo è **fisso**, dietro a tutto (`-z-10`), sotto `bg-bg`. Tre cerchi colorati sfocati che fluttuano lentissimi. Sono ciò che il vetro sfoca e "rifrange" mentre si scrolla.
```tsx
export function Background() {
  const blob = (v: string) => ({ background: `rgb(var(--${v}))` })
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <div className="absolute -left-24 -top-24 h-96 w-96 animate-float1 rounded-full blur-3xl" style={blob('blob-a')} />
      <div className="absolute -right-32 top-1/4 h-[28rem] w-[28rem] animate-float2 rounded-full blur-3xl" style={blob('blob-b')} />
      <div className="absolute -bottom-32 left-1/4 h-[30rem] w-[30rem] animate-float3 rounded-full blur-3xl" style={blob('blob-c')} />
    </div>
  )
}
```
Regole:
- **Max 3 blob**, dimensioni 24–30 rem, sempre parzialmente fuori schermo (offset negativi).
- Animazione **solo `transform`** (`translate` + `scale`), 18/22/26 s `ease-in-out infinite`, durate diverse per non sincronizzarsi.
- I blob usano i token `--blob-*` (opacità incorporata): non applicare `opacity` extra.
- **Garanzia di rifrazione:** il vetro deve sempre poggiare su sfondo *non uniforme*. Se un nuovo tema ha blob troppo tenui (alpha < 0.15) il vetro sembrerà un rettangolo opaco.
- `prefers-reduced-motion`: non gestito oggi (vedi Appendice C); per nuovi progetti aggiungere `@media (prefers-reduced-motion: reduce) { .animate-float1, .animate-float2, .animate-float3 { animation: none } }`.

### 1.5 Specifiche Liquid Glass (classi esatte)

Quattro classi in `@layer components` (`src/index.css`). Sono **l'unico** posto in cui compare `backdrop-filter`.

```css
@layer components {
  .card { @apply rounded-3xl border border-line/80 bg-surface shadow-[0_1px_2px_rgb(var(--ink)/0.04),0_4px_14px_-6px_rgb(var(--ink)/0.08)]; }

  /* Liquid Glass: velo traslucido, sfocatura, luce speculare sul bordo alto, ombra morbida */
  .glass { @apply rounded-3xl; background: rgb(var(--glass));
    -webkit-backdrop-filter: blur(22px) saturate(1.8); backdrop-filter: blur(22px) saturate(1.8);
    border: 1px solid rgb(var(--glass-edge-soft));
    box-shadow: inset 0 1.5px 0 rgb(var(--glass-edge)), inset 0 -1px 0 rgb(var(--glass-edge-soft)),
                0 10px 30px -10px rgb(var(--glass-shade)), 0 2px 6px -2px rgb(var(--glass-shade)); }

  .glass-strong { @apply rounded-3xl; background: rgb(var(--glass-strong));
    -webkit-backdrop-filter: blur(30px) saturate(1.8); backdrop-filter: blur(30px) saturate(1.8);
    border: 1px solid rgb(var(--glass-edge-soft));
    box-shadow: inset 0 1.5px 0 rgb(var(--glass-edge)), 0 -10px 40px -12px rgb(var(--glass-shade)); }

  /* voce attiva dentro una barra di vetro: "lente" più chiara con raggio concentrico */
  .glass-active { background: rgb(var(--brand) / 0.14);
    box-shadow: inset 0 1px 0 rgb(var(--glass-edge)), inset 0 0 0 1px rgb(var(--brand) / 0.12); }
}
```

| Proprietà | `.glass` | `.glass-strong` | Note |
|---|---|---|---|
| Sfocatura | `blur(22px)` | `blur(30px)` | **Sempre** accoppiata a `saturate(1.8)`: la saturazione ravviva i colori dei blob attraverso il velo |
| Velo | `--glass` (78 % / 72 %) | `--glass-strong` (90 %) | Il valore alto è ciò che tiene il contrasto del testo |
| Bordo | 1 px `--glass-edge-soft` | idem | Bordo "perimetrale" appena percettibile |
| **Riflesso speculare** | `inset 0 1.5px 0 --glass-edge` (alto) + `inset 0 -1px 0 --glass-edge-soft` (basso) | solo alto | È la "luce che cade sul bordo del vetro" |
| Ombra | `0 10px 30px -10px` + `0 2px 6px -2px` (colore `--glass-shade`) | `0 -10px 40px -12px` (verso l'**alto**) | Il foglio è ancorato in basso: l'ombra sale |
| Raggio | `rounded-3xl` (24 px); `!rounded-full` per barre e pulsanti | `rounded-3xl`, `rounded-b-none` per i fogli | |

**Scala dei raggi (border-radius):**
`rounded-full` pillole/pulsanti/nav · `rounded-3xl` (24 px) card e vetro · `rounded-2xl` (16 px) campi, riquadri icona, blocchi interni · `rounded-xl` (12 px) avvisi inline · `rounded-[2.75rem]` solo la cornice telefono su desktop. Raggio concentrico: un elemento dentro un contenitore arrotondato usa un raggio *minore* (es. indicatore tab `rounded-full` dentro nav `rounded-full`).

**Scala delle ombre:** card = `0 1px 2px` + `0 4px 14px -6px` in `--ink` a 4 %/8 % (ombra "da carta"); vetro = ombre in `--glass-shade` (più scure e più larghe); pulsante primario = `0 8px 20px -8px rgb(var(--brand)/0.7)` (alone colorato).

**Fallback obbligatori** (già in `index.css`, da copiare):
```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass, .glass-strong { background: rgb(var(--surface)); }
}
@media (prefers-reduced-transparency: reduce) {
  .glass, .glass-strong { background: rgb(var(--surface)); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
```
Stessa forma, stessi colori, vetro pieno.

### 1.6 Colori semantici e dati

- **Urgenza** (pillole, sempre `bg-<tok>/15 text-<tok>`): `overdue → bg-exp/15 text-exp`, `today → bg-brand/15 text-brand`, `soon → bg-trf/15 text-trf`, `later/attesa → bg-line/70 text-muted`.
- **Barra di pulizia** (rosso→verde, la sola eccezione "hsl" ai token): `hsl(${0..140} 58% 48%)` con `hue = pct/100*140`.
  ```ts
  export function cleanColor(pct: number): string {
    const hue = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 140)
    return `hsl(${hue} 58% 48%)`
  }
  ```
- **Colori di stanza** (riquadro icona con gradiente `linear-gradient(135deg, <c>, <c>aa)`), 8 valori caldi/neutri: `#c9692a #2a8f78 #c0506a #e0a93e #8a5fa8 #3f87b8 #6aa84f #5b6577`. **Colori membro** (6): `#c9692a #e0a93e #5b6577 #2a8f78 #c0506a #3f87b8`. Sono scelti per funzionare su entrambi i temi con testo/icone bianchi.
- **Coriandoli di celebrazione**: `#d9772b #e6bb78 #c0283f #2a6b99 #23764b`.

### 1.7 Tipografia e contrasto

**Famiglia:** `font-sans` = `ui-rounded, SF Pro Rounded, Nunito, Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`. Nessun webfont: su iOS compare SF Pro Rounded (tono morbido); altrove ripiega su system-ui. Smoothing: `antialiased`.

**Gerarchia** (classi esatte in uso):

| Ruolo | Classi | Esempio |
|---|---|---|
| Titolo pagina (H1) | `text-3xl font-extrabold tracking-tight` | «Oggi», «Stanze» |
| Numero-eroe | `text-4xl font-extrabold leading-none` (contatori); `text-2xl font-extrabold` (stelle) | «4 azioni da fare» |
| Titolo foglio | `text-xl font-bold` | «Nuova azione» |
| Titolo scheda / stanza | `text-lg font-bold leading-tight` (stanza); `font-bold` (accordion) | |
| Titolo riga | `font-semibold leading-tight` | Nome azione |
| Testo corrente / campi | `text-[15px]` nei `.field`; `text-sm` nei testi | **16 px forzati su touch** (vedi §2.2) |
| Metadati | `text-xs text-muted` | «Cucina · Ogni settimana» |
| Etichetta di campo | `.label` = `text-xs font-semibold uppercase tracking-wide text-muted` | «NOME» |
| Pillole/badge | `text-[11px] font-semibold` | «Scaduta ieri» |
| Etichetta tab | `text-[10px] font-semibold` | «Oggi» |

Pesi usati: 500 (`font-medium`), 600, 700, 800. Mai < 500 per testo su vetro.

**Contrasto calcolato (WCAG 2.x)** con i valori reali dei token:

| Coppia | Mochi | Zenitsu |
|---|---|---|
| `ink` su `bg` | 11,45 | 15,29 |
| `ink` su `surface` | 11,96 | 13,37 |
| `muted` su `bg` | 4,84 | 7,53 |
| `muted` su `surface` | 5,05 | 6,58 |
| `brand` su `surface` | 5,09 | 8,69 |
| `onbrand` su `brand` (pulsante primario) | 5,17 | 9,96 |
| `exp` / `inc` / `trf` su `surface` | 5,72 / 5,49 / 5,65 | 6,88 / 8,75 / 8,09 |
| `ink` su vetro (78 %/72 % sopra `bg`) | 11,87 | 13,88 |
| `muted` su vetro | 5,01 | 6,84 |
| Pillola `brand` su `brand/15` | **4,13** ⚠️ | 6,21 |
| Pillola `exp` su `exp/15` | 4,51 | 5,22 |
| Pillola `trf` su `trf/15` | 4,58 | 5,88 |

**Regole di leggibilità su superfici traslucide**
1. Sul vetro il testo è **solo** `text-ink` (corpo) o `text-muted` (secondario) o `text-brand` (attivo). Mai `muted/70` o colori a bassa opacità.
2. Il velo non scende **sotto 0,72** (scuro) / **0,78** (chiaro); i fogli stanno a 0,90.
3. Testo sul vetro: ≥ 10 px **solo** se `font-semibold` (etichette tab); altrimenti ≥ 12 px.
4. Mai testo bianco fisso: usare `text-onbrand` (cambia con il tema) sopra `bg-brand`/`bg-exp`.
5. ⚠️ **Eccezione nota:** la pillola `brand` su `brand/15` in Mochi (4,13) è sotto AA per testo piccolo. Per nuovi progetti usare `bg-brand/10` oppure testo `ink` con icona `brand`.
6. Gli stati non devono dipendere dal solo colore: la pillola di urgenza ha sempre un testo («Scaduta ieri»), il badge un numero, la tab attiva anche peso/stroke dell'icona (`strokeWidth` 2,6 vs 2,1).

### 1.8 Performance guardrails (`backdrop-filter`)

`backdrop-filter` è la proprietà più costosa del sistema: forza la rasterizzazione dello sfondo *a ogni frame* sotto l'elemento.

**DOVE applicarlo (lista chiusa, ≤ ~6 superfici contemporanee):**
1. Barra di navigazione fluttuante (1)
2. Pulsanti `glass-btn` e FAB (piccoli, pochi per schermata)
3. Fogli `glass-strong` (uno alla volta) e toast (`glass-strong`, uno alla volta)
4. Scrim dei fogli: `backdrop-blur-sm` a schermo intero, **solo mentre il foglio è aperto**

**DOVE evitarlo (regole prescrittive):**
- ❌ **Mai** su card di lista, righe, griglie, elementi ripetuti (`.card` è piena apposta).
- ❌ **Mai annidato**: vetro dentro vetro (es. pulsante `glass-btn` dentro un foglio `glass-strong` è accettato solo perché piccolo; non annidare pannelli).
- ❌ Mai su elementi che si animano per dimensione/posizione ogni frame in liste lunghe; animare `transform`/`opacity`.
- ❌ Mai su contenitori scrollabili grandi (il vetro è *sopra* lo scroll, non *dentro*).
- Blur dello sfondo (`blur-3xl`) solo su **3 elementi statici** animati con `transform`, mai con `filter` animato.
- Un solo elemento "vetro a tutta larghezza" visibile alla volta (la nav); il foglio sostituisce la sua area quando aperto.
- Non usare `will-change`: il progetto non lo usa e lascia le decisioni di compositing al browser.
- Rispettare sempre i fallback di §1.5 (`@supports`, `prefers-reduced-transparency`).

---

## 2. Architettura layout e navigazione mobile-first

### 2.1 Struttura del viewport

`index.html` — `viewport-fit=cover` è **obbligatorio** per usare le safe-area:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

Reset e comportamento "da app" (`src/index.css`):
```css
html, body, #root { height: 100%; }
html { overscroll-behavior: none; overflow-x: clip; }
body {
  @apply bg-bg text-ink font-sans antialiased;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  overscroll-behavior: none;       /* niente "elastico" della pagina */
  overflow-x: hidden;
  touch-action: pan-y pinch-zoom;  /* solo scroll verticale e zoom a pizzico */
}
input, textarea { -webkit-touch-callout: default; }
@media (pointer: coarse) { input, textarea, select { font-size: 16px !important; } } /* niente zoom iOS al focus */
button { @apply select-none; }
::-webkit-scrollbar { display: none; }
* { scrollbar-width: none; }
```

**Scheletro dell'app** (`src/App.tsx`): sfondo fisso + colonna centrata + cornice telefono su desktop.
```tsx
<>
  <Background />
  <div className="mx-auto flex h-full max-w-md items-stretch md:items-center">
    <div className="relative h-full w-full overflow-hidden md:h-[min(52rem,calc(100dvh-2rem))] md:rounded-[2.75rem] md:border md:border-line md:shadow-[0_40px_100px_-20px_rgb(var(--glass-shade))]">
      <div ref={scroller} className="h-full overflow-y-auto overscroll-contain px-4 pt-safe pb-32">  {/* ← unico contenitore di scroll */}
        {/* vista della tab attiva */}
      </div>
      <div id="shell-overlay" className="pointer-events-none absolute inset-0 z-30" />   {/* strato per il FAB */}
      <BottomNav />  {/* …fogli, toast… */}
    </div>
  </div>
  <Celebration />   {/* fixed, sopra a tutto */}
</>
```
- **Mobile**: la "shell" riempie lo schermo (`h-full w-full`). **Desktop (`md:`)**: `max-w-md` (448 px) centrata, altezza `min(52rem, 100dvh - 2rem)`, angoli `2.75rem`, bordo `line`, ombra grande: sembra un telefono.
- **Scroll**: uno e uno solo contenitore (`overflow-y-auto overscroll-contain`), non `body`. Padding laterale `px-4` (16 px), in basso `pb-32` (8 rem) per non finire sotto nav + FAB.
- Al cambio tab/vista si riporta lo scroll in alto: `useEffect(() => scroller.current?.scrollTo({ top: 0 }), [tab, roomId])`.
- Lo sfondo (`Background`) è `fixed` **fuori** dalla shell: riempie anche i bordi attorno alla cornice desktop.

### 2.2 Safe-area iOS/Android

Utility (`index.css`) e uso:
```css
.pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 0px); }
.pt-safe { padding-top: env(safe-area-inset-top); }
```
| Dove | Tecnica |
|---|---|
| Contenitore di scroll | `pt-safe` (notch/status bar) |
| Nav fluttuante | `style={{ marginBottom: 'env(safe-area-inset-bottom)' }}` oltre a `bottom-4` |
| FAB | `style={{ bottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}` (sopra la nav) |
| Fogli | corpo con `pb-safe` + `pb-8` |
| Toast | `style={{ marginTop: 'env(safe-area-inset-top)' }}` oltre a `top-4` |

Altre regole iOS da non dimenticare:
- Input a **16 px su touch** (regola `@media (pointer: coarse)`), altrimenti Safari zooma e lascia la pagina spostata.
- Con la tastiera aperta **non** disegnare i fogli *dentro* un contenitore con `overflow-hidden` assoluto: iOS fa scorrere quel contenitore per portare l'input in vista e il foglio "salta". Per questo il foglio è `fixed` su mobile (vedi §3.9). Il focus automatico sul primo campo è consentito (è nello stesso gesto dell'apertura) perché il foglio entra con una breve dissolvenza, non da fuori schermo.
- Le animazioni di pagina usano `filter: blur()` → creano un *containing block*: un elemento `absolute`/`fixed` figlio di una pagina animata **si muove con la pagina**. Per questo il FAB è montato con un **portal** in `#shell-overlay`.

### 2.3 Scala degli z-index

| z | Livello |
|---|---|
| `-z-10` | Sfondo (`Background`) |
| `z-30` | `#shell-overlay` (FAB) |
| `z-40` | Barra di navigazione |
| `z-50` | Fogli (scrim + pannello) |
| `z-[65]` | Notifica in-app (`NotificationToast`) |
| `z-[70]` | Toast di conferma |
| `z-[80]` | Celebrazione (coriandoli) |

### 2.4 Bottom Navigation Bar fluttuante

Posizionamento **staccato dai bordi**: `absolute inset-x-4 bottom-4` (16 px di margine ai lati e sotto) + safe-area. È una pillola di vetro (`.glass` con `!rounded-full`), larga quanto la colonna meno 32 px, **mai ancorata** al bordo dello schermo.

```tsx
<nav className="glass absolute inset-x-4 bottom-4 z-40 flex items-center justify-between !rounded-full p-1.5"
     style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
  {TABS.map(({ id, label, icon: Icon }) => {
    const active = tab === id
    return (
      <button key={id} onClick={() => setTab(id)} aria-label={label}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 transition active:scale-90">
        {active && (
          <motion.span layoutId="nav-drop" className="glass-active absolute inset-0 rounded-full"
                       transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.9 }} />
        )}
        <span className={`relative ${active ? 'text-brand' : 'text-muted'}`}>
          <Icon size={22} strokeWidth={active ? 2.6 : 2.1} />
          {id === 'today' && badge > 0 && (
            <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-exp px-1 text-[10px] font-bold text-onbrand">{badge}</span>
          )}
        </span>
        <span className={`relative text-[10px] font-semibold ${active ? 'text-brand' : 'text-muted'}`}>{label}</span>
      </button>
    )
  })}
</nav>
```
**Indicatore "a goccia" liquido:** è **un unico** `motion.span` con `layoutId="nav-drop"` che *esiste solo nella tab attiva*: Framer Motion lo anima (FLIP) da una tab all'altra con una molla (`stiffness 420, damping 30, mass 0.9`), così "scivola" e si deforma leggermente. Stile = `.glass-active` (lente `brand/14 %` con riflesso e anello `brand/12 %`).
- 4 tab, ciascuna: icona 22 px (tratto 2,6 attiva / 2,1 inattiva) + etichetta 10 px; attiva `text-brand`, inattiva `text-muted`.
- Tocco: `active:scale-90`.
- Badge numerico sulla tab (es. azioni da fare): cerchio `bg-exp text-onbrand`, 16 px min.
- **`layoutId` deve essere unico** nella pagina e il nav non deve essere smontato al cambio tab (vive fuori dal contenitore animato).
- Alternativa CSS pura (se manca Framer Motion): un `span` assoluto con `transform: translateX(calc(var(--i) * 100%))` e `transition: transform .35s cubic-bezier(.3,1.3,.5,1)`; non usata nel progetto.

### 2.5 FAB (pulsante «+»)

```tsx
createPortal(
  <motion.button whileTap={{ scale: 0.9 }} onClick={onClick} aria-label={label}
    className="glass-btn btn-primary pointer-events-auto absolute right-5 !h-14 !w-14 !p-0"
    style={{ bottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}>
    <Plus size={26} strokeWidth={2.6} />
  </motion.button>,
  document.getElementById('shell-overlay')!,
)
```
56 × 56 px, colore `brand`, 20 px dal bordo destro, sopra la nav. Compare solo dove esiste un'azione "crea" (Oggi, dettaglio stanza).

### 2.6 Header e transizioni di pagina

**Header (`PageHeader`)** — *non* sticky e non collassabile: scorre via con il contenuto. Titolo a sinistra (con sottotitolo), azioni a destra (pillole di vetro: stato sync, campanella, avatar).
```tsx
<header className="flex items-start justify-between gap-3 pb-4 pt-2">
  <div className="flex min-w-0 items-center gap-2">
    {left}                                  {/* es. pulsante «indietro» glass-btn */}
    <div className="min-w-0">
      <h1 className="truncate text-3xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
  </div>
  <div className="flex shrink-0 items-center gap-2">{right}</div>
</header>
```
Per un header che si comprime allo scroll serve un'estensione (non presente): `position: sticky; top: 0` + `backdrop-filter` ridotto; **sconsigliato** per il vincolo di performance di §1.8.

**Cambio vista tra tab** — dissolvenza + leggero scorrimento + sfocatura, `mode="wait"`:
```tsx
<AnimatePresence mode="wait" initial={false}>
  <motion.div key={tab}
    initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    exit={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
    transition={{ duration: 0.18 }}
    className="pt-4">
    {tab === 'today' && <TodayView />}
    {/* … */}
  </motion.div>
</AnimatePresence>
```
- Sub-viste (es. dettaglio stanza) **non** hanno una route: sono stato locale (`roomId`) che sostituisce la vista della tab, con pulsante «indietro» nell'header.
- Liste: ogni riga entra con `initial {opacity 0, y 12}` → `animate {1, 0}` e esce con `exit {opacity 0, x 90, scale .92}`, `layout` + molla `stiffness 400, damping 34` (riordino fluido). Le griglie scaglionano con `delay: i * 0.04`.
- Stato di navigazione in un contesto React (`UiContext`: `tab`, `roomId`, fogli aperti…): niente router.

**Pagina di accesso (Gate)** = vista a sé prima dell'app: logo `app-icon.png` 128 px (`rounded-[28%]`), titolo, pannello `.glass-strong`; la nav e i fogli non sono montati.

---

## 3. Libreria componenti UI

Convenzioni valide per tutti: **stati** = `default` (token normali) · `hover` (solo dove il puntatore è `fine`: `hover:bg-line/30`) · `active/tap` (`active:scale-95`, vedi tabella) · `disabled` (`opacity-50 pointer-events-none`) · `focus` (campi: `focus:border-brand focus:ring-2 focus:ring-brand/25`). Le icone sono **lucide-react**, tratto 2–2,6, mai emoji come icone di sistema.

### 3.1 Card e contenitori

**`.card`** — contenitore standard *pieno* (liste, riepiloghi, impostazioni). Mai vetro.
```tsx
<div className="card p-4"> … </div>
```
Padding tipico: `p-4` (riepiloghi), `p-3` (righe di lista), `p-5` (pannello di accesso). Spaziatura tra card: `space-y-3` (12 px).

**Card di riepilogo con numero-eroe** (Oggi):
```tsx
<div className="card p-4">
  <div className="flex items-end justify-between">
    <div>
      <p className="text-4xl font-extrabold leading-none">{todoCount}</p>
      <p className="mt-1 text-sm text-muted">azioni da fare<span className="font-semibold text-exp"> · 3 in ritardo</span></p>
    </div>
    <div className="text-right"> … stelle settimanali … </div>
  </div>
  <div className="mt-3"><CleanBar pct={pct} height={10} /></div>
</div>
```

**Card riga di lista (TaskRow)** — anatomia, da sinistra a destra:
`[riquadro icona 44 px colorato]` · `[titolo (font-semibold) / metadati (text-xs muted) / pillole + stelle]` · `[avatar 28 px]` · `[pulsante tondo 48 px]`; sotto, opzionale, riga **note** separata da `border-t border-line/60` (icona 13 px `text-brand` + testo `text-xs text-muted`, `line-clamp-1`, si espande al tocco).
- Riquadro icona: `h-11 w-11 rounded-2xl text-white shadow-inner` con `style={{ background: 'linear-gradient(135deg, COLORE, COLOREaa)' }}`.
- Entrata/uscita animata (vedi §2.6). Tutta l'area di testo è un `<button>` che apre il foglio di modifica.

**Card stanza** (griglia 2 colonne `grid grid-cols-2 gap-3`, `whileTap scale .96`): riquadro icona 48 px, badge `bg-exp/15 text-exp` («1 da fare»), nome `text-lg font-bold`, percentuale colorata con `cleanColor`, barra.

**Barra di stato/progresso (`CleanBar`)** — binario `bg-line`, riempimento animato a molla con colore calcolato:
```tsx
<div className="w-full overflow-hidden rounded-full bg-line" style={{ height }}>
  <motion.div className="h-full rounded-full" initial={false}
    animate={{ width: `${pct}%`, backgroundColor: cleanColor(pct) }}
    transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
</div>
```
Altezze: 8 px (default), 10 px (riepiloghi/dettaglio). Le barre per-membro nella classifica usano `linear-gradient(90deg, <colore>, <colore>bb)` su binario `bg-line` (h-3).

**Accordion (scheda a scomparsa)** — impostazioni e classifica:
```tsx
<section className="card overflow-hidden" data-open={open || undefined}>
  <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left active:bg-line/30">
    <span className="text-brand">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-bold">{title}</span>
      {summary && !open && <span className="block truncate text-xs text-muted">{summary}</span>}   {/* riepilogo solo da chiuso */}
    </span>
    <ChevronDown size={20} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
  {open && <div className="border-t border-line/60 p-4">{children}</div>}
</section>
```
Lo stato aperto/chiuso si ricorda in `localStorage` per scheda.

### 3.2 Tab, filtri e pillole

**`Segmented`** (selettore orizzontale a segmenti con indicatore scorrevole `layoutId`):
```tsx
<div className="relative flex rounded-full border border-line bg-line/40 p-1">
  {options.map((o) => (
    <button key={o.id} type="button" onClick={() => onChange(o.id)}
      className="relative flex-1 rounded-full whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition active:scale-95">
      {value === o.id && (
        <motion.span layoutId={`seg-${options.map((x) => x.id).join('-')}`}
          className="absolute inset-0 rounded-full bg-surface shadow-[0_2px_8px_rgb(var(--ink)/0.15)]"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
      )}
      <span className={`relative ${value === o.id ? '' : 'text-muted'}`}>{o.label}</span>
    </button>
  ))}
</div>
```
Il `layoutId` include gli id delle opzioni, così due segmented diversi nella stessa pagina non si "rubano" l'indicatore. Max 4 opzioni da ≤ 12 caratteri su 360 px. Opzioni condizionali (es. «In corso (2)») compaiono/spariscono aggiungendo/togliendo l'elemento.

**Chip (filtri a scorrimento orizzontale)** — `.chip` / `.chip-active`:
```css
.chip { @apply inline-flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-sm font-medium text-ink transition active:scale-95; }
.chip-active { @apply border-brand bg-brand text-onbrand; }
```
```tsx
<div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">  {/* sporge ai bordi: scorre "a filo" */}
  <button className="chip chip-active">Tutte le stanze</button>
  <button className="chip"><RoomIcon size={14} />Cucina</button>
</div>
```
Le chip sono sempre **piene** (`bg-surface/80`), non vetro.

**Badge e pillole** (stato): `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold` + coppia colore dall'urgenza (§1.6). Badge numerico: `h-4 min-w-4 rounded-full bg-exp px-1 text-[10px] font-bold text-onbrand`. Pulsanti-pillola di stato (`glass-btn !px-3 !py-1.5 text-xs`) con icona 15 px e testo colorato (`text-inc`, `text-exp`, `text-brand`).

**Toggle (interruttore)**: binario `h-6 w-11 rounded-full` (`bg-brand` acceso, `bg-line` spento), cursore `h-5 w-5 rounded-full bg-surface shadow` che passa da `left-0.5` a `left-[22px]` con `transition-all`. Ruolo ARIA `switch`.

### 3.3 Pulsanti e micro-interazioni

**Pulsante base di vetro (`.glass-btn`)** — pillola con **riflesso luminoso al tocco**:
```css
.glass-btn { @apply glass relative inline-flex select-none items-center justify-center gap-2 overflow-hidden !rounded-full px-4 py-2.5 text-sm font-semibold text-ink
  transition duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-50; }
.glass-btn::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%);
  transform: translateX(-120%) skewX(-20deg); }
.glass-btn:hover::after, .glass-btn:active::after { animation: shine 0.9s ease-out; }
@keyframes shine { 0% { transform: translateX(-120%) skewX(-20deg); } 100% { transform: translateX(220%) skewX(-20deg); } }
```
**Varianti** (si combinano come classi):
- **Primario** `glass-btn btn-primary`: `background: rgb(var(--brand)); color: rgb(var(--onbrand)); border-color: transparent; box-shadow: inset 0 1px 0 rgb(255 255 255 / .35), 0 8px 20px -8px rgb(var(--brand) / .7)` (resta "pieno": il vetro è annullato dal background).
- **Pericolo** `glass-btn btn-danger` (`text-exp`).
- **Tondo icona**: `!h-12 !w-12 !p-0` (azione principale di riga), `!h-10 !w-10 !p-0` (secondaria), `!p-2` / `!p-2.5` (compatto, header).
- **Piccolo/inline**: `!px-3 !py-1.5 text-xs`.
- **Larghezza piena** nei form: `w-full`, `!py-3` / `!py-3.5` per l'azione principale.

**Tabella dei feedback al tocco (valori reali)**

| Elemento | Effetto |
|---|---|
| Pulsanti `glass-btn`, chip, segmenti | `active:scale-95` (CSS) |
| Tab della nav | `active:scale-90` |
| Pulsante tondo di riga | `whileTap={{ scale: 0.82 }}` (Framer) |
| FAB | `whileTap={{ scale: 0.9 }}` |
| Card stanza | `whileTap={{ scale: 0.96 }}` |
| Stelle selezionabili | `active:scale-75` |
| Accordion | `active:bg-line/30` |

**Campo di testo**:
```css
.field { @apply w-full rounded-2xl border border-line bg-bg px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/25; }
.label { @apply mb-1.5 mt-4 block px-1 text-xs font-semibold uppercase tracking-wide text-muted; }
```
I campi sono **sempre pieni** (`bg-bg`), mai vetro (anche dentro un foglio di vetro). Gruppi di impostazioni: riquadro interno `rounded-2xl border border-line bg-bg/60 p-3`.

**Feedback aptico e celebrazione** — al completamento di un'azione:
```ts
try { navigator.vibrate?.([18, 40, 24]) } catch { /* iOS: non supportato */ }   // 30 ms semplice per «avvia»
setCelebration({ key: Date.now(), stars, x, y })   // x,y = centro del pulsante premuto
```
`Celebration` (overlay `fixed`, `pointer-events-none`, `z-[80]`): `8 + stelle×4` icone `Star` riempite (`fill-current`) con colori dei coriandoli, che partono dal pulsante in direzioni casuali (raggio 50–140 px), ruotano e svaniscono in 0,9 s `easeOut`; una pillola `+N ⭐` (`bg-brand text-onbrand`, `font-extrabold`) sale di 70 px in 1,1 s. **Il feedback parte dal punto del tocco.** (Le particelle sono stelle, non gatti: vedi §4.)

### 3.4 Modali e bottom sheet a scomparsa

**`Sheet`** — pannello `.glass-strong` ancorato in basso, con maniglia di trascinamento, scrim sfocato, chiusura per Esc / tap sullo scrim / trascinamento verso il basso:
```tsx
<AnimatePresence>
  {open && (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:absolute">   {/* fixed su mobile, nella cornice su desktop */}
      <motion.div className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="glass-strong relative z-10 flex max-h-[92%] w-full max-w-md flex-col rounded-b-none"
        initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        drag="y" dragControls={controls} dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose() }}>
        <div className="flex cursor-grab touch-none justify-center pb-1 pt-3" onPointerDown={(e) => controls.start(e)}>
          <div className="h-1.5 w-10 rounded-full bg-muted/50" />                      {/* maniglia */}
        </div>
        <div className="flex items-center justify-between px-5 pb-1">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="glass-btn !p-2" aria-label="Chiudi"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-8 pt-1 pb-safe">{children}</div>
      </motion.div>
    </div>
  )}
</AnimatePresence>
```
Regole: trascinamento **solo dalla maniglia** (`dragListener={false}` + `useDragControls`) per non confliggere con lo scroll del contenuto; soglia di chiusura 120 px o velocità 600; altezza max 92 %; **entrata con dissolvenza da 48 px** (non da fuori schermo), uscita verso il basso; un solo foglio alla volta; il contenuto del foglio è fatto di campi pieni (§3.3).

**Toast di conferma** (`glass-strong`, in alto): `absolute inset-x-6 top-4 z-[70] px-4 py-3 text-center text-sm font-semibold`, entra da `y:-20 scale .95`; durata 3,2 s. **Notifica in-app**: `glass-strong absolute inset-x-4 top-4 z-[65] flex items-start gap-3 p-3` con icona in cerchio `bg-brand/15 text-brand` (36 px), titolo `text-sm font-bold`, corpo `text-xs text-muted`, chiusura `×`.

**Conferme distruttive**: pulsante a due tocchi («Elimina» → «Tocca ancora per confermare», `glass-btn btn-danger`) per le eliminazioni; `window.confirm` per annullamenti di azioni in corso.

---

## 4. Elementi illustrativi e mascotte (i gattini)

### 4.1 Realtà tecnica

I gattini sono **immagini raster PNG con trasparenza**, statiche. Non sono SVG, non sono componenti disegnati, non sono Lottie e **non hanno animazioni né reazioni** alle azioni dell'utente: l'unico "movimento" è quello del contenitore (entrata della pagina). Sono usati come **illustrazioni decorative** (`alt=""`, `draggable={false}`, `pointer-events-none select-none`).

| File | Dimensioni | Contenuto | Uso |
|---|---|---|---|
| `public/cats/mochi.png` | 240 × 220 | Gatto bianco e arancione, **busto** (testa + spalle, tagliato in basso) | Tema chiaro; capolino a destra; empty state |
| `public/cats/zenitsu.png` | 240 × 258 | Gatto grigio scuro, busto (tagliato in basso) | Tema scuro; capolino a sinistra; empty state |
| `public/cats/pair.png` | 440 × 380 | I due gatti seduti **a figura intera, abbracciati** | Opzione «Automatico» del tema |
| `public/app-icon.png` | 256 × 256 | Icona dell'app (due gatti con scopa e piumino su riquadro menta) | Logo nella pagina di accesso |
| `public/pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, `apple-touch-icon.png`, `favicon.png` | vari | Derivati dall'icona | PWA/iOS/browser (generati da `scripts/generate_icons.py`) |

> Origine: le tre immagini dei gattini sono copiate dal progetto MoneyDuo e hanno una **fessura da salvadanaio** sulla testa (coerente con un'app di spese). Per un'app diversa vanno rifatte o sostituite mantenendo lo stile (§4.5).

### 4.2 Stile grafico (da rispettare)

- **Tecnica:** acquerello/matita morbido, colori caldi e desaturati, contorno sottile scuro, ombreggiatura a macchie, aspetto "adesivo kawaii", mai vettoriale piatto né 3D.
- **Espressione:** **occhi chiusi sorridenti** (archi), bocca a "w" minuscola, guance leggere. Sempre felici: mai tristi o arrabbiati.
- **Accessori fissi:** collarino color rosa-cipria con **campanellino dorato**.
- **Colori:** *Mochi* = bianco panna con macchie arancio `~#e8a15a`, orecchie rosa; *Zenitsu* = grigio ardesia `~#555b68` con sfumature più scure, collarino e campanello. I colori dei temi (§1.2) derivano da questi due gatti: crema/arancio bruciato ↔ Mochi; ardesia/oro del campanello ↔ Zenitsu.
- **Taglio:** per i "capolino" il PNG è un **busto tagliato in basso** (il taglio sparisce dietro la card); sfondo trasparente; margine interno minimo (il gatto occupa quasi tutto il canvas).

### 4.3 Componenti e posizionamento (`src/components/Mascots.tsx`)
```tsx
export type Mascot = 'zenitsu' | 'mochi' | 'pair'
const FILE: Record<Mascot, string> = { zenitsu: 'cats/zenitsu.png', mochi: 'cats/mochi.png', pair: 'cats/pair.png' }

export function MascotImg({ kind, className = '' }: { kind: Mascot; className?: string }) {
  return <img src={import.meta.env.BASE_URL + FILE[kind]} alt="" draggable={false} decoding="async"
              className={`pointer-events-none select-none ${className}`} />
}

/** Il gattino fa capolino da dietro il bordo superiore di una scheda. `pair` = tutti e due, uno per lato. */
export function MascotPeek({ kind, side = 'right', children }: { kind: Mascot; side?: 'left' | 'right'; children: ReactNode }) {
  return (
    <div className="relative pt-11">                                        {/* 44 px di spazio sopra la card per il gatto */}
      {kind === 'pair' ? (
        <>
          <MascotImg kind="zenitsu" className="absolute left-6 top-0 h-16 w-auto" />
          <MascotImg kind="mochi" className="absolute right-6 top-0 h-16 w-auto" />
        </>
      ) : <MascotImg kind={kind} className={`absolute top-0 h-16 w-auto ${side === 'left' ? 'left-6' : 'right-6'}`} />}
      <div className="relative">{children}</div>                            {/* la card sta SOPRA il gatto: ne copre la base */}
    </div>
  )
}
```
**Come funziona l'effetto "capolino":** il gatto è `absolute top-0 h-16` (64 px) dentro un wrapper con `pt-11` (44 px); la card (`relative`, dopo nel DOM) parte a 44 px e **copre gli ultimi 20 px** del gatto → sembra spuntare da dietro il bordo. Nessuna maschera: basta l'ordine di sovrapposizione.

**Mappa delle schermate:**

| Schermata | Gatto | Posizione | Componente |
|---|---|---|---|
| Oggi | Mochi | capolino a destra sopra la card di riepilogo | `MascotPeek kind="mochi"` |
| Oggi (vuoto: «Tutto in ordine!») | Zenitsu | centrato, sopra il titolo, `h-20` | `MascotImg` nell'empty state |
| Stanze | Mochi | capolino a destra sopra la griglia | `MascotPeek kind="mochi"` |
| Dettaglio stanza | Zenitsu | capolino a **sinistra** sopra la card della stanza | `MascotPeek kind="zenitsu" side="left"` |
| Dettaglio stanza (vuoto) | Mochi | centrato `h-16` nell'empty state | `MascotImg` |
| Sfida | Zenitsu | capolino a sinistra sopra la classifica | `MascotPeek kind="zenitsu" side="left"` |
| Impostazioni | **Entrambi** | uno per lato sopra la prima scheda | `MascotPeek kind="pair"` |
| Centro notifiche (vuoto) | Mochi | centrato `h-20` | `MascotImg` |
| Selettore tema | Mochi / Zenitsu / pair | dentro un riquadro 56 px del colore del tema (`#fff7ee` / `#16181d` / diagonale 50 %) | `AppearanceCard` |
| Pagina di accesso | — (icona app) | logo 128 px in alto | `<img src="app-icon.png">` |

**Regola di alternanza:** destra = Mochi, sinistra = Zenitsu; si alternano tra schermate consecutive per dare ritmo; le schermate "di sistema" (Impostazioni) mostrano la coppia. Un solo capolino per schermata; mai più di due gatti visibili insieme.
**Empty state:** gatto centrato (`mx-auto`, `h-16`–`h-20`, `w-auto`) + titolo `font-bold`/`font-semibold text-ink` + frase `text-sm text-muted`, dentro una `.card` con `py-8`.

### 4.4 Interazioni e animazioni
- I gatti **non reagiscono** ai tocchi né alle azioni (nessun cambio di posa, nessuna animazione propria).
- Entrano e escono **insieme alla pagina** (transizione di §2.6, con blur).
- Al cambio tema il gatto "di tema" nel selettore evidenzia l'opzione (`border-brand bg-brand/10`, icona `Check`).
- La celebrazione di completamento usa **stelle**, non gatti.
- *Idee compatibili ma non implementate* (se servono in una nuova app): un'animazione di "ondeggiare" (`rotate: ±3°`, 3 s, `ease-in-out`, `transform-origin: bottom center`) sul gatto del capolino; una variante "festa" (occhi a stella) mostrata 1,2 s dopo un completamento; swap della posa per stato (vuoto/errore/successo). Tutte vanno disattivate con `prefers-reduced-motion`.

### 4.5 Linee guida per creare nuove pose/varianti coerenti

1. **Set minimo di pose per una nuova app** (tutte PNG trasparenti, stesso stile di §4.2): `peek-A` (busto, guarda verso sinistra), `peek-B` (busto, guarda verso destra), `pair` (figura intera, abbracciati), `empty` (busto frontale), più eventuali `success`, `sleep`, `error` (comunque sorridente/neutro).
2. **Canvas e peso:** altezza mostrata 64–80 px (capolino/empty) e 40–56 px (icone) → esportare a **×3** (≈ 240 px di larghezza per i busti, ≈ 440 px per il pair), PNG-8/24 con alpha, ≤ 60 KB l'uno; nome `kebab-case.png` in `public/<mascotte>/`.
3. **Taglio del busto:** testa centrata nel terzo superiore, spalle visibili, **taglio netto in basso** (verrà coperto dalla card). Margine trasparente ≤ 4 %.
4. **Direzione dello sguardo:** il gatto di destra guarda verso sinistra (verso il contenuto) e viceversa; se serve invertire, specchiare con `scale-x-[-1]` solo se l'asimmetria non è significativa (macchie, fessura).
5. **Colore/contrasto sullo sfondo:** testare ogni PNG su `--bg` di *entrambi* i temi (`#fff7ee` e `#16181d`): il contorno scuro deve restare leggibile sul chiaro e non "bruciare" sullo scuro; evitare bianco puro ai bordi (halo).
6. **Accessori e identità:** collarino + campanellino dorato sempre presenti; palette limitata ai colori dei due gatti; niente ombre portate dentro il PNG (l'ombra è del contenitore).
7. **Prompt di generazione immagini (testo di riferimento):** «*cute chubby cat, soft watercolor and pencil illustration, thin dark outline, closed smiling eyes, tiny cat mouth, rosy blush, pink-beige collar with a small golden bell, sticker style, centered bust cropped at the bottom, transparent background, warm desaturated palette, no text*» — varianti di colore: «*white and orange calico*» / «*dark slate-grey*».
8. **Nuove stesse regole d'uso:** decorativi (`alt=""`), mai interattivi, mai sopra testo, mai dentro superfici di vetro (la card sotto il capolino è `.card` piena).

---

## 5. Come applicare questo Design System a un nuovo progetto

### 5.1 Procedura manuale (riassunto)
1. `npm create vite@latest <nome> -- --template react-ts` → `npm i react-dom framer-motion lucide-react` → `npm i -D tailwindcss@3 postcss autoprefixer vite-plugin-pwa @types/node`.
2. Copiare `tailwind.config.js`, `postcss.config.js` (`{ plugins: { tailwindcss: {}, autoprefixer: {} } }`), `src/index.css`, `src/lib/theme.ts`, e lo script inline del tema + metadati di `index.html` (§1.3, §2.1).
3. Copiare `src/components/ui.tsx` (Avatar, Stars, CleanBar, Segmented, PageHeader, Sheet, Toggle, Accordion), `Chrome.tsx` (Background, BottomNav, Fab, Toast, Celebration…) e `Mascots.tsx`; assicurarsi di avere `<div id="shell-overlay">` nello scheletro (§2.1).
4. Sostituire i dati (tab, icone, nomi) e le immagini (§4.5).
5. Verificare con l'**Appendice B**.

### 5.2 Prompt pronto all'uso (copia-incolla in una nuova sessione di Claude Code, insieme a `DESIGN_SYSTEM.md`)

````text
Sei un Senior Front-End Engineer. In questa cartella trovi DESIGN_SYSTEM.md: è l'UNICA fonte di verità
per lo stile grafico, il layout e le interazioni. Leggilo per intero prima di scrivere codice e seguilo alla
lettera (la sezione 0 spiega dove il design si discosta dal «Liquid Glass da manuale»: rispetta quelle scelte).

OBIETTIVO
Imposta da zero, già al primo commit, una web app mobile-first (PWA) per: <DESCRIVI L'APP E LE 4 SEZIONI PRINCIPALI>
con lo stesso design system: temi Mochi (chiaro, crema/arancio) e Zenitsu (scuro, ardesia/oro) + modalità automatica,
contenuti su card piene e Liquid Glass SOLO su navigazione, pulsanti, FAB, fogli e toast, sfondo con 3 blob sfocati animati,
bottom navigation fluttuante con indicatore "a goccia" (Framer Motion layoutId), bottom sheet trascinabili, mascotte che
fanno capolino sulle schermate.

STACK (versioni esatte da DESIGN_SYSTEM.md §0): React 19, Vite, TypeScript strict, Tailwind CSS 3.4 (NON 4), framer-motion,
lucide-react, vite-plugin-pwa. Nessun webfont, nessuna libreria UI.

PASSI
1. Scaffold Vite + React + TS. Installa le dipendenze. tsconfig strict con noUnusedLocals/noUnusedParameters.
2. Tailwind: crea tailwind.config.js, postcss.config.js e src/index.css IDENTICI a §1.1, §1.2, §1.5 e §2.1 del documento
   (token RGB, tre blocchi di tema, .card/.glass/.glass-strong/.glass-active/.glass-btn/.btn-primary/.field/.label/.chip,
   fallback @supports e prefers-reduced-transparency, reset "da app", utility pt-safe/pb-safe). Niente `dark:` e niente colori
   hex nei componenti, tranne quelli elencati in §1.6.
3. Tema: src/lib/theme.ts (Theme 'auto'|'light'|'dark', applyTheme, setTheme) + script inline e doppio meta theme-color in
   index.html (§1.3). Aggiungi un selettore del tema a tre opzioni (§4.3, tabella "Selettore tema").
4. Componenti base in src/components: ui.tsx (Avatar, Stars, CleanBar, Segmented, PageHeader, Sheet, Toggle, Accordion),
   Chrome.tsx (Background, BottomNav, Fab con portal su #shell-overlay, Toast, NotificationToast, Celebration), Mascots.tsx
   (MascotImg, MascotPeek). Usa gli snippet del documento senza "semplificarli": layoutId, molle, safe-area e z-index inclusi.
5. Scheletro App.tsx (§2.1): Background fisso + colonna max-w-md + cornice telefono su md: + UNICO contenitore di scroll +
   #shell-overlay + BottomNav + Sheet montati fuori dal contenitore animato. Cambio vista con AnimatePresence mode="wait"
   (§2.6). Stato di navigazione in un contesto React, niente router.
6. Mascotte: crea public/<mascotte>/ con segnaposto PNG trasparenti (busto sinistra/destra, coppia) e collega MascotPeek /
   empty state come in §4.3. Se non ho ancora le immagini, usa riquadri SVG neutri con la stessa dimensione e segnala i TODO.
7. PWA: vite-plugin-pwa (autoUpdate), manifest con theme_color/background_color = --bg del tema chiaro, icone 192/512/maskable,
   apple-touch-icon, base path dinamico per GitHub Pages se serve.
8. Crea 4 viste d'esempio (una per tab) con: header (PageHeader), una card di riepilogo con CleanBar, un Segmented, una riga di
   chip, 3 righe di lista animate, un empty state con mascotte, un FAB, un bottom sheet con un form (.field/.label/Toggle) e un
   Accordion nelle impostazioni.
9. Verifica: `npm run build` senza errori; poi apri l'app con Playwright (viewport iPhone 14) in light e dark e controlla:
   nav staccata dai bordi con indicatore che scivola, nessun vetro sulle card, nessuna barra di scroll visibile, input a 16 px,
   FAB non scorre con la pagina, foglio che non salta con la tastiera, contrasti come in §1.7.
10. Esegui la checklist dell'Appendice B e correggi ogni punto non conforme prima di consegnare.

VINCOLI NON NEGOZIABILI
- `backdrop-filter` solo sulle classi .glass/.glass-strong e sullo scrim dei fogli; mai su liste/card/righe e mai annidato (§1.8).
- Un solo contenitore di scroll; FAB in portal; foglio `fixed` su mobile e `md:absolute` su desktop.
- Testo su vetro solo text-ink / text-muted / text-brand; mai bianco fisso (usa text-onbrand sopra brand).
- Ogni nuovo token va dichiarato nei TRE blocchi (chiaro, @media scuro, [data-theme='dark']).
- Se qualcosa non è coperto dal documento, scegli la soluzione più vicina allo stile esistente e annotala in una sezione
  "Decisioni" nel README, senza inventare nuovi colori o nuove ombre.

CONSEGNA
Commit iniziale con tutto funzionante, README breve (come avviare, struttura, decisioni) e l'elenco dei punti dell'Appendice B
verificati. Rispondi in italiano.
````

*(Sostituisci il blocco `<…>` con la descrizione della nuova app. Le immagini delle mascotte vanno fornite a parte: vedi §4.5.)*

---

## Appendice A — Mappa dei file da copiare

| Cosa | File in questo repository | Note |
|---|---|---|
| Token e classi di vetro | `src/index.css`, `tailwind.config.js`, `postcss.config.js` | Cuore del design system |
| Tema (auto/Mochi/Zenitsu) | `src/lib/theme.ts`, `index.html` (script + meta) | Cambiare il prefisso della chiave `localStorage` |
| Primitive UI | `src/components/ui.tsx` | Avatar, Stars, CleanBar, Segmented, PageHeader, Sheet, Toggle, Accordion |
| Sfondo, nav, FAB, toast, celebrazione | `src/components/Chrome.tsx` | I pezzi legati ai dati (SyncPill, NotificationCenter) sono specifici dell'app |
| Mascotte | `src/components/Mascots.tsx`, `public/cats/*.png` | Sostituire le immagini per una nuova app |
| Righe e schede di esempio | `src/components/TaskRow.tsx`, `RoomsView.tsx`, `TodayView.tsx`, `RankingView.tsx` | Riferimento per liste, griglie, riepiloghi |
| Impostazioni a schede + selettore tema | `src/components/SettingsView.tsx`, `AppearanceCard.tsx` | |
| Fogli e form | `src/components/Sheets.tsx` | Campi, chip multiselezione, toggle |
| Scheletro e transizioni | `src/App.tsx` | Safe-area, shell, `#shell-overlay` |
| Icone PWA | `scripts/generate_icons.py`, `assets/icon-source.jpg`, `vite.config.ts` | Generano 192/512/maskable/iOS/favicon |

## Appendice B — Checklist di conformità

**Token e temi**
- [ ] Nessun `dark:` e nessun colore hex nei componenti (salvo §1.6).
- [ ] Ogni token è dichiarato in `:root`, `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` e `[data-theme='dark']`.
- [ ] Script del tema in `<head>` prima del primo paint; due `theme-color` con `media`; barra di stato coerente con `--bg`.
- [ ] Contrasti ≥ 4,5:1 per testo normale (eccezioni documentate in §1.7).

**Vetro e performance**
- [ ] `backdrop-filter` solo in `.glass`, `.glass-strong` e nello scrim dei fogli; mai su card/liste/righe; mai annidato.
- [ ] Fallback `@supports not` e `prefers-reduced-transparency` presenti.
- [ ] Sfondo = 3 blob sfocati animati solo con `transform`.
- [ ] Velo del vetro ≥ 0,72 (scuro) / 0,78 (chiaro); fogli 0,90.

**Layout**
- [ ] `viewport-fit=cover`; safe-area su scroll (`pt-safe`), nav, FAB, fogli, toast.
- [ ] Un solo contenitore di scroll, `overscroll-behavior: none`, scrollbar nascosta, `touch-action: pan-y pinch-zoom`.
- [ ] Input a 16 px su touch; `-webkit-tap-highlight-color: transparent`.
- [ ] Nav `absolute inset-x-4 bottom-4`, indicatore `layoutId` con molla 420/30/0,9, fuori dal contenitore animato.
- [ ] FAB in portal su `#shell-overlay`; foglio `fixed` su mobile, `md:absolute` su desktop; z-index come §2.3.
- [ ] Desktop: colonna `max-w-md` con cornice `rounded-[2.75rem]`.

**Interazioni**
- [ ] Ogni elemento tappabile ha feedback di scala (tabella §3.3) e area ≥ 40 px.
- [ ] Fogli chiudibili con Esc, scrim e trascinamento dalla maniglia (soglia 120 px / 600).
- [ ] Haptic sul completamento (con try/catch); celebrazione dal punto del tocco.

**Mascotte**
- [ ] PNG trasparenti, `alt=""`, `draggable={false}`; capolino = wrapper `pt-11` + immagine `absolute top-0 h-16` + card `relative` sopra.
- [ ] Un solo capolino per schermata; destra Mochi / sinistra Zenitsu; empty state centrato.

## Appendice C — Limiti noti e cose non implementate

- **`prefers-reduced-motion`** non è gestito (blob, transizioni di pagina, celebrazione): da aggiungere nei nuovi progetti.
- **Pillola `brand` su `brand/15` in Mochi** a 4,13:1 (< AA per testo piccolo); vedi §1.7 punto 5.
- **Header** non sticky né collassabile; nessun parallax.
- **Mascotte** solo statiche (nessuna posa per stato, nessuna animazione); le immagini sono quelle di MoneyDuo (fessura da salvadanaio).
- **Webfont** non caricato: l'aspetto "arrotondato" dipende da `ui-rounded` (Apple); su Android/Windows ripiega su system-ui.
- **Feedback aptico** non disponibile su iOS Safari (`navigator.vibrate` assente): la scala del tocco e la celebrazione visiva sono l'unico feedback.
- **Fallback senza Framer Motion** per `layoutId` non fornito (descritto solo a parole in §2.4).
- La libreria dei componenti vive **dentro l'app** (non è un pacchetto riutilizzabile): si riusa copiando i file di Appendice A.
