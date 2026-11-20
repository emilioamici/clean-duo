# 🧹 Clean Duo

Web app **PWA mobile-first** per gestire le faccende di casa in modo **gamificato**:
stanze con indicatore di pulizia, azioni ricorrenti, stelle, classifica settimanale/mensile e premio.
Il database è **un singolo file JSON su Google Drive**, condiviso tra i membri della casa. Nessun backend.

- **Stack:** React 19 · Vite · TypeScript · Tailwind CSS · Framer Motion · Lucide · `vite-plugin-pwa`
- **Design:** *Liquid Glass* (vetro traslucido, nav fluttuante con indicatore a "goccia") con la stessa palette di MoneyDuo: **Modalità Mochi** (chiara, crema e arancio), **Modalità Zenitsu** (scura, ardesia e oro) o automatica. Si sceglie in Impostazioni → Aspetto.
- **Prima pagina:** «Accedi con Google». Dopo l'accesso la casa viene ritrovata su Drive; se non c'è si crea o ci si unisce con il Picker. «Prova senza accedere» apre la demo con dati di esempio salvati in locale.

---

## Sviluppo locale

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build di produzione (tsc + vite + service worker)
npm run preview
```

Le credenziali Google si inseriscono dall'app (**Impostazioni → Google Drive**) oppure si precompilano con un file `.env.local`
(vedi `.env.example`).

---

## Deploy su GitHub Pages

1. Pubblica il repository su GitHub e vai su **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.
2. Fai push su `main`: il workflow `.github/workflows/deploy.yml` esegue build e deploy.
3. Il `base` path (`/<nome-repo>/`) è calcolato automaticamente da `vite.config.ts` (override con la variabile `VITE_BASE`).
4. L'app sarà su `https://<tuo-utente>.github.io/<nome-repo>/`.
5. *(Facoltativo)* In **Settings → Secrets and variables → Actions → Variables** crea `VITE_GOOGLE_CLIENT_ID`,
   `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` per averle già precompilate nella build.
   Sono identificativi pubblici (finiscono comunque nel JavaScript), non segreti.

### Installazione come app
- **iOS (Safari):** Condividi → *Aggiungi alla schermata Home*.
- **Android (Chrome):** menu ⋮ → *Installa app*.

---

## Configurare Google Cloud (passo-passo)

### 1. Crea il progetto
1. Vai su <https://console.cloud.google.com/> e accedi.
2. Selettore progetti (in alto) → **Nuovo progetto** → nome es. `clean-duo` → **Crea**.

### 2. Abilita le API
**API e servizi → Libreria**, cerca e abilita:
- **Google Drive API**
- **Google Picker API** (serve per far aprire all'altro membro il file condiviso, vedi sotto)

### 3. Schermata di consenso OAuth
1. **API e servizi → Schermata consenso OAuth** (o *Google Auth Platform → Branding*).
2. Tipo utente: **Esterno**. Compila nome app (`Clean Duo`), email di assistenza e email dello sviluppatore.
3. **Ambiti (Scopes)** → aggiungi `https://www.googleapis.com/auth/drive.file`.
   È uno scope *non sensibile*: l'app vede **solo** i file che crea o che l'utente apre con il Picker, mai il resto del Drive.
4. **Utenti di test**: finché l'app è in modalità *Testing* aggiungi le email Google di **tutti i membri della casa**.
   (In alternativa premi *Pubblica app*: con solo `drive.file` non serve la verifica di Google.)

### 4. Ottieni il Client ID
1. **Credenziali → Crea credenziali → ID client OAuth**.
2. Tipo applicazione: **Applicazione web**.
3. **Origini JavaScript autorizzate** — aggiungi *solo l'origine, senza percorso e senza `/` finale*:
   - `https://<tuo-utente>.github.io`
   - `http://localhost:5173` (per lo sviluppo)
4. Non servono URI di reindirizzamento (si usa il token model di Google Identity Services).
5. Copia il **Client ID** (`xxxx.apps.googleusercontent.com`).

### 5. API Key e App ID per il Picker (consigliato per la condivisione)
1. **Credenziali → Crea credenziali → Chiave API**. Poi *Limita chiave*:
   - *Limitazioni applicazione* → **Referrer HTTP** → `https://<tuo-utente>.github.io/*` (e `http://localhost:5173/*`);
   - *Limitazioni API* → solo **Google Picker API**.
2. L'**App ID** è il **numero del progetto** (Dashboard → *Informazioni sul progetto*, cifre tipo `123456789012`).

### 6. Inserisci le credenziali nell'app
Apri l'app → **Impostazioni → Google Drive → Configura credenziali Google** → incolla Client ID, API Key e App ID → *Salva*.

---

## Creare la casa e collegare il secondo membro

### Membro 1 (crea la casa)
1. Impostazioni → **Accedi con Google**.
2. Dai un nome alla casa e premi **Crea su Drive**: viene creato `cleanduo-db.json` nel tuo Drive.
   > Se avevi già creato la casa con una versione precedente, il file ha un altro nome: rinominalo in `cleanduo-db.json` direttamente su Drive e l'app lo ritroverà al prossimo accesso.
3. Sotto *Invita via email* inserisci l'email Google del partner → riceve l'accesso **in scrittura** al file
   (via Drive API `permissions.create`). Puoi anche copiare l'**ID del file**.
4. Aggiungi i membri (o lascia che ciascuno usi **Aggiungi me**).

### Membro 2 (si unisce)
1. Apre l'app → **Impostazioni** → inserisce le stesse credenziali Google (o usa la build con le variabili precompilate) → **Accedi con Google**.
2. **Unisciti a una casa → Scegli il file condiviso (Picker)** e seleziona `cleanduo-db.json` (tab *Condivisi con me*).
3. In alternativa, incolla l'**ID** del file.

> ⚠️ **Perché il Picker?** Con lo scope ristretto `drive.file` un'app può accedere a un file creato da qualcun altro
> **solo dopo che l'utente lo ha scelto con il Google Picker**. Incollare l'ID funziona solo se quell'account ha già
> "aperto" il file con l'app (ad esempio il proprietario, o dopo una prima selezione col Picker). Per questo servono API Key e App ID.
> L'ID da solo basta sul secondo dispositivo del *proprietario*.

Da quel momento tutti leggono e scrivono lo stesso JSON. Se la tua email coincide con quella di un membro, l'app ti riconosce da sola;
altrimenti tocca **Sono io** accanto al tuo nome.

---

## Lingue, temi e notifiche

- **Lingue:** italiano e inglese (*Impostazioni → Aspetto*; «Automatico» segue il telefono).
- **Temi:** Modalità Mochi, Modalità Zenitsu o automatico.
- **Notifiche:** una campanella nell'app avvisa quando un altro completa o crea un'azione o entra un nuovo membro; in più un promemoria giornaliero delle azioni da fare (orario a scelta). Con l'app in primo piano compaiono come avviso, con l'app chiusa servono il server delle notifiche e l'email nel profilo.
- **Azioni con durata** (es. asciugatrice): nel form dell'azione si imposta la durata; il tap la avvia, resta «in corso» e alla fine si completa da sola (stelle a chi l'ha avviata) e arriva a tutti la notifica «Il task … è finito». Con l'app chiusa la notifica la invia il Worker (può arrivare con fino a 5 minuti di ritardo, il cron gira ogni 5 minuti); con l'app aperta è immediata.
- **Accesso persistente:** senza «Riconnetti» ogni ora.

