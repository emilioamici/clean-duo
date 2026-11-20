import { Check, Crown, ExternalLink, FolderOpen, Mail, Minus, Pencil, Plus, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as drive from '../services/googleDriveService'
import { t } from '../i18n'
import { tb } from '../i18n/rich'
import { useApp } from '../store/AppContext'
import { useUi } from '../store/UiContext'
import { Avatar } from './ui'

const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

export function CommitInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input {...rest} className="field" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />
}

const Box = ({ children }: { children: React.ReactNode }) => <div className="rounded-2xl border border-line bg-bg/60 p-3">{children}</div>

/** Casa e membri in un'unica scheda (come in Money Duo): nome, membri, invito via email, posizione del database. */
export function FamilyCard() {
  const app = useApp()
  const { db, mode, fileId, user, me, status } = app
  const { openMemberSheet } = useUi()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [perms, setPerms] = useState<drive.DrivePermission[]>([])
  const inDrive = mode === 'drive' && !!fileId

  useEffect(() => {
    if (!inDrive || !fileId || status !== 'idle') return
    drive.listPermissions(fileId).then(setPerms).catch(() => setPerms([]))
  }, [inDrive, fileId, status, app.lastSyncAt])

  const owner = perms.find((p) => p.role === 'owner')?.emailAddress?.toLowerCase() ?? ''
  const isOwner = (e?: string) => !!e && !!owner && e.toLowerCase() === owner
  // se il proprietario non è noto (permessi non leggibili) non si blocca nulla
  const canInvite = !inDrive || !owner || user?.email.toLowerCase() === owner

  const invite = async () => {
    const mail = email.trim()
    setBusy(true); setErr(''); setInfo('')
    try {
      if (db.members.some((m) => m.email?.toLowerCase() === mail.toLowerCase())) {
        await app.shareWith(mail) // già nella casa: si rimanda l'invito (concede di nuovo l'accesso)
      } else await app.shareWith(mail, name)
      setInfo(t('Invito inviato a {email}. Deve accedere all’app con quell’account Google.', { email: mail }))
      setEmail(''); setName('')
      if (fileId) setPerms(await drive.listPermissions(fileId))
    } catch (e) { setErr(e instanceof Error ? e.message : t('Operazione non riuscita')) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label !mt-0">{t('Nome della casa')}</label>
        <CommitInput value={db.houseName} onCommit={(v) => app.updateSettings({ houseName: v.trim() || db.houseName })} />
      </div>

      <div>
        <p className="label !mt-0">{t('Membri')}</p>
        <ul className="divide-y divide-line/60">
          {db.members.map((m) => {
            const mine = me?.id === m.id
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Avatar member={m} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{m.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className="truncate">{m.email || t('nessuna email')}</span>
                    {isOwner(m.email) && <span className="flex items-center gap-0.5 font-semibold text-exp"><Crown size={12} />{t('Capofamiglia')}</span>}
                    {mine && <span className="font-semibold text-brand">{t('Tu')}</span>}
                  </p>
                </div>
                {!mine && !m.email && <button className="chip" onClick={() => app.setMeId(m.id)}>{t('Sono io')}</button>}
                <button className="glass-btn !p-2" onClick={() => openMemberSheet({ id: m.id })} aria-label={t('Modifica {name}', { name: m.name })}><Pencil size={15} /></button>
              </li>
            )
          })}
        </ul>
        {!me && <p className="mt-1 text-xs text-muted">{t('Scegli «Sono io» per attribuirti le stelle.')}</p>}
        {inDrive && user && !db.members.some((m) => m.email?.toLowerCase() === user.email.toLowerCase()) && (
          <button className="glass-btn btn-primary mt-2 w-full" onClick={() => { const id = app.upsertMember({ name: user.name.split(' ')[0] || t('Io'), email: user.email, avatar: '🐙', color: '#c0506a' }); app.setMeId(id) }}>
            <UserPlus size={16} /> {t('Aggiungi me')}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-line bg-bg/60 px-4 py-2">
        <span className="font-medium">{t('Obiettivo a testa: {n} ⭐/sett.', { n: db.settings.weeklyGoal })}</span>
        <span className="flex gap-2">
          <button className="glass-btn !p-2" aria-label="-" onClick={() => app.updateSettings({ weeklyGoal: Math.max(1, db.settings.weeklyGoal - 1) })}><Minus size={16} /></button>
          <button className="glass-btn !p-2" aria-label="+" onClick={() => app.updateSettings({ weeklyGoal: db.settings.weeklyGoal + 1 })}><Plus size={16} /></button>
        </span>
      </div>
      <div className="flex gap-2">
        <div className="w-16"><CommitInput value={db.settings.prizeEmoji} onCommit={(v) => app.updateSettings({ prizeEmoji: v })} aria-label={t('Emoji premio')} style={{ textAlign: 'center' }} /></div>
        <div className="flex-1"><CommitInput value={db.settings.prize} placeholder={t('Premio del mese per il vincitore')} onCommit={(v) => app.updateSettings({ prize: v })} /></div>
      </div>

      {!inDrive ? (
        <Box>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Mail size={16} className="text-brand" />{t('Aggiungi membro')}</p>
          <button className="glass-btn w-full" onClick={() => openMemberSheet({})}><Plus size={16} /> {t('Aggiungi membro')}</button>
          <p className="mt-2 text-xs text-muted">{t('Per invitare qualcuno via email collega prima la casa a Google Drive (Sincronizzazione e account).')}</p>
        </Box>
      ) : canInvite ? (
        <Box>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Mail size={16} className="text-brand" />{t('Aggiungi membro')}</p>
          <div className="space-y-2">
            <input className="field" type="email" inputMode="email" autoCapitalize="none" placeholder={t('Email Google della persona')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="field" placeholder={t('Nome (facoltativo)')} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="glass-btn btn-primary w-full !py-3" disabled={busy || !validEmail(email)} onClick={() => void invite()}>{t('Invia invito')}</button>
          </div>
          <p className="mt-2 text-xs text-muted">{tb('L’invito dà accesso in modifica al database su Drive e arriva per email con il link per entrare: la persona deve solo aprirlo e accedere con quell’account Google. Se l’app Google è in modalità <b>Testing</b>, aggiungi la stessa email anche tra gli <b>utenti di prova</b> in Google Cloud Console, altrimenti non potrà accedere.')}</p>
        </Box>
      ) : (
        <p className="rounded-xl bg-bg/60 p-3 text-xs text-muted">{t('Solo il capofamiglia ({owner}) può invitare nuovi membri.', { owner })}</p>
      )}
      {err && <p className="rounded-xl bg-exp/10 p-3 text-sm text-exp">{err}</p>}
      {info && <p className="flex items-center gap-2 rounded-xl bg-inc/10 p-3 text-sm text-inc"><Check size={16} className="shrink-0" />{info}</p>}

      {inDrive && fileId && (
        <div className="flex items-center gap-3 border-t border-line/70 pt-3 text-sm">
          <FolderOpen size={18} className="shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('Posizione del database')}</p>
            <p className="truncate text-xs text-muted">{drive.DB_FILE_NAME}</p>
          </div>
          <a className="inline-flex items-center gap-1 text-xs font-semibold text-brand" href={`https://drive.google.com/file/d/${fileId}/view`} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {t('Apri su Drive')}</a>
        </div>
      )}
    </div>
  )
}
