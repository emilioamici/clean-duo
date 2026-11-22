# Server delle notifiche e dell'accesso persistente (Cloudflare Worker)

Piccolo server gratuito che dà a Clean Duo due cose che un sito statico non può fare da solo:

1. **Notifiche push anche con l'app chiusa**: quando qualcuno completa o crea un'azione, o entra un nuovo membro, e i **promemoria** giornalieri delle azioni da fare.
2. **Accesso persistente a Google**: il token di Google dura 1 ora e un sito statico non può rinnovarlo da solo. Con questo server la sessione si rinnova da sola, anche in background, senza «Riconnetti».

Entrambe sono **facoltative**: senza server l'app funziona (notifiche solo con l'app aperta, accesso da rifare ogni ora).

## Come funziona
- Ogni dispositivo che attiva le notifiche si **iscrive** al server (indirizzo del servizio di push del browser + chiavi di cifratura).
- Chi fa una modifica **dice al server a chi inviare la notifica** (gli altri membri con email e con quel tipo di avviso attivo). La notifica parte solo dopo che i dati sono arrivati su Drive. Il messaggio è cifrato fino al dispositivo (RFC 8291); il testo passa dal server (nome dell'azione e di chi l'ha fatta).
- **Promemoria**: il dispositivo comunica *quando* inviarsi cosa (max 20 voci, le sostituisce a ogni sincronizzazione); un cron ogni 5 minuti invia quelli scaduti. Il server non conosce il database (salvo il ponte qui sotto).
- **Ponte verso il database (invitati senza Selettore)**: con il permesso ristretto `drive.file` un file condiviso da altri si apre solo dal Selettore di Google, che su iPhone spesso non funziona. Chi ha creato la casa, aprendo l'app con l'accesso persistente, la registra sul server (`/house/register`: il Worker conserva una copia **cifrata** del suo token di rinnovo). Da quel momento gli account con cui il file è condiviso su Drive entrano accedendo con Google e leggono/scrivono il database dal Worker (`/house/mine`, `/db/read`, `/db/write`), senza ID né Selettore. L'unica fonte dell'autorizzazione è la condivisione su Drive (si controlla a ogni chiamata, quindi togliere un membro chiude l'accesso) e il token Google deve essere emesso per il tuo Client ID (se l'app usa un Client ID diverso da quello del Worker, aggiungilo a `ALLOWED_CLIENT_IDS`, separati da virgola). Il contenuto del database transita ma **non viene salvato né registrato**. Si attiva da solo se l'accesso persistente è configurato: `/health` mostra `"bridge": true`.
- **Inizio e fine ciclo (es. Roomba via IFTTT)**: ogni automazione di tipo «Inizio e fine ciclo» ha due indirizzi segreti, `GET|POST /hook/<codice>/start` e `/hook/<codice>/finish`, che chi li chiama (IFTTT «Make a web request», Home Assistant, `curl`) usa per segnalare la partenza e la fine. Non servono `Origin` né intestazioni: l'accesso è il codice. Il Worker ricorda lo stato, ignora le ripetizioni (un `start` mentre è già in corso; un `finish` entro 10 minuti dal precedente), mette l'evento in coda per l'app (`/automation/events`, solo alle app che dichiarano `v: 2`) e alla **fine** manda una notifica a tutti i membri. L'app mette l'azione «in corso» alla partenza e la completa alla fine, senza membro né stelle; se il «finito» non arriva, dopo 4 ore lo stato «in corso» si toglie da solo. Ogni segnale costa 2 scritture su KV.
- **Azioni con durata**: chi avvia l'azione programma sul server la notifica di fine (`/timer`, max 24 ore) per tutti i membri con email; il cron la invia entro 5 minuti dalla scadenza. Se l'azione viene annullata o eliminata, il timer si cancella. Con l'app aperta la notifica è immediata e il server la deduplica con lo stesso `tag`.
- Il server **non legge mai Drive** per le notifiche. A ogni richiesta controlla il token Google di chi scrive: deve essere valido e avere accesso al file del database. Con l'accesso persistente conserva un token di rinnovo cifrato (vedi sotto).

