import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  creerDemande,
  envoyerMessage,
  marquerLu,
  mesDemandes,
  messagesDe,
  type Demande,
  type Message,
  type NonLus, compteId } from '../lib/cloud'
import { fmtDateHeure } from '../lib/format'
import { Composer } from '../components/Composer'
import { LIBELLES_STATUT } from '../components/Aide'
import { IconMessages } from '../components/Icons'

/**
 * Messages — le fil de discussion avec l'équipe Mana : mises en relation,
 * questions restées sans réponse dans la FAQ. Ouvrir un fil le marque lu,
 * ce qui éteint la pastille de l'onglet (marqueur stocké côté serveur, donc
 * partagé entre le téléphone et l'ordinateur).
 */
export function Messages({
  session,
  nonLus,
  onLu,
  onConnexion,
  onOuvrirAide,
}: {
  session: Session | null
  nonLus: NonLus
  onLu: () => void
  onConnexion: () => void
  onOuvrirAide: () => void
}) {
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [fil, setFil] = useState<Message[]>([])
  const [nouvelle, setNouvelle] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (session) mesDemandes().then(setDemandes).catch(() => {})
    else setDemandes([])
  }, [session])

  // Ouvrir un fil : on charge les messages et on éteint sa pastille.
  useEffect(() => {
    if (!ouverte) return
    messagesDe(ouverte).then(setFil).catch(() => setFil([]))
    marquerLu(ouverte, 'client').then(onLu).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte])

  // Le fil le plus récemment actif s'ouvre tout seul — on arrive ici pour lire.
  useEffect(() => {
    if (!ouverte && demandes.length > 0) setOuverte(demandes[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandes])

  async function repondre(d: Demande, texte: string) {
    await envoyerMessage(d.id, d.user_id, 'client', texte)
    setFil(await messagesDe(d.id))
    onLu()
  }

  async function ouvrirDemande(texte: string) {
    if (!session) return
    const sujet = texte.slice(0, 90) + (texte.length > 90 ? '…' : '')
    await creerDemande(compteId(session), session.user.email ?? '', 'support', sujet, {}, texte)
    const liste = await mesDemandes()
    setDemandes(liste)
    setOuverte(liste[0]?.id ?? null)
    setNouvelle(false)
    setMessage('Demande envoyée — la réponse de Mana arrivera dans ce fil.')
    onLu()
  }

  if (!session) {
    return (
      <div>
        <h2>Messages</h2>
        <div className="card empty">
          <span className="ico">
            <IconMessages />
          </span>
          Connectez-vous pour écrire à l’équipe Mana et suivre ses réponses — sur le site comme sur le téléphone.
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={onConnexion}>
            Se connecter / créer un compte
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="etroit">
      <h2>Messages</h2>
      <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
        Vos échanges avec l’équipe Mana. Avant d’écrire, la réponse est peut-être déjà dans{' '}
        <button className="amt" onClick={onOuvrirAide}>
          les questions fréquentes
        </button>
        .
      </p>

      {message && (
        <div className="info-banner vert">
          {message}
        </div>
      )}

      {demandes.length === 0 && !nouvelle && (
        <div className="card empty">
          <span className="ico">
            <IconMessages />
          </span>
          Aucun échange pour l’instant.
        </div>
      )}

      {demandes.map((d) => {
        const nb = nonLus.parDemande[d.id] ?? 0
        const estOuverte = ouverte === d.id
        return (
          <div className={`card fil ${estOuverte ? 'ouvert' : ''}`} key={d.id}>
            <button className="fil-tete" onClick={() => setOuverte(estOuverte ? null : d.id)}>
              <span className="fil-sujet">
                {d.type === 'collecte' ? '🤝 ' : ''}
                {d.sujet}
              </span>
              <span className="fil-etat">
                {nb > 0 && <span className="pastille">{nb}</span>}
                <span className={LIBELLES_STATUT[d.statut].classe}>{LIBELLES_STATUT[d.statut].texte}</span>
              </span>
            </button>
            {estOuverte && (
              <div style={{ marginTop: 10 }}>
                {fil.map((m) => (
                  <div key={m.id} className={`bulle ${m.auteur === 'mana' ? 'mana' : 'moi'}`}>
                    <div className="bulle-tete">
                      {m.auteur === 'mana' ? 'Mana' : 'Vous'} · {fmtDateHeure(m.created_at)}
                    </div>
                    {m.texte}
                  </div>
                ))}
                {fil.length === 0 && <p className="muted">Demande transmise — la réponse de Mana arrivera ici.</p>}
                <Composer placeholder="Votre message à l’équipe Mana…" onEnvoyer={(texte) => repondre(d, texte)} />
              </div>
            )}
          </div>
        )
      })}

      {nouvelle ? (
        <div className="card">
          <h3>Nouvelle demande</h3>
          <Composer placeholder="Décrivez votre question ou votre problème…" onEnvoyer={ouvrirDemande} />
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setNouvelle(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => setNouvelle(true)}>
          Écrire à l’équipe Mana
        </button>
      )}
    </div>
  )
}
