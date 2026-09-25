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

/** Ce que chaque genre de fil attend du magasin — dit d'emblée, pour ne pas ouvrir chaque fil « au cas où ». */
const GENRES: Record<Demande['type'], { icone: string; nom: string; attente: (d: Demande) => string }> = {
  suivi: {
    icone: '📋',
    nom: 'Suivi',
    attente: (d) =>
      d.contenu.rappels
        ? 'Rappels automatiques : rien à répondre. Saisissez le bordereau si l’association est venue.'
        : 'Mana relance l’association : rien à répondre. Corrigez sur le calendrier si elle est venue.',
  },
  collecte: { icone: '🤝', nom: 'Mise en relation', attente: () => 'Mana cherche une association et revient vers vous ici.' },
  association: { icone: '🔄', nom: 'Association', attente: () => 'Mana gère la relation et vous répond ici.' },
  support: { icone: '💬', nom: 'Question', attente: () => 'Réponse de Mana dans ce fil.' },
}
const genreDe = (d: Demande) => GENRES[d.type] ?? GENRES.support
const magasinDe = (d: Demande) => (typeof d.contenu.magasin === 'string' ? d.contenu.magasin : '')
import { IconMessages } from '../components/Icons'
import { useGrandEcran } from '../lib/ecran'

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
  const [voirTermines, setVoirTermines] = useState(false)
  // Grand écran : liste des fils à gauche, fil ouvert à droite. Mobile : accordéon, inchangé.
  const grand = useGrandEcran()

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
    if (ouverte || demandes.length === 0) return
    const nb = (d: Demande) => nonLus.parDemande[d.id] ?? 0
    const premier = demandes.find((d) => nb(d) > 0) ?? demandes.find((d) => d.statut !== 'traitee') ?? demandes[0]
    setOuverte(premier.id)
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

  const contenuFil = (d: Demande) => (
    <>
      {fil.map((m) => (
        <div key={m.id} className={`bulle ${m.auteur === 'mana' ? 'mana' : m.auteur === 'association' ? 'association' : 'moi'}`}>
          <div className="bulle-tete">
            {m.auteur === 'mana' ? 'Mana' : m.auteur === 'association' ? 'L’association (par e-mail)' : 'Vous'} · {fmtDateHeure(m.created_at)}
          </div>
          {m.texte}
        </div>
      ))}
      {fil.length === 0 && <p className="muted">Demande transmise — la réponse de Mana arrivera ici.</p>}
      <Composer placeholder="Votre message à l’équipe Mana…" onEnvoyer={(texte) => repondre(d, texte)} />
    </>
  )

  const nouvelleDemande = nouvelle ? (
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
  )

  // Ordre de lecture : ce qui a un message non lu, puis les fils en cours du plus récent au plus ancien ; les terminés à part.
  const nbNonLus = (d: Demande) => nonLus.parDemande[d.id] ?? 0
  const actifs = demandes.filter((d) => d.statut !== 'traitee').sort((a, b) => (nbNonLus(b) > 0 ? 1 : 0) - (nbNonLus(a) > 0 ? 1 : 0) || b.updated_at.localeCompare(a.updated_at))
  const termines = demandes.filter((d) => d.statut === 'traitee').sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const totalNonLus = actifs.reduce((t, d) => t + nbNonLus(d), 0)

  const synthese = demandes.length > 0 && (
    <div className={`info-banner${totalNonLus > 0 ? '' : ' vert'}`} style={{ marginBottom: 12 }}>
      {totalNonLus > 0
        ? <><strong>{totalNonLus} nouveau{totalNonLus > 1 ? 'x' : ''} message{totalNonLus > 1 ? 's' : ''}</strong>, en tête de liste. Les suivis et rappels n’attendent pas de réponse.</>
        : <>Rien de nouveau. Les suivis et rappels n’attendent pas de réponse.</>}
    </div>
  )

  const carteFil = (d: Demande, ouvrir: (id: string) => void) => {
    const nb = nbNonLus(d)
    const estOuverte = ouverte === d.id
    const g = genreDe(d)
    return (
      <button key={d.id} className={`card fil ${estOuverte ? 'ouvert' : ''}${d.statut === 'traitee' ? ' termine' : ''}`} onClick={() => ouvrir(d.id)}>
        <span className="fil-tete">
          <span className="fil-sujet">
            <span className="fil-genre">{g.icone} {g.nom}{magasinDe(d) ? ` · ${magasinDe(d)}` : ''}</span>
            {d.sujet}
          </span>
          {nb > 0 && <span className="pastille">{nb}</span>}
        </span>
        <span className="fil-attente muted">{nb > 0 ? 'Nouveau message de Mana. ' : ''}{g.attente(d)}</span>
        <span className="fil-etat">
          <span className={LIBELLES_STATUT[d.statut].classe}>{LIBELLES_STATUT[d.statut].texte}</span>
          <small className="muted">{fmtDateHeure(d.updated_at)}</small>
        </span>
      </button>
    )
  }

  if (grand) {
    const filOuvert = demandes.find((d) => d.id === ouverte)
    return (
      <div className="messages">
        <h2>Messages</h2>
        <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
          Une question ? Voyez d’abord{' '}
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
        {synthese}

        <div className="messages-grille">
          <aside className="messages-col">
            {demandes.length === 0 && !nouvelle && (
              <div className="card empty">
                <span className="ico">
                  <IconMessages />
                </span>
                Aucun échange pour l’instant.
              </div>
            )}
            {actifs.map((d) => carteFil(d, (id) => setOuverte(id)))}
            {termines.length > 0 && (
              <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 6 }} onClick={() => setVoirTermines((v) => !v)}>
                {voirTermines ? 'Masquer les fils terminés' : `${termines.length} fil${termines.length > 1 ? 's' : ''} terminé${termines.length > 1 ? 's' : ''}`}
              </button>
            )}
            {voirTermines && termines.map((d) => carteFil(d, (id) => setOuverte(id)))}
            {nouvelleDemande}
          </aside>
          <section className="card messages-fil">
            {filOuvert ? (
              <>
                <div className="fil-tete" style={{ cursor: 'default' }}>
                  <span className="fil-sujet">
                    <span className="fil-genre">{genreDe(filOuvert).icone} {genreDe(filOuvert).nom}{magasinDe(filOuvert) ? ` · ${magasinDe(filOuvert)}` : ''}</span>
                    {filOuvert.sujet}
                  </span>
                  <span className="fil-etat">
                    <span className={LIBELLES_STATUT[filOuvert.statut].classe}>{LIBELLES_STATUT[filOuvert.statut].texte}</span>
                  </span>
                </div>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{genreDe(filOuvert).attente(filOuvert)}</p>
                <hr className="sep" />
                <div className="messages-bulles">
                  {fil.map((m) => (
                    <div key={m.id} className={`bulle ${m.auteur === 'mana' ? 'mana' : m.auteur === 'association' ? 'association' : 'moi'}`}>
                      <div className="bulle-tete">
                        {m.auteur === 'mana' ? 'Mana' : m.auteur === 'association' ? 'L’association (par e-mail)' : 'Vous'} · {fmtDateHeure(m.created_at)}
                      </div>
                      {m.texte}
                    </div>
                  ))}
                  {fil.length === 0 && <p className="muted">Demande transmise — la réponse de Mana arrivera ici.</p>}
                </div>
                <Composer placeholder="Votre message à l’équipe Mana…" onEnvoyer={(texte) => repondre(filOuvert, texte)} />
              </>
            ) : (
              <div className="empty" style={{ margin: 'auto' }}>
                <span className="ico">
                  <IconMessages />
                </span>
                {demandes.length === 0 ? 'Écrivez à l’équipe Mana : la conversation s’affichera ici.' : 'Choisissez un fil à gauche pour le lire.'}
              </div>
            )}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="messages">
      <h2>Messages</h2>
      <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
        Une question ? Voyez d’abord{' '}
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

      {synthese}
      {[...actifs, ...(voirTermines ? termines : [])].map((d) => {
        const nb = nonLus.parDemande[d.id] ?? 0
        const estOuverte = ouverte === d.id
        const g = genreDe(d)
        return (
          <div className={`card fil ${estOuverte ? 'ouvert' : ''}${d.statut === 'traitee' ? ' termine' : ''}`} key={d.id}>
            <button className="fil-tete" onClick={() => setOuverte(estOuverte ? null : d.id)}>
              <span className="fil-sujet">
                <span className="fil-genre">{g.icone} {g.nom}{magasinDe(d) ? ` · ${magasinDe(d)}` : ''}</span>
                {d.sujet}
              </span>
              <span className="fil-etat">
                {nb > 0 && <span className="pastille">{nb}</span>}
                <span className={LIBELLES_STATUT[d.statut].classe}>{LIBELLES_STATUT[d.statut].texte}</span>
              </span>
            </button>
            {!estOuverte && <span className="fil-attente muted">{nb > 0 ? 'Nouveau message de Mana. ' : ''}{g.attente(d)}</span>}
            {estOuverte && <div style={{ marginTop: 10 }}>{contenuFil(d)}</div>}
          </div>
        )
      })}
      {termines.length > 0 && (
        <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 6 }} onClick={() => setVoirTermines((v) => !v)}>
          {voirTermines ? 'Masquer les fils terminés' : `${termines.length} fil${termines.length > 1 ? 's' : ''} terminé${termines.length > 1 ? 's' : ''}`}
        </button>
      )}

      {nouvelleDemande}
    </div>
  )
}
