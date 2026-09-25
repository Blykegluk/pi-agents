import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Magasin, Societe } from '../types'
import { ajouterAcces, listerAcces, supprimerAcces, type Acces } from '../lib/cloud'
import { fmtDate } from '../lib/format'

/**
 * Accès partagés : le propriétaire du compte ouvre ses données à d'autres
 * adresses e-mail, avec une portée — un magasin (son responsable), une société
 * (tous ses magasins) ou tout le compte (DAF, DG, assistante…). L'invité ne voit
 * que Saisie, Magasins (collecte seulement), Bilan et Messages ; jamais les
 * sociétés, le simulateur ni la console Mana.
 */
export function AccesPartages({ session, magasins, societes = [] }: { session: Session; magasins: Magasin[]; societes?: Societe[] }) {
  const [acces, setAcces] = useState<Acces[]>([])
  const [email, setEmail] = useState('')
  // 'tous' | 'societe:<id>' | 'magasin:<id>'
  const [portee, setPortee] = useState<string>(magasins.length === 1 ? `magasin:${magasins[0].id}` : 'tous')
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
      const [genre, id] = portee.split(':')
      const nouvel = await ajouterAcces(session.user.id, adresse, { magasinId: genre === 'magasin' ? id : null, societeId: genre === 'societe' ? id : null }, libelle)
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

  const nomPortee = (a: Acces) =>
    a.magasin_id
      ? `magasin ${magasins.find((m) => m.id === a.magasin_id)?.nom ?? 'supprimé'}`
      : a.societe_id
        ? `société ${societes.find((so) => so.id === a.societe_id)?.raisonSociale ?? 'supprimée'}`
        : 'tout le compte'

  return (
    <div className="card">
      <h3>Accès partagés</h3>
      <p className="muted" style={{ margin: '0 0 10px' }}>
        Ouvrez vos données à un responsable de magasin (son magasin), à un dirigeant ou un DAF (une société, ou tout le compte).
        La personne crée son propre compte Mana avec l’adresse indiquée et arrive directement sur vos données. Elle voit
        seulement Saisie, Magasins (la collecte, sans les sociétés), Bilan et Messages — jamais ces réglages.
      </p>

      {acces.length > 0 && (
        <div className="detail-lignes" style={{ marginBottom: 12 }}>
          {acces.map((a) => (
            <div className="ligne" key={a.id} style={{ alignItems: 'center', gap: 10 }}>
              <span style={{ minWidth: 0 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{a.email}</strong>
                <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                  {a.libelle ? `${a.libelle} · ` : ''}{nomPortee(a)} · depuis le {fmtDate(a.cree_le.slice(0, 10))}
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
            <option value="tous">Tout le compte (toutes les sociétés, tous les magasins)</option>
            {societes.length > 0 && (
              <optgroup label="Une société et ses magasins">
                {societes.map((so) => <option key={so.id} value={`societe:${so.id}`}>{so.raisonSociale}</option>)}
              </optgroup>
            )}
            {magasins.length > 0 && (
              <optgroup label="Un seul magasin">
                {magasins.map((m) => <option key={m.id} value={`magasin:${m.id}`}>{m.nom}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>Rôle (facultatif)</span>
          <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex. DAF, Responsable Ornano, Assistante" />
        </label>
      </div>
      <button className="btn btn-primary btn-block" disabled={enCours || !email.trim()} onClick={ajouter}>
        {enCours ? 'Ouverture…' : 'Donner l’accès'}
      </button>
      {message && <p className="muted" style={{ marginTop: 8, color: message.startsWith('Accès ouvert') ? 'var(--vert)' : 'var(--rouge)' }}>{message}</p>}
    </div>
  )
}
