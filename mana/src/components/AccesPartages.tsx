import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Magasin } from '../types'
import { ajouterAcces, listerAcces, supprimerAcces, type Acces } from '../lib/cloud'
import { fmtDate } from '../lib/format'

/**
 * Accès partagés : le propriétaire du compte ouvre ses données à d'autres
 * adresses e-mail — un magasin précis (son responsable) ou tous les magasins
 * (une assistante). L'invité ne voit que Collecte, Saisie, Tableau, Registre
 * et Messages ; jamais les sociétés, le simulateur ni la console Mana.
 */
export function AccesPartages({ session, magasins }: { session: Session; magasins: Magasin[] }) {
  const [acces, setAcces] = useState<Acces[]>([])
  const [email, setEmail] = useState('')
  const [portee, setPortee] = useState<string>('tous')
  const [libelle, setLibelle] = useState('')
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    listerAcces(session.user.id).then(setAcces).catch(() => setAcces([]))
  }, [session.user.id])

  async function ajouter() {
    const adresse = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
      setMessage('Adresse e-mail incomplète.')
      return
    }
    if (adresse === (session.user.email ?? '').toLowerCase()) {
      setMessage('C’est votre propre adresse : vous avez déjà tous les accès.')
      return
    }
    setEnCours(true)
    setMessage('')
    try {
      const nouvel = await ajouterAcces(session.user.id, adresse, portee === 'tous' ? null : portee, libelle)
      setAcces((l) => [...l, nouvel])
      setEmail('')
      setLibelle('')
      setMessage(`Accès ouvert à ${adresse}. Envoyez-lui le lien du site : elle ou il crée son compte avec cette adresse et retrouve directement vos données.`)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setEnCours(false)
    }
  }

  async function retirer(a: Acces) {
    if (!confirm(`Retirer l’accès de ${a.email} ? Cette personne ne verra plus vos données dès sa prochaine connexion.`)) return
    try {
      await supprimerAcces(a.id)
      setAcces((l) => l.filter((x) => x.id !== a.id))
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const nomMagasin = (id: string | null) => (id === null ? 'tous les magasins' : (magasins.find((m) => m.id === id)?.nom ?? 'magasin supprimé'))

  return (
    <div className="card">
      <h3>Accès partagés</h3>
      <p className="muted" style={{ margin: '0 0 10px' }}>
        Donnez accès à un responsable de magasin (un seul magasin) ou à votre assistante (tous les magasins). La
        personne crée son propre compte Mana avec l’adresse indiquée et arrive directement sur vos données. Elle voit
        seulement Collecte, Saisie, Tableau, Registre et Messages — ni les sociétés, ni ces réglages.
      </p>

      {acces.length > 0 && (
        <div className="detail-lignes" style={{ marginBottom: 12 }}>
          {acces.map((a) => (
            <div className="ligne" key={a.id} style={{ alignItems: 'center', gap: 10 }}>
              <span style={{ minWidth: 0 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{a.email}</strong>
                <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                  {a.libelle ? `${a.libelle} · ` : ''}{nomMagasin(a.magasin_id)} · depuis le {fmtDate(a.cree_le.slice(0, 10))}
                </span>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => retirer(a)} aria-label={`Retirer l’accès de ${a.email}`}>Retirer</button>
            </div>
          ))}
        </div>
      )}

      <div className="colonnes-2">
        <label className="field">
          <span>Adresse e-mail de la personne</span>
          <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ex. prenom@exemple.fr" />
        </label>
        <label className="field">
          <span>Accès à</span>
          <select value={portee} onChange={(e) => setPortee(e.target.value)} style={{ padding: 10 }}>
            <option value="tous">Tous les magasins (assistante)</option>
            {magasins.map((m) => <option key={m.id} value={m.id}>{m.nom} seulement</option>)}
          </select>
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>Rôle (facultatif)</span>
          <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex. Assistante, Responsable Ornano" />
        </label>
      </div>
      <button className="btn btn-primary btn-block" disabled={enCours || !email.trim()} onClick={ajouter}>
        {enCours ? 'Ouverture…' : 'Donner l’accès'}
      </button>
      {message && <p className="muted" style={{ marginTop: 8, color: message.startsWith('Accès ouvert') ? 'var(--vert)' : 'var(--rouge)' }}>{message}</p>}
    </div>
  )
}