## Cosa serve
- Un account Cloudflare gratuito: <https://dash.cloudflare.com/sign-up> (nessuna carta di credito).
- Node 20 o successivo sul tuo computer.

I limiti del piano gratuito bastano per una famiglia: 100.000 richieste al giorno; le scritture sull'archivio KV (1.000 al giorno) avvengono solo quando un dispositivo si iscrive, si rinnova o cambia i promemoria.

## Installazione (una volta sola)
Dalla cartella del progetto:

1. **Chiavi VAPID** (identificano il tuo server presso i servizi di push):
   ```bash
   node worker/scripts/generate-vapid.mjs
   ```
   Stampa `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`. **La privata non va mai condivisa né committata.**

2. **Configurazione**:
   ```bash
   cd worker
   cp wrangler.example.toml wrangler.toml
   ```
   In `wrangler.toml` sostituisci `<utente>` con il tuo nome utente GitHub (`ALLOWED_ORIGINS` deve essere esattamente l'origine del sito, per esempio `https://emilioamici.github.io`, **senza** `/clean-duo` e senza `/` finale). `wrangler.toml` è ignorato da Git.

3. **Accesso a Cloudflare**:
   ```bash
   npx wrangler login
   ```

4. **Archivio (KV)**:
   ```bash
   npx wrangler kv namespace create SUBS
   ```
   Incolla l'`id` stampato in `wrangler.toml` al posto di `INSERISCI_QUI_L_ID_DEL_KV`.

5. **Segreti** (ti viene chiesto di incollare il valore):
   ```bash
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_PUBLIC_KEY
   ```

6. **Pubblicazione**:
   ```bash
   npx wrangler deploy
   ```
   Stampa l'indirizzo, per esempio `https://cleanduo-push.tuo-nome.workers.dev`. Aprendo `…/health` deve comparire `{"ok":true,"auth":false}` (`auth` diventa `true` dopo aver configurato l'accesso persistente).

## Collegare l'app
In GitHub: *Settings → Secrets and variables → Actions → Variables*, crea:

| Variabile | Valore |
|---|---|
| `VITE_PUSH_URL` | l'indirizzo del Worker, senza `/` finale |
| `VITE_VAPID_PUBLIC_KEY` | la chiave pubblica VAPID |

Poi rilancia il deploy (*Actions → Deploy su GitHub Pages → Run workflow*). Sono valori pubblici (finiscono nel JavaScript): nessun utente deve inserire nulla.

## Dispositivi Tuya (facoltativo)
Il Worker può controllare un dispositivo Tuya (per esempio un distributore di crocchette): quando segnala qualcosa, un'azione di Clean Duo va **da sola tra le cose da fare** e tutta la casa riceve una notifica.

