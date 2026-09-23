import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState, Collecteur, Magasin } from '../types'
import { FREQUENCES, PLAGES, RESEAUX_COLLECTEURS, recommanderFrequence, resumePassages } from '../lib/annuaire'
import { pdfAfficheTri, pdfBordereau } from '../lib/pdf'
import {
  IconBalance,
  IconCagette,
  IconCalendrier,
  IconDrapeau,
  IconMagasins,
  IconRelation,
  IconTri,
} from '../components/Icons'
import { creerDemande, mesDemandes, type Demande, compteId } from '../lib/cloud'
import { LIBELLES_STATUT } from '../components/Aide'

/** Raisons prédéfinies d'une demande de changement d'association : Mana gère la relation. */
const MOTIFS_CHANGEMENT = [
  'L’association ne vient plus',
  'Passages irréguliers ou en retard',
  'Elle ne reprend pas assez de produits',
  'Relation difficile sur place',
  'Nous voulons une association supplémentaire',
  'Autre raison',
]
import { fmtNum } from '../lib/format'
import { COLLECTEUR_VIDE, CollecteurForm, LIBELLES_ELIGIBILITE } from '../components/CollecteurForm'
import { denomination } from '../lib/identite'

/**
 * Mise en place de la collecte — l'accompagnement pas à pas : estimation des
 * invendus, définition du besoin, demande de mise en relation traitée par
 * l'équipe Mana (ou contact direct via l'annuaire), calendrier, tri, pesée.
 */

const ETAPES = [
  { id: 'gisement', titre: 'Estimer vos invendus' },
  { id: 'collecteurs', titre: 'Votre association et son calendrier' },
  { id: 'tri', titre: 'Former l’équipe au tri' },
  { id: 'pesee', titre: 'Organiser la pesée et les bordereaux' },
  { id: 'premiere', titre: 'Réussir la première collecte' },
] as const

/** Avancement de la mise en place d'un magasin, pour l'afficher sur sa fiche. */
export function avancementCollecte(m: Magasin): { faites: number; total: number } {
  const faites = m.miseEnPlace?.faites ?? []
  const n = ETAPES.filter((e) => (e.id === 'collecteurs' ? m.collecteurs.length > 0 || faites.includes(e.id) : faites.includes(e.id))).length
  return { faites: n, total: ETAPES.length }
}

const PICTOS: Record<string, ReactNode> = {
  gisement: <IconCagette />,
  collecteurs: <IconRelation />,
  tri: <IconTri />,
  pesee: <IconBalance />,
  premiere: <IconDrapeau />,
}


