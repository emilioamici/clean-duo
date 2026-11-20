# Server delle notifiche e dell'accesso persistente (Cloudflare Worker)

Piccolo server gratuito che dà a Clean Duo due cose che un sito statico non può fare da solo:

1. **Notifiche push anche con l'app chiusa**: quando qualcuno completa o crea un'azione, o entra un nuovo membro, e i **promemoria** giornalieri delle azioni da fare.
2. **Accesso persistente a Google**: il token di Google dura 1 ora e un sito statico non può rinnovarlo da solo. Con questo server la sessione si rinnova da sola, anche in background, senza «Riconnetti».

Entrambe sono **facoltative**: senza server l'app funziona (notifiche solo con l'app aperta, accesso da rifare ogni ora).

## Come funziona
- Ogni dispositivo che attiva le notifiche si **iscrive** al server (indirizzo del servizio di push del browser + chiavi di cifratura).
- Chi fa una modifica **dice al server a chi inviare la notifica** (gli altri membri con email e con quel tipo di avviso attivo). La notifica parte solo dopo che i dati sono arrivati su Drive. Il messaggio è cifrato fino al dispositivo (RFC 8291); il testo passa dal server (nome dell'azione e di chi l'ha fatta).
- **Promemoria**: il dispositivo comunica *quando* inviarsi cosa (max 8 voci, le sostituisce a ogni sincronizzazione); un cron ogni 5 minuti invia quelli scaduti. Il server non conosce il database.
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