**Come funziona.** Il Worker interroga le API cloud di Tuya con le chiavi del tuo progetto (una chiamata all'ora per dispositivo) e segnala solo quando la condizione **passa** da «non soddisfatta» a «soddisfatta» (poi si riarma quando torna normale). Il segnale viene messo in coda e **l'app lo applica al database** alla prima apertura o appena arriva la notifica. Il Worker non legge né scrive il database su Drive.

**1. Tuya IoT Platform** (<https://iot.tuya.com>)
1. *Cloud → Development →* il tuo progetto (es. «pet feeder») → *Overview*: copia **Access ID / Client ID** e **Access Secret / Client Secret**, e annota il **Data Center** (Europa centrale → `https://openapi.tuyaeu.com`; America → `tuyaus`; India → `tuyain`; Cina → `tuyacn`).
2. *Service API*: servono **IoT Core** e **Authorization Token Management**. Se una chiamata risponde `permission deny` o `1106`, apri *Service API* e sottoscrivi il servizio indicato nell'errore.
3. *Devices → Link App Account*: collega il tuo account Smart Life (QR code) così il distributore compare nel progetto. Copia il suo **Device ID**.

**2. Worker** (dalla cartella `worker/`)
```bash
npx wrangler secret put TUYA_ACCESS_ID
npx wrangler secret put TUYA_ACCESS_SECRET
```
In `wrangler.toml` togli il `#` davanti a `TUYA_ENDPOINT` e inserisci il tuo data center (se non è l'Europa). Poi `npx wrangler deploy`. `…/health` deve mostrare `"tuya":true`.

**3. App**: *Impostazioni → Automazioni → Collega un dispositivo Tuya*
1. Incolla il **Device ID** e premi **Leggi**: compaiono i dati veri del dispositivo (nome, online, codici e valori).
2. Tocca il dato che segnala «crocchette in esaurimento». I distributori usano spesso un campo `fault` a bit (un numero in cui ogni bit è un guasto: es. cibo in esaurimento, cibo finito, inceppato) oppure un livello (`full`/`low`/`empty`): **il bit o il valore dipendono dal modello**, quindi scegli «ha il bit attivo» + il numero del bit, oppure «è uguale a» + il valore.
3. **Verifica ora** dice se la condizione è soddisfatta *adesso*: per provarla svuota (o simula) il serbatoio e riverifica.
4. Scegli l'azione: una nuova («Riempire il distributore», in una stanza) o una esistente. L'azione resta **in attesa** finché il dispositivo non segnala; quando la completi torna in attesa del prossimo segnale.

**Limiti e note**
- Ritardo: fino a circa un'ora (intervallo di controllo predefinito). Il dispositivo può inoltre aggiornare i dati su Tuya solo quando si sincronizza. Per un controllo più frequente imposta `TUYA_POLL_MINUTES` (multiplo di 5, minimo 5).
- Le chiamate alle API Tuya hanno quote (il piano gratuito di prova è limitato): con un dispositivo e un controllo all'ora sono circa 720 chiamate al mese (più il token, in cache). Abbassare `TUYA_POLL_MINUTES` le aumenta in proporzione (ogni 10 minuti ≈ 4.300).
- Se la condizione è **già soddisfatta** quando colleghi il dispositivo, il segnale parte al primo controllo.
- Con l'app chiusa la notifica arriva subito (push), l'azione compare tra le cose da fare alla prima apertura.
- Errori comuni: `1004`/«sign invalid» = Access ID/Secret o data center sbagliati; `1106` = dispositivo non collegato al progetto o servizio API non sottoscritto.

## Attivare le notifiche sui dispositivi
Su ogni telefono o computer: *Impostazioni → Notifiche → Attiva notifiche*, poi concedi il permesso. Premi *Invia una notifica di prova* per verificare.

- Per ricevere le notifiche degli altri serve che il **tuo profilo membro abbia l'email** (la stessa del tuo account Google) e che anche chi le scrive abbia il server configurato.
- Cosa notificare si sceglie in *Notifiche → Avvisami quando* (si salva nel tuo profilo, così chi scrive sa a chi inviarle).
- **Promemoria**: *Notifiche → Promemoria delle azioni da fare* e l'orario. Arrivano solo i giorni in cui c'è qualcosa da fare per te (azioni libere o assegnate a te); il testo è generico perché nel frattempo qualcuno potrebbe averle completate.
- **iPhone:** serve iOS 16.4 o successivo e l'app **aggiunta alla schermata Home** (Safari → Condividi → Aggiungi a Home).
- **Android e computer:** funziona anche da browser.

## Accesso persistente (facoltativo)
Il Worker fa da intermediario OAuth: conserva il token di rinnovo e l'app ottiene token freschi da sola.

**Prima di attivarlo, due cose da sapere**
- Il Worker custodirà, per ogni persona che lo attiva, un token di rinnovo del permesso ristretto `drive.file` (solo i file dell'app) e il **client secret** dell'app. È cifrato (AES-GCM, chiave `SESSION_KEY` nei segreti di Cloudflare) e non esce mai dal Worker, ma chi controllasse il tuo account Cloudflare potrebbe usarlo: attiva la verifica in due passaggi.
- Sul dispositivo resta un identificativo di sessione casuale in `localStorage`. Se su `<utente>.github.io` pubblichi anche altri siti, valuta un dominio dedicato.

**1. Google Cloud Console**
1. **Pubblica l'app**: *Google Auth Platform → Pubblico* → **Pubblica app** (*In produzione*). In *Testing* Google fa scadere i token di rinnovo dopo **7 giorni**. Con il solo scope `drive.file` non serve la verifica.
2. **URI di reindirizzamento**: nel tuo ID client OAuth aggiungi `https://cleanduo-push.<tuo-nome>.workers.dev/auth/callback` (l'indirizzo del Worker + `/auth/callback`).
3. **Client secret**: copialo dalla stessa pagina. Non incollarlo in chat né nel repository.

**2. Worker**
```bash
node worker/scripts/generate-session-key.mjs   # stampa SESSION_KEY
cd worker
```
- in `wrangler.toml` togli il `#` davanti a `GOOGLE_CLIENT_ID` e inserisci l'ID client (è pubblico);
- imposta i due segreti e ripubblica:
  ```bash
  npx wrangler secret put GOOGLE_CLIENT_SECRET
  npx wrangler secret put SESSION_KEY
  npx wrangler deploy
  ```
- `…/health` deve mostrare `{"ok":true,"auth":true}`.

**3. App**: nessuna modifica. «Accedi con Google» passa dal Worker; dove sei già dentro: *Impostazioni → Sincronizzazione → Attiva l'accesso persistente*.

> Il **Client ID del Worker deve essere lo stesso** di `VITE_GOOGLE_CLIENT_ID`: con `drive.file` l'accesso ai file è legato al client OAuth, quindi il database creato con un client non è visibile a un altro.

**Come si gestisce**
- *Esci* elimina la sessione **di quel dispositivo** (non revoca il token su Google, per non scollegare gli altri dispositivi).
- Per revocare tutto: <https://myaccount.google.com/permissions> → Clean Duo → Rimuovi accesso.
- Se cambi `SESSION_KEY`, le sessioni esistenti non sono più leggibili: basta rifare l'accesso. Le sessioni scadono dopo 180 giorni di inattività.

**Problemi comuni**
- *«Google non ha rilasciato il token di rinnovo»*: l'app era già autorizzata. Rimuovi l'accesso su myaccount.google.com/permissions e riprova.
- *`redirect_uri_mismatch`*: l'URI al punto 1.2 non coincide con l'indirizzo del Worker (compresi `https://` e `/auth/callback`).
- *Chiede di nuovo l'accesso dopo 7 giorni*: l'app è ancora in *Testing*.
- *«Origine non autorizzata»* (403): `ALLOWED_ORIGINS` deve contenere l'origine dell'app, senza percorso.
- *«Sessione Google non valida»* (401): token scaduto; tocca *Riconnetti*.
- *«Nessun accesso al database»* (403): l'account non ha accesso al file del database.
- *La prova non arriva*: controlla il permesso notifiche del sito e che l'app sia in background (in primo piano compare la campanella). Log: `npx wrangler tail`.

## Limiti
- La notifica parte solo per le modifiche **fatte dall'app** (non per quelle fatte a mano sul file in Drive).
- Se sei offline le notifiche restano in coda sul dispositivo (fino a 24 ore, max 100) e partono dopo l'invio dei dati.
- Un'importazione di massa (più di 20 elementi) non invia notifiche.
- Il testo delle notifiche è nella lingua di chi le genera.
