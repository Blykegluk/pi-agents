import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { FAQ } from '../lib/faq'
import { creerDemande, envoyerMessage, mesDemandes, messagesDe, type Demande, type Message } from '../lib/cloud'
import { fmtDateHeure } from '../lib/format'

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
}: {
  session: Session | null
  ouvert: boolean
  onFermer: () => void
  onConnexion: () => void
}) {
  const [recherche, setRecherche] = useState('')
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [fil, setFil] = useState<Message[]>([])
  const [reponse, setReponse] = useState('')
  const [texteRequete, setTexteRequete] = useState('')
  const [message, setMessage] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  useEffect(() => {
    if (ouvert && session) {
      mesDemandes().then(setDemandes).catch(() => {})
    }
    if (!ouvert) {
      setOuverte(null)
      setMessage('')
    }
  }, [ouvert, session])

  useEffect(() => {
    if (ouverte) messagesDe(ouverte).then(setFil).catch(() => setFil([]))
  }, [ouverte])

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
      setMessage('Demande envoyée — l’équipe Mana vous répond ici, dans « Mes échanges ».')
      setDemandes(await mesDemandes())
    } catch (e) {
      setMessage((e as Error).message)
    }
    setEnvoiEnCours(false)
  }

  async function repondre(d: Demande) {
    if (!session || !reponse.trim()) return
    await envoyerMessage(d.id, d.user_id, 'client', reponse)
    setReponse('')
    setFil(await messagesDe(d.id))
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
          <div style={{ marginTop: 16 }}>
            <h3>Mes échanges avec Mana</h3>
            {demandes.map((d) => (
              <div key={d.id} style={{ borderBottom: '1px solid var(--trait-doux)', padding: '10px 0' }}>
                <button
                  className="amt"
                  style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', textAlign: 'left', borderBottom: 'none' }}
                  onClick={() => setOuverte(ouverte === d.id ? null : d.id)}
                >
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {d.type === 'collecte' ? '🤝 ' : ''}{d.sujet}
                  </span>
                  <span className={LIBELLES_STATUT[d.statut].classe}>{LIBELLES_STATUT[d.statut].texte}</span>
                </button>
                {ouverte === d.id && (
                  <div style={{ marginTop: 8 }}>
                    {fil.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          background: m.auteur === 'mana' ? 'var(--sable)' : '#e3ebe3',
                          borderRadius: 10,
                          padding: '9px 12px',
                          marginBottom: 6,
                          fontSize: 14,
                        }}
                      >
                        <div style={{ fontSize: 11.5, color: 'var(--encre-3)', marginBottom: 2 }}>
                          {m.auteur === 'mana' ? 'Mana' : 'Vous'} · {fmtDateHeure(m.created_at)}
                        </div>
                        {m.texte}
                      </div>
                    ))}
                    {fil.length === 0 && <p className="muted">Demande transmise — réponse de Mana à venir ici.</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <input type="text" placeholder="Répondre…" value={reponse} onChange={(e) => setReponse(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && repondre(d)} style={{ flex: 1 }} />
                      <button className="btn btn-primary btn-sm" onClick={() => repondre(d)} disabled={!reponse.trim()} style={{ opacity: reponse.trim() ? 1 : 0.5 }}>
                        Envoyer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-ghost" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </div>
  )
}