export function Collecte({
  state,
  session,
  onSaveMagasin,
  onAllerSaisie,
  onConnexion,
  onOuvrirAide,
  onOuvrirMessages,
  magasinIdFixe,
  focusAssociation,
}: {
  state: AppState
  session: Session | null
  onSaveMagasin: (m: Magasin) => void
  onAllerSaisie: () => void
  onConnexion: () => void
  onOuvrirAide: () => void
  onOuvrirMessages: () => void
  /** Intégré dans la fiche d'un magasin : ce magasin, sans titre ni sélecteur. */
  magasinIdFixe?: string
  /** Change de valeur quand on demande, depuis la fiche magasin, d'aller droit à l'étape Association. */
  focusAssociation?: number
}) {
  const [magasinChoisi, setMagasinId] = useState(state.magasins[0]?.id ?? '')
  const magasinId = magasinIdFixe ?? magasinChoisi
  const magasin = state.magasins.find((m) => m.id === magasinId) ?? state.magasins[0]
  const societe = state.societes.find((s) => s.id === magasin?.societeId)
  const [invendusSaisis, setInvendusSaisis] = useState('')

  // Demande de mise en relation — préréglée sur ce que le magasin a déjà indiqué
  const [frequence, setFrequence] = useState<string>('')
  const [editionCollecteur, setEditionCollecteur] = useState<number | null>(null)
  const [brouillon, setBrouillon] = useState<Collecteur>({ ...COLLECTEUR_VIDE })
  const [plage, setPlage] = useState<string>('')
  const [ville, setVille] = useState('')
  const [precision, setPrecision] = useState('')
  const [demandesCollecte, setDemandesCollecte] = useState<Demande[]>([])
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [messageDemande, setMessageDemande] = useState('')

  // Demande de changement d'association (l'association ne vient plus, passages irréguliers…)
  const [demandesAssociation, setDemandesAssociation] = useState<Demande[]>([])
  const [changementOuvert, setChangementOuvert] = useState(false)
  const [assoConcernee, setAssoConcernee] = useState('')
  const [motif, setMotif] = useState('')
  const [detailMotif, setDetailMotif] = useState('')
  const [envoiChangement, setEnvoiChangement] = useState(false)
  const [messageChangement, setMessageChangement] = useState('')
  const etapeAssociationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (session) {
      mesDemandes()
        .then((ds) => {
          setDemandesCollecte(ds.filter((d) => d.type === 'collecte'))
          setDemandesAssociation(ds.filter((d) => d.type === 'association'))
        })
        .catch(() => {})
    } else {
      setDemandesCollecte([])
      setDemandesAssociation([])
    }
  }, [session])

  // Depuis la fiche magasin, « Associations » amène droit ici : on fait défiler jusqu'à l'étape,
  // et s'il n'y a encore aucune association, on ouvre directement le formulaire d'enregistrement.
  useEffect(() => {
    if (!focusAssociation) return
    if (magasin && magasin.collecteurs.length === 0) {
      setBrouillon({ ...COLLECTEUR_VIDE })
      setEditionCollecteur(-1)
    }
    window.setTimeout(() => etapeAssociationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAssociation])

  if (!magasin || !societe) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconMagasins />
        </span>
        Créez d’abord votre société et votre magasin dans l’onglet « Magasins » — l’assistant vous prend ensuite en main
        pour mettre la collecte en place, étape par étape.
      </div>
    )
  }

  const mp = magasin.miseEnPlace ?? { faites: [] }
  const kgJour = mp.gisementKgJour ?? (Number(invendusSaisis) || 0)
  const reco = kgJour > 0 ? recommanderFrequence(kgJour) : null
  const demandeDuMagasin = demandesCollecte.find((d) => d.contenu?.magasin === magasin.nom)
  const changementsEnCours = demandesAssociation.filter((d) => d.contenu?.magasin === magasin.nom && d.statut !== 'traitee')

  async function envoyerChangement() {
    if (!session || !magasin || !motif) return
    setEnvoiChangement(true)
    setMessageChangement('')
    try {
      const asso = assoConcernee || (magasin.collecteurs.length === 1 ? magasin.collecteurs[0].nom : '')
      await creerDemande(
        compteId(session),
        session.user.email ?? '',
        'association',
        `${motif} — ${magasin.nom}${asso ? ` (${asso})` : ''}`,
        {
          magasin: magasin.nom,
          societe: societe?.raisonSociale ?? '',
          association_concernee: asso || 'aucune en particulier',
          motif,
          associations_en_place: magasin.collecteurs.map((c) => c.nom).join(', ') || 'aucune',
        },
        detailMotif.trim() || motif,
      )
      setDemandesAssociation((await mesDemandes()).filter((d) => d.type === 'association'))
      setChangementOuvert(false)
      setMotif('')
      setDetailMotif('')
      setMessageChangement('Demande envoyée : Mana reprend contact avec l’association ou vous en propose une autre, et vous tient au courant dans Messages.')
    } catch (e) {
      setMessageChangement((e as Error).message)
    }
    setEnvoiChangement(false)
  }

  const kgParPassage = (f: string) =>
    f === 'Quotidienne' ? kgJour : f === 'Hebdomadaire' ? kgJour * 7 : kgJour * 2.5

  // L'étape « association » est acquise dès qu'une association est enregistrée
  // — la demande de mise en relation ne suffit pas, elle n'est qu'une attente.
  const estFaite = (id: string) => {
    if (id === 'collecteurs') return magasin.collecteurs.length > 0 || mp.faites.includes(id)
    return mp.faites.includes(id)
  }
  const nbFaites = ETAPES.filter((e) => estFaite(e.id)).length
  const toutFait = nbFaites === ETAPES.length

  function basculer(id: string) {
    if (!magasin) return
    const faites = mp.faites.includes(id) ? mp.faites.filter((f) => f !== id) : [...mp.faites, id]
    onSaveMagasin({ ...magasin, miseEnPlace: { ...mp, faites } })
  }

  function enregistrerInvendus() {
    if (!magasin) return
    const kg = Number(invendusSaisis) || 0
    if (kg <= 0) return
    const faites = mp.faites.includes('gisement') ? mp.faites : [...mp.faites, 'gisement']
    onSaveMagasin({ ...magasin, miseEnPlace: { faites, gisementKgJour: kg } })
  }

  async function envoyerDemande() {
    if (!session || !magasin || !frequence || !plage || !ville.trim() || kgJour <= 0) return
    setEnvoiEnCours(true)
    setMessageDemande('')
    try {
      await creerDemande(
        compteId(session),
        session.user.email ?? '',
        'collecte',
        `Mise en relation — ${magasin.nom} (${ville.trim()})`,
        {
          magasin: magasin.nom,
          societe: societe?.raisonSociale ?? '',
          ville: ville.trim(),
          invendus_estimes: `${fmtNum(kgJour, 1)} kg/jour`,
          frequence_souhaitee: frequence,
          plage_horaire: plage,
          volume_par_passage: `≈ ${fmtNum(kgParPassage(frequence))} kg`,
        },
        precision,
      )
      setDemandesCollecte((await mesDemandes()).filter((d) => d.type === 'collecte'))
      setMessageDemande('Demande envoyée ! L’équipe Mana revient vers vous avec la ou les associations adaptées — suivez les échanges dans Aide & contact (bouton ? en haut).')
    } catch (e) {
      setMessageDemande((e as Error).message)
    }
    setEnvoiEnCours(false)
  }

  function CaseEtape({ id }: { id: string }) {
    const faite = estFaite(id)
    return (
      <button className={`btn btn-sm ${faite ? 'btn-primary' : 'btn-ghost'}`} onClick={() => basculer(id)} style={{ flex: 'none' }}>
        {faite ? '✓ Fait' : 'Marquer fait'}
      </button>
    )
  }

  /** En-tête d'une carte d'étape : picto, numéro, titre, action de droite. */
  function TeteEtape({ id, num, action }: { id: (typeof ETAPES)[number]['id']; num: number; action?: ReactNode }) {
    return (
      <div className="etape-tete">
        <span className="etape-pic">{PICTOS[id]}</span>
        <div className="etape-titres">
          <span className="num">Étape {num}</span>
          <h3>{ETAPES[num - 1].titre}</h3>
        </div>
        {action ?? <CaseEtape id={id} />}
      </div>
    )
  }

  return (
    <div>
      {!magasinIdFixe && <h2>Mettre en place ma collecte</h2>}

      {!magasinIdFixe && state.magasins.length > 1 && (
        <div className="chips">
          {state.magasins.map((m) => (
            <button key={m.id} className={`chip ${m.id === magasin.id ? 'active' : ''}`} onClick={() => setMagasinId(m.id)}>
              {m.nom}
            </button>
          ))}
        </div>
      )}

      <div className="etapes">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{magasin.nom}</h3>
          <span className="muted">{nbFaites}/{ETAPES.length} étapes</span>
        </div>
        <div className="progress">
          <div style={{ width: `${(nbFaites / ETAPES.length) * 100}%` }} />
        </div>
        {toutFait ? (
          <div className="info-banner vert" style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>Votre collecte est en place.</strong> Il ne reste qu’à saisir vos pertes chaque{' '}
            {magasin.frequenceSaisie === 'quotidienne' ? 'jour' : 'semaine'} — Mana s’occupe du reste.
          </div>
        ) : (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Pas encore de collecte en place ? Suivez les étapes dans l’ordre : on vous accompagne jusqu’à la première
            collecte réussie.
          </p>
        )}
      </div>

      {/* Étape 1 — estimer les invendus */}
      <div className={`card ${estFaite('gisement') ? 'faite' : ''}`}>
        <TeteEtape id="gisement" num={1} />
        <p className="muted">
          Pendant 2 ou 3 jours, regardez ce qui part à la poubelle alors que c’est encore consommable. Repère simple :
          une cagette de fruits &amp; légumes pleine ≈ 8 à 10 kg ; un bac de produits frais ≈ 5 kg.
        </p>
        <label className="field" style={{ marginBottom: 8 }}>
          <span>Invendus donnables, en moyenne</span>
          <div className="range-row">
            <div className="suffixe champ-large">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={invendusSaisis || (mp.gisementKgJour ?? '')}
                onChange={(e) => setInvendusSaisis(e.target.value)}
                placeholder="Ex. 12"
              />
              <em>kg/jour</em>
            </div>
            <button className="btn btn-primary btn-sm" onClick={enregistrerInvendus}>
              Valider
            </button>
          </div>
        </label>
        {reco && (
          <div className="info-banner" style={{ marginBottom: 0 }}>
            <strong>{reco.titre}.</strong> {reco.conseil}
          </div>
        )}
      </div>

      {/* Étape 2 — l'association : celle déjà connue, ou une mise en relation */}
      <div className={`card pleine ${estFaite('collecteurs') ? 'faite' : ''}`} ref={etapeAssociationRef} style={{ scrollMarginTop: 120 }}>
        <TeteEtape
          id="collecteurs"
          num={2}
          action={
            magasin.collecteurs.length > 0 ? (
              <span className="verif-badge">
                ✓ {magasin.collecteurs.length} association{magasin.collecteurs.length > 1 ? 's' : ''}
              </span>
            ) : undefined
          }
        />

        {/* A. Les associations enregistrées — la source unique, partout dans Mana */}
        {magasin.collecteurs.length > 0 && (
          <>
            <p className="muted">
              Ces coordonnées servent partout : bordereaux préremplis, reçus fiscaux, état annuel. Modifiez-les ici
              dès qu’un rythme ou un contact change.
            </p>
            {magasin.collecteurs.map((c, i) =>
              editionCollecteur === i ? (
                <div className="card" key={i} style={{ background: 'var(--papier)', marginBottom: 10 }}>
                  <CollecteurForm valeur={brouillon} onChange={setBrouillon} session={session} magasin={magasin} societe={societe} />
                  <div className="row-actions" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!brouillon.nom.trim()}
                      style={{ opacity: brouillon.nom.trim() ? 1 : 0.5, flex: 1 }}
                      onClick={() => {
                        onSaveMagasin({
                          ...magasin,
                          collecteurs: magasin.collecteurs.map((x, j) => (j === i ? { ...brouillon, nom: brouillon.nom.trim() } : x)),
                        })
                        setEditionCollecteur(null)
                      }}
                    >
                      Enregistrer
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditionCollecteur(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="facture-ligne" key={i}>
                  <div className="infos">
                    <strong>{c.nom}</strong>
                    <small>
                      {[resumePassages(c), c.contact, c.telephone, c.email].filter(Boolean).join(' · ') ||
                        'coordonnées à compléter'}
                    </small>
                    <span className={LIBELLES_ELIGIBILITE[c.eligibilite ?? 'inconnue'].classe} style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                      {LIBELLES_ELIGIBILITE[c.eligibilite ?? 'inconnue'].texte}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setBrouillon({ ...COLLECTEUR_VIDE, ...c })
                        setEditionCollecteur(i)
                      }}
                    >
                      Modifier
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm(`Retirer « ${c.nom} » de ce magasin ?`)) {
                          onSaveMagasin({ ...magasin, collecteurs: magasin.collecteurs.filter((_, j) => j !== i) })
                        }
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ),
            )}
          </>
        )}

        {/* A bis. Un problème avec une association en place : Mana gère la relation */}
        {magasin.collecteurs.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {changementsEnCours.map((d) => (
              <div className="info-banner" key={d.id} style={{ marginBottom: 8 }}>
                <strong>Demande {LIBELLES_STATUT[d.statut].texte} : {d.sujet}.</strong> Mana s’en occupe et vous répond dans Messages.{' '}
                <button className="amt" onClick={onOuvrirMessages}>Voir les messages</button>
              </div>
            ))}
            {messageChangement && <p className="muted" style={{ color: 'var(--vert)', marginBottom: 8 }}>{messageChangement}</p>}
            {!changementOuvert ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  if (!session) { onConnexion(); return }
                  setAssoConcernee(magasin.collecteurs.length === 1 ? magasin.collecteurs[0].nom : '')
                  setChangementOuvert(true)
                }}
              >
                ⚠ Un problème avec l’association ? Demander à Mana de changer
              </button>
            ) : (
              <div className="card" style={{ background: 'var(--papier)' }}>
                <h3>Demander un changement d’association</h3>
                <p className="muted">
                  Mana gère la relation avec les associations : nous recontactons celle en place pour régler le problème,
                  ou nous vous en proposons une nouvelle. Dites-nous simplement ce qui se passe.
                </p>
                {magasin.collecteurs.length > 1 && (
                  <label className="field">
                    <span>Association concernée</span>
                    <div className="chips" style={{ marginBottom: 0 }}>
                      {magasin.collecteurs.map((c) => (
                        <button key={c.nom} type="button" className={`chip ${assoConcernee === c.nom ? 'active' : ''}`} onClick={() => setAssoConcernee(c.nom)}>{c.nom}</button>
                      ))}
                      <button type="button" className={`chip ${assoConcernee === '' ? 'active' : ''}`} onClick={() => setAssoConcernee('')}>Aucune en particulier</button>
                    </div>
                  </label>
                )}
                <label className="field">
                  <span>Que se passe-t-il ? *</span>
                  <div className="chips" style={{ marginBottom: 0 }}>
                    {MOTIFS_CHANGEMENT.map((m) => (
                      <button key={m} type="button" className={`chip ${motif === m ? 'active' : ''}`} onClick={() => setMotif(m)}>{m}</button>
                    ))}
                  </div>
                </label>
                <label className="field">
                  <span>Précisions (facultatif)</span>
                  <textarea rows={3} value={detailMotif} onChange={(e) => setDetailMotif(e.target.value)} placeholder="Ex. plus de passage depuis le 10 septembre, personne ne répond au téléphone." />
                </label>
                <div className="row-actions">
                  <button className="btn btn-primary btn-sm" disabled={!motif || envoiChangement} style={{ opacity: motif && !envoiChangement ? 1 : 0.5, flex: 1 }} onClick={() => void envoyerChangement()}>
                    {envoiChangement ? 'Envoi…' : 'Envoyer à Mana'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setChangementOuvert(false)}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* B. Ajouter une association déjà trouvée */}
        {editionCollecteur === -1 ? (
          <div className="card" style={{ background: 'var(--papier)', marginTop: 12 }}>
            <h3>Enregistrer une association</h3>
            <CollecteurForm valeur={brouillon} onChange={setBrouillon} session={session} magasin={magasin} societe={societe} />
            <div className="row-actions" style={{ marginTop: 10 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={!brouillon.nom.trim()}
                style={{ opacity: brouillon.nom.trim() ? 1 : 0.5, flex: 1 }}
                onClick={() => {
                  onSaveMagasin({ ...magasin, collecteurs: [...magasin.collecteurs, { ...brouillon, nom: brouillon.nom.trim() }] })
                  setBrouillon({ ...COLLECTEUR_VIDE })
                  setEditionCollecteur(null)
                }}
              >
                Enregistrer l’association
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditionCollecteur(null)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            className={`btn btn-block btn-sm ${magasin.collecteurs.length > 0 ? 'btn-ghost' : 'btn-primary'}`}
            style={{ marginTop: magasin.collecteurs.length > 0 ? 12 : 0 }}
            onClick={() => {
              setBrouillon({ ...COLLECTEUR_VIDE })
              setEditionCollecteur(-1)
            }}
          >
            {magasin.collecteurs.length > 0 ? '+ Ajouter une autre association' : 'J’ai déjà une association — l’enregistrer'}
          </button>
        )}

        {/* C. Pas d'association : Mana s'en charge */}
        {demandeDuMagasin ? (
          <div className="info-banner vert" style={{ marginTop: 14, marginBottom: 0 }}>
            <strong>Recherche Mana {LIBELLES_STATUT[demandeDuMagasin.statut].texte}.</strong> Nous cherchons la ou les
            associations adaptées ({String(demandeDuMagasin.contenu.frequence_souhaitee ?? '')},{' '}
            {String(demandeDuMagasin.contenu.plage_horaire ?? '').toLowerCase()}). Dès que nous vous répondons,
            enregistrez-la avec le bouton ci-dessus.{' '}
            <button className="amt" onClick={onOuvrirMessages}>
              Voir les messages
            </button>
          </div>
        ) : (
          <details style={{ marginTop: 14 }} open={magasin.collecteurs.length === 0}>
            <summary style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--encre-2)' }}>
              {magasin.collecteurs.length === 0
                ? 'Pas encore d’association ? Mana vous en trouve une'
                : 'Besoin d’une association de plus ? Mana s’en charge'}
            </summary>
            <p className="muted" style={{ marginTop: 8 }}>
              Dites-nous ce qu’il vous faut : <strong>l’équipe Mana vous met en relation</strong> avec la ou les
              associations de votre secteur (deux combinées si vous voulez des passages quotidiens) et vous suit
              jusqu’à la première collecte.
            </p>
            <div className="colonnes-2">
              <label className="field">
                <span>Fréquence de ramassage souhaitée</span>
                <div className="chips" style={{ marginBottom: 0 }}>
                  {FREQUENCES.filter((f) => f !== 'Autre').map((f) => (
                    <button key={f} type="button" className={`chip ${frequence === f ? 'active' : ''}`} onClick={() => setFrequence(f)}>
                      {f}
                    </button>
                  ))}
                </div>
                {frequence && kgJour > 0 && (
                  <span className="aide">Soit environ {fmtNum(kgParPassage(frequence))} kg à chaque passage.</span>
                )}
              </label>
              <label className="field">
                <span>Plage horaire de ramassage</span>
                <div className="chips" style={{ marginBottom: 0 }}>
                  {PLAGES.filter((p) => p !== 'Autre').map((p) => (
                    <button key={p} type="button" className={`chip ${plage === p ? 'active' : ''}`} onClick={() => setPlage(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field">
                <span>Ville / code postal du magasin</span>
                <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ex. Paris 75011" />
              </label>
              <label className="field">
                <span>Précisions (facultatif)</span>
                <textarea rows={2} value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Ex. beaucoup de frais, accès quai de livraison, fermé le lundi…" />
              </label>
            </div>
            {kgJour <= 0 && <p className="muted" style={{ color: 'var(--ambre-texte)' }}>Complétez d’abord l’étape 1 (estimation des invendus).</p>}
            {session ? (
              <button
                className="btn btn-ambre btn-block"
                onClick={envoyerDemande}
                disabled={envoiEnCours || !frequence || !plage || !ville.trim() || kgJour <= 0}
                style={{ opacity: frequence && plage && ville.trim() && kgJour > 0 ? 1 : 0.5 }}
              >
                Envoyer ma demande de mise en relation
              </button>
            ) : (
              <div className="info-banner">
                Connectez-vous pour envoyer votre demande de mise en relation (et retrouver vos données partout).{' '}
                <button className="btn btn-primary btn-sm" style={{ marginTop: 8, display: 'flex' }} onClick={onConnexion}>
                  Se connecter / créer un compte
                </button>
              </div>
            )}
            {messageDemande && <p className="muted" style={{ marginTop: 8, color: 'var(--vert)' }}>{messageDemande}</p>}
          </details>
        )}

        <details style={{ marginTop: 12 }}>
          <summary style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--encre-2)' }}>
            Préférez chercher vous-même ? L’annuaire des réseaux
          </summary>
          <p className="muted" style={{ margin: '8px 0' }}>
            Vous gardez votre relation directe — aucune exclusivité. Confirmez toujours le rythme réel avec l’antenne locale.
          </p>
          <div className="reseaux">
            {RESEAUX_COLLECTEURS.map((r) => (
              <div className="reseau" key={r.nom}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 15 }}>{r.nom}</strong>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{r.site}</span>
                </div>
                <p className="muted" style={{ margin: '4px 0 6px' }}>{r.profil}</p>
                <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span><strong>Produits :</strong> {r.produits}</span>
                  <span><strong>Rythme :</strong> {r.rythme}</span>
                  <span><strong>Contact :</strong> {r.commentContacter}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Étape 3 — tri */}
      <div className={`card ${estFaite('tri') ? 'faite' : ''}`}>
        <TeteEtape id="tri" num={3} />
        <p className="muted">
          Le geste ne change pas : pendant la tournée DLC, le produit donnable part dans le bac « don » au lieu de la
          poubelle, scanné avec un motif de démarque « don » dédié si votre back-office le permet.
        </p>
        <div className="detail-lignes">
          <div className="ligne"><span>DLC du jour, de demain ou d’après-demain</span><span className="badge vert">donnable — jusqu’à la date incluse</span></div>
          <div className="ligne"><span>DDM dépassée (« de préférence avant »)</span><span className="badge vert">donnable</span></div>
          <div className="ligne"><span>F&amp;L moches mais sains, pain de la veille</span><span className="badge vert">donnables</span></div>
          <div className="ligne"><span>DLC dépassée, produit entamé, froid rompu, alcool</span><span className="badge alerte">jamais</span></div>
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => pdfAfficheTri(magasin.nom)}>
          ⬇ Imprimer l’affiche « Le bac don » pour la réserve
        </button>
      </div>

      {/* Étape 4 — pesée */}
      <div className={`card ${estFaite('pesee') ? 'faite' : ''}`}>
        <TeteEtape id="pesee" num={4} />
        <p className="muted">
          Les produits emballés sont valorisés par leur montant de démarque — rien à peser, on compte juste les colis
          remis (bacs, cartons ou sacs). Seuls les fruits &amp; légumes partent au poids : pesez chaque cagette ou sac
          sur la balance du rayon (ou un pèse-personne), déduisez la tare (~1 kg pour une cagette bois, négligeable
          pour un sac), notez le total sur le bordereau. Le collecteur contrôle et signe à chaque passage — prenez le
          bordereau en photo et joignez-le à la saisie de la semaine.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => pdfBordereau(magasin, denomination(societe))}>
          ⬇ Imprimer des bordereaux d’enlèvement vierges
        </button>
      </div>

      {/* Étape 5 — première collecte */}
      <div className={`card ${estFaite('premiere') ? 'faite' : ''}`}>
        <TeteEtape id="premiere" num={5} />
        <p className="muted">La veille du premier passage :</p>
        <div className="detail-lignes">
          <div className="ligne"><span>Le bac « don » est en réserve, au froid pour le frais, affiche au mur</span></div>
          <div className="ligne"><span>L’équipe du matin connaît la règle « jamais de DLC dépassée »</span></div>
          <div className="ligne"><span>Bordereaux imprimés à côté du bac, balance repérée pour les F&amp;L</span></div>
          <div className="ligne"><span>Après le passage : montant de démarque « don » + poids F&amp;L + photo du bordereau → saisie dans Mana</span></div>
        </div>
        <button className="btn btn-ambre btn-block" style={{ marginTop: 12 }} onClick={onAllerSaisie}>
          Faire ma première saisie
        </button>
      </div>

      </div>

      <footer className="legal">
        Objectif : moins de 10 % de produits refusés par le collecteur. Au-delà, resserrez le tri (étape 4) — et
        enregistrez les refus en correction dans la saisie.
      </footer>
    </div>
  )
}