Notifiche con l'app chiusa e accesso persistente richiedono un piccolo server gratuito su Cloudflare Workers: vedi **[worker/README.md](worker/README.md)**. Senza, tutto il resto funziona.

## Come funziona la sincronizzazione

| Evento | Cosa succede |
|---|---|
| Apertura app / ritorno in primo piano / ritorno online / ogni 60 s | Sync automatica |
| Ogni azione (completa, modifica…) | Salvataggio in cache locale + sync dopo ~0,8 s |
| Pulsante **Sync** (nell'intestazione o in Impostazioni) | Sync manuale |
| Offline | Si lavora sulla cache `localStorage`; le modifiche vengono inviate al ritorno della rete |

**Conflitti / race condition.** Prima di scrivere l'app rilegge il file e ne confronta la `version` di Drive:
1. legge file remoto + versione;
2. **unisce** locale e remoto (per entità, ultima modifica vince; i completamenti non si perdono mai: `lastCompletedAt` e contatori prendono il massimo; i log si uniscono per id; le cancellazioni usano "lapidi");
3. scrive solo se la versione remota è ancora quella letta, altrimenti ripete (max 5 tentativi).

Se due persone completano **la stessa azione quasi contemporaneamente** (< 2 minuti) conta un solo completamento: le stelle non vengono assegnate due volte.

**Sessione Google.** Senza il server il token OAuth dura ~1 ora: alla scadenza l'app tenta un rinnovo silenzioso e, se il browser lo blocca, compare **Riconnetti** (i dati locali non vanno persi). Con il server (accesso persistente) la sessione si rinnova da sola.

---

## Come si calcola la pulizia

- Ogni azione ha una **scadenza** (ultimo completamento + ricorrenza; per le settimanali con giorni specifici, il prossimo giorno scelto).
- Pulizia azione = tempo residuo / durata del ciclo (100% appena completata → 0% a scadenza passata).
- Pulizia stanza = media delle azioni **pesata per le stelle** (difficoltà). Colore da rosso a verde.
- Le azioni *una tantum* completate finiscono in archivio.

## Struttura

```
worker/                         server notifiche + accesso persistente (Cloudflare Worker)
src/
  i18n/                         italiano/inglese
  types.ts                      Room, Task, Member, ActivityLog, AppDatabase
  lib/clean.ts                  scadenze, ricorrenze, % pulizia
  lib/merge.ts                  merge anti-conflitto
  lib/demo.ts                   dati di esempio
  services/googleDriveService.ts  GIS OAuth, Drive v3, Picker, condivisione
  store/AppContext.tsx          stato, cache locale, sync
  store/UiContext.tsx           navigazione, sheet, completamento + animazione
  components/                   Oggi, Stanze, Sfida, Impostazioni, Liquid Glass UI
```

## Risoluzione problemi

- **`redirect_uri_mismatch` / `origin_mismatch`**: l'URL dell'app non è tra le *Origini JavaScript autorizzate* (solo origine, es. `https://utente.github.io`).
- **`access_denied` / app non verificata**: aggiungi la tua email tra gli *Utenti di test* oppure pubblica l'app.
- **404 aprendo il file del partner**: usa il Picker (vedi nota sopra).
- **Icone PWA**: sorgente in `assets/icon-source.jpg`, rigenerabili con `npm run icons` (richiede Python + Pillow).
