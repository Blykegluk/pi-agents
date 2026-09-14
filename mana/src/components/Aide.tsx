import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FAQ } from '../lib/faq'
import { creerDemande, mesDemandes, type Demande } from '../lib/cloud'

export const LIBELLES_STATUT: Record<Demande['statut'], { texte: string; classe: string }> = {
  nouvelle: { texte: 'envoyée', classe: 'badge' },
  en_cours: { texte: 'en cours', classe: 'badge' },
  traitee: { texte: 'traitée', classe: 'badge vert' },
}

/**
 * Aide & contact : FAQ cherchable, et si la réponse n'y est pas, une demande
 * part vers l'équipe Mana (suivie ici même, avec fil de discussion).
 */
export function Aide({
  session,
  ouvert,
  onFermer,
  onConnexion,
  onOuvrirMessages,
}: {
  session: Session | null
  ouvert: boolean
  onFermer: () => void
  onConnexion: () => void
  onOuvrirMessages: () => void
}) {
  const [recherche, setRecherche] = useState('')
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [texteRequete, setTexteRequete] = useState('')
  const [message, setMessage] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  useEffect(() => {
    if (ouvert && session) {
      mesDemandes().then(setDemandes).catch(() => {})
    }
    if (!ouvert) setMessage('')
  }, [ouvert, session])

  if (!ouvert) return null

  const q = recherche.trim().toLowerCase()
  const resultats = q
    ? FAQ.filter((e) => `${e.question} ${e.reponse} ${e.motsCles}`.toLowerCase().includes(q))
    : FAQ

  async function envoyerRequete() {
    if (!session || !texteRequete.trim()) return
    setEnvoiEnCours(true)
    try {
      const sujet = texteRequete.trim().slice(0, 90) + (texteRequete.trim().length > 90 ? '…' : '')
      await creerDemande(session.user.id, session.user.email ?? '', 'support', sujet, {}, texteRequete)
      setTexteRequete('')
      setMessage('Demande envoyée — la réponse arrivera dans l’onglet Messages.')
      setDemandes(await mesDemandes())
    } catch (e) {
      setMessage((e as Error).message)
    }
    setEnvoiEnCours(false)
  }

  return (
    <div className="sheet-backdrop" onClick={onFermer}>
      <div className="sheet" role="dialog" aria-label="Aide et contact" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
        <div className="sheet-handle" />
        <h3>Aide &amp; contact</h3>

        <input
          type="text"
          placeholder="Cherchez votre question (ex. DLC, pesée, facture…)"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ marginBottom: 10 }}
        />

        {resultats.map((e) => (
          <details key={e.question} style={{ borderBottom: '1px solid var(--trait-doux)', padding: '8px 0' }}>
            <summary style={{ fontWeight: 600, fontSize: 14.5, cursor: 'pointer' }}>{e.question}</summary>
            <p className="muted" style={{ margin: '8px 0 4px', fontSize: 14, lineHeight: 1.55 }}>{e.reponse}</p>
          </details>
        ))}
        {resultats.length === 0 && <p className="muted">Aucune réponse trouvée pour « {recherche} ».</p>}

        <div style={{ background: 'var(--sable)', borderRadius: 10, padding: '13px 15px', marginTop: 14 }}>
          <strong style={{ fontSize: 14 }}>Vous n’avez pas trouvé votre réponse ?</strong>
          {session ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <textarea
                rows={3}
                placeholder="Décrivez votre question ou votre problème — l’équipe Mana vous répond ici."
                value={texteRequete}
                onChange={(e) => setTexteRequete(e.target.value)}
              />
              <button className="btn btn-primary" onClick={envoyerRequete} disabled={envoiEnCours || !texteRequete.trim()} style={{ opacity: texteRequete.trim() ? 1 : 0.5 }}>
                Envoyer ma demande à Mana
              </button>
              {message && <p className="muted" style={{ margin: 0, color: 'var(--vert)' }}>{message}</p>}
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <p className="muted" style={{ margin: '0 0 8px' }}>Connectez-vous pour envoyer une demande à l’équipe Mana et suivre les réponses.</p>
              <button className="btn btn-primary btn-sm" onClick={onConnexion}>Se connecter / créer un compte</button>
            </div>
          )}
        </div>

        {session && demandes.length > 0 && (
          <div className="info-banner vert" style={{ marginTop: 14 }}>
            <strong>
              {demandes.length} échange{demandes.length > 1 ? 's' : ''} en cours avec Mana.
            </strong>{' '}
            Les réponses arrivent dans l’onglet Messages.{' '}
            <button className="amt" onClick={onOuvrirMessages}>
              Ouvrir mes messages
            </button>
          </div>
        )}

        <button className="btn btn-ghost" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </div>
  )
}
