import type { Societe } from '../types'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  envoyerMessage,
  listerClients,
  marquerLu,
  majContenuDemande,
  majStatutDemande,
  mesDemandes,
  messagesDe,
  listerSignaux,
  majStatutSignal,
  derniereSurveillance,
  lancerSurveillance,
  enregistrerRedaction,
  listerRedactions,
  lireParametre,
  ecrireParametre,
  redigerAvecStyle,
  deduireRegles,
  listerBrouillonsReponse,
  preparerReponse,
  majBrouillonReponse,
  remplacerBrouillonsEnAttente,
  type BrouillonReponse,
  type Redaction,
  type Signal,
  type Surveillance,
  type ClientAdmin,
  type Demande,
  type Message,
  type NonLus,
} from '../lib/cloud'
import { Composer } from '../components/Composer'
import { Reseau } from '../components/Reseau'
import { ActionsAssociation, type EnvoiConsigne } from '../components/ActionsAssociation'
import { aggParSociete } from '../lib/selectors'
import { fmtDateHeure, fmtEUR, fmtNum } from '../lib/format'
import { LIBELLES_STATUT } from '../components/Aide'
import { exerciceCourant } from '../lib/demo'
import { ACTIONS_SIGNAL, LIBELLES_NIVEAU, type TypeSignal } from '../lib/signaux'
import { ECART_LEGER, SEUIL_NOMBRE, SEUIL_TAUX, ecartTextes } from '../lib/ecart'

/**
 * Console administrateur Mana. Quatre entrées : ce qu'il y a à faire aujourd'hui,
 * les dossiers (un par demande ou fil de suivi, lisibles d'un coup d'œil), les
 * signaux de la surveillance nocturne, les clients ; plus le style de rédaction
 * et les documents de l'éditeur.
 */
import { pdfConventionIntraGroupe } from '../lib/pdf'

type Onglet = 'afaire' | 'dossiers' | 'signaux' | 'clients' | 'style' | 'documents'

const GENRE_DEMANDE: Record<Demande['type'], string> = { suivi: 'Suivi de collecte', collecte: 'Mise en relation', association: 'Association', support: 'Question' }
const genreDemande = (d: Demande) => (d.type === 'suivi' && d.contenu.rappels ? 'Rappels au magasin' : GENRE_DEMANDE[d.type])
const ETAPES: Record<string, string> = { verifier_magasin: 'Vérifier avec le magasin', relance_association: 'Relancer l’association', remplacement: 'Trouver une association de remplacement' }
/** Champs d'une demande qui méritent d'être lus, dans cet ordre, avec leur libellé. */
const CHAMPS: [string, string][] = [
  ['motif', 'Motif'],
  ['association_concernee', 'Association concernée'],
  ['association_contact', 'Contact'],
  ['association_email', 'E-mail'],
  ['rythme_convenu', 'Rythme convenu'],
  ['frequence_souhaitee', 'Rythme souhaité'],
  ['plage_horaire', 'Créneau'],
  ['invendus_estimes', 'Invendus estimés'],
  ['volume_par_passage', 'Volume par passage'],
  ['ville', 'Ville'],
  ['adresse_magasin', 'Adresse du magasin'],
  ['associations_en_place', 'Associations en place'],
  ['mois', 'Mois'],
  ['ecran', 'Écran'],
]
const texteDe = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : '')

/** Le dossier en clair : magasin, société, association, motif, étape — sans les clés techniques. */
function ResumeDossier({ d }: { d: Demande }) {
  const c = d.contenu
  if (d.type === 'suivi' && c.rappels) {
    return <p className="muted" style={{ margin: '6px 0 0' }}>Rappels automatiques envoyés au magasin (bordereau de la veille, relevé du mois). Rien à faire côté Mana, sauf si le magasin répond.</p>
  }
  const lignes: [string, string][] = []
  if (d.type === 'suivi') {
    const etape = ETAPES[texteDe(c.etape)]
    if (etape) lignes.push(['Étape', etape])
    const asso = texteDe(c.association_concernee)
    const contact = [texteDe(c.association_contact), texteDe(c.association_email) || 'pas d’e-mail enregistré'].filter(Boolean).join(' · ')
    if (asso) lignes.push(['Association', `${asso} — ${contact}`])
    for (const cle of ['motif', 'rythme_convenu', 'adresse_magasin'] as const) {
      const v = texteDe(c[cle])
      if (v) lignes.push([CHAMPS.find(([k]) => k === cle)![1], v])
    }
  } else {
    for (const [cle, libelle] of CHAMPS) {
      const v = texteDe(c[cle])
      if (v) lignes.push([libelle, v])
    }
  }
  if (lignes.length === 0) return null
  return (
    <div className="dossier-resume">
      {lignes.map(([l, v]) => (
        <div key={l}>
          <span className="muted">{l}</span>
          <span className={v.includes('pas d’e-mail') ? 'ambre' : undefined}>{v}</span>
        </div>
      ))}
    </div>
  )
}

const CONFIANCE: Record<BrouillonReponse['confiance'], { texte: string; classe: string }> = {
  haute: { texte: 'Prête à envoyer', classe: 'badge vert' },
  moyenne: { texte: 'À relire', classe: 'badge' },
  basse: { texte: 'À vérifier', classe: 'badge alerte' },
}

/**
 * La réponse que Mana a préparée au dernier message du client : on la relit, on la corrige au
 * besoin, on l'envoie. Ce qui part est comparé à ce qui était proposé ; c'est de là que Mana
 * apprend, et c'est ce taux qui ouvre l'envoi autonome.
 */
function ReponsePreparee({ brouillon, onValider, onAutreVersion, onEcarter }: {
  brouillon: BrouillonReponse
  onValider: (texte: string) => Promise<void>
  onAutreVersion: (consigne: string) => Promise<void>
  onEcarter: () => Promise<void>
}) {
  const [texte, setTexte] = useState(brouillon.texte)
  const [consigne, setConsigne] = useState('')
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'regeneration'>('repos')
  const [erreur, setErreur] = useState('')
  useEffect(() => setTexte(brouillon.texte), [brouillon.id, brouillon.texte])
  const modifie = texte.trim() !== brouillon.texte.trim()
  const conf = CONFIANCE[brouillon.confiance]
  const agir = async (quoi: 'envoi' | 'regeneration', f: () => Promise<void>) => {
    setEtat(quoi)
    setErreur('')
    try {
      await f()
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setEtat('repos')
    }
  }
  return (
    <div className="reponse-preparee">
      <div className="reponse-preparee-tete">
        <strong>Réponse préparée par Mana</strong>
        <span className={conf.classe}>{conf.texte}</span>
      </div>
      <blockquote className="reponse-preparee-client">{brouillon.message_client}</blockquote>
      {brouillon.a_valider && brouillon.raison && <p className="reponse-preparee-raison">À vérifier : {brouillon.raison}</p>}
      <textarea rows={Math.min(14, Math.max(5, texte.split('\n').length + 1))} value={texte} onChange={(e) => setTexte(e.target.value)} />
      <div className="row-actions" style={{ marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={etat !== 'repos' || !texte.trim()} onClick={() => agir('envoi', () => onValider(texte))}>
          {etat === 'envoi' ? 'Envoi…' : modifie ? '✓ Envoyer ma version' : '✓ Valider et envoyer'}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={etat !== 'repos'} onClick={() => agir('regeneration', () => onAutreVersion(consigne))}>
          {etat === 'regeneration' ? 'Rédaction…' : '↻ Autre version'}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={etat !== 'repos'} onClick={() => agir('envoi', onEcarter)}>Écarter</button>
      </div>
      <input
        type="text"
        className="reponse-preparee-consigne"
        value={consigne}
        onChange={(e) => setConsigne(e.target.value)}
        placeholder="Indication pour une autre version (facultatif) : plus court, proposer un appel, rappeler le délai…"
      />
      {modifie && <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>Votre correction sera retenue : Mana s’en sert pour les prochaines réponses.</p>}
      {erreur && <p className="muted" style={{ margin: '6px 0 0', color: 'var(--rouge)' }}>{erreur}</p>}
    </div>
  )
}

export function Admin({ session, nonLus, onLu, societes = [] }: { session: Session; nonLus: NonLus; onLu: () => void
  societes?: Societe[]
}) {
  const [onglet, setOnglet] = useState<Onglet>('afaire')
  const [signaux, setSignaux] = useState<Signal[]>([])
  const [surveillance, setSurveillance] = useState<Surveillance | null>(null)
  const [surveillanceEnCours, setSurveillanceEnCours] = useState(false)
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [clients, setClients] = useState<ClientAdmin[]>([])
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [fil, setFil] = useState<Message[]>([])
  const [erreur, setErreur] = useState('')
  const [filtreDossiers, setFiltreDossiers] = useState<'actifs' | 'termines'>('actifs')
  const [brouillons, setBrouillons] = useState<{ enAttente: BrouillonReponse[]; traites: BrouillonReponse[] }>({ enAttente: [], traites: [] })
  const [preparation, setPreparation] = useState<Record<string, 'en_cours' | string>>({})
  const exercice = exerciceCourant()

  async function recharger() {
    try {
      setErreur('')
      const [d, c] = await Promise.all([mesDemandes(), listerClients()])
      setDemandes(d)
      setClients(c)
      listerBrouillonsReponse().then(setBrouillons).catch(() => {})
      // Les signaux ont leurs propres tables : une erreur là ne doit pas cacher les demandes.
      try {
        const [sg, sv] = await Promise.all([listerSignaux(), derniereSurveillance()])
        setSignaux(sg)
        setSurveillance(sv)
      } catch (e) {
        setErreur((e as Error).message)
      }
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  useEffect(() => {
    recharger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ouvrir un fil éteint sa pastille côté Mana, et amène le dossier à l'écran.
  useEffect(() => {
    if (!ouverte) return
    messagesDe(ouverte).then(setFil).catch(() => setFil([]))
    marquerLu(ouverte, 'mana').then(onLu).catch(() => {})
    window.setTimeout(() => document.getElementById(`dossier-${ouverte}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte])

  const nonLu = (d: Demande) => nonLus.parDemande[d.id] ?? 0
  const alertes = useMemo(() => signaux.filter((s) => s.statut === 'ouvert' && s.niveau === 'alerte').length, [signaux])
  const aTraiter = useMemo(() => signaux.filter((s) => s.statut === 'ouvert').length, [signaux])

  /** À faire : une ligne par chose qui attend Mana, la plus pressante d'abord, un seul bouton. */
  const aFaire = useMemo(() => {
    type Ligne = { cle: string; rang: number; badge: { texte: string; classe: string }; texte: string; demandeId?: string; signal?: boolean }
    const lignes: Ligne[] = []
    const parDemande = new Map(demandes.map((d) => [d.id, d]))
    const nomDossier = (d: Demande) => `${genreDemande(d)} · ${texteDe(d.contenu.magasin) || d.sujet}${texteDe(d.contenu.association_concernee) ? ` (${texteDe(d.contenu.association_concernee)})` : ''}`
    const prets = new Set(brouillons.enAttente.map((b) => b.demande_id))
    for (const b of brouillons.enAttente) {
      const d = parDemande.get(b.demande_id)
      if (!d || lignes.some((l) => l.demandeId === d.id)) continue
      const conf = CONFIANCE[b.confiance]
      lignes.push({ cle: `r:${b.id}`, rang: b.confiance === 'haute' ? 0.2 : 0.3, badge: { texte: conf.texte, classe: conf.classe }, texte: `Réponse préparée à valider — ${nomDossier(d)}`, demandeId: d.id })
    }
    for (const d of demandes) {
      if (d.statut === 'traitee' || prets.has(d.id)) continue
      const nb = nonLu(d)
      if (d.statut === 'nouvelle') lignes.push({ cle: `n:${d.id}`, rang: 0, badge: { texte: 'Nouveau', classe: 'badge alerte' }, texte: `Nouvelle demande — ${nomDossier(d)}`, demandeId: d.id })
      else if (nb > 0) lignes.push({ cle: `m:${d.id}`, rang: 1, badge: { texte: `${nb} non lu${nb > 1 ? 's' : ''}`, classe: 'badge' }, texte: `${nb > 1 ? 'Messages reçus' : 'Message reçu'} — ${nomDossier(d)}`, demandeId: d.id })
    }
    for (const s of signaux) {
      if (s.statut !== 'ouvert') continue
      const d = s.demande_id ? parDemande.get(s.demande_id) : undefined
      if (d && d.statut === 'traitee') continue
      lignes.push({
        cle: `s:${s.id}`,
        rang: s.niveau === 'alerte' ? 0.5 : s.niveau === 'attention' ? 2 : 3,
        badge: LIBELLES_NIVEAU[s.niveau],
        texte: `${s.titre}${d ? '' : ' — ' + (ACTIONS_SIGNAL[s.type as TypeSignal] ?? '')}`,
        demandeId: d?.id,
        signal: !d,
      })
    }
    return lignes.sort((a, b) => a.rang - b.rang)
  }, [demandes, signaux, nonLus, brouillons])

  async function changerStatutSignal(s: Signal, statut: 'ouvert' | 'traite' | 'ignore') {
    await majStatutSignal(s.id, statut)
    setSignaux(await listerSignaux())
  }

  async function surveillerMaintenant() {
    setSurveillanceEnCours(true)
    try {
      setErreur('')
      await lancerSurveillance()
      const [sg, sv] = await Promise.all([listerSignaux(), derniereSurveillance()])
      setSignaux(sg)
      setSurveillance(sv)
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setSurveillanceEnCours(false)
    }
  }

  async function repondre(d: Demande, texte: string, envoi?: EnvoiConsigne, alaMain = false) {
    if (!texte.trim()) return
    await envoyerMessage(d.id, d.user_id, 'mana', texte)
    if (alaMain) {
      await remplacerBrouillonsEnAttente(d.id).catch(() => {})
      listerBrouillonsReponse().then(setBrouillons).catch(() => {})
    }
    if (d.statut === 'nouvelle') await majStatutDemande(d.id, 'en_cours')
    if (envoi) {
      // Le style s'apprend de ce qui est parti ; la boucle de résolution, de ce qui a été envoyé à qui et quand.
      await enregistrerRedaction(envoi.genre, { a: envoi.propose.a, objet: envoi.propose.objet, corps: envoi.propose.corps }, envoi.brouillon, d.id).catch(() => {})
      const le = new Date().toISOString()
      const entree = { le, a: envoi.brouillon.a, nom: envoi.association?.nom, objet: envoi.brouillon.objet }
      const contenu = { ...d.contenu }
      if (envoi.genre === 'prospection') contenu.contacts = [...((contenu.contacts as unknown[]) ?? []), entree]
      else contenu.relances = [...((contenu.relances as unknown[]) ?? []), entree]
      await majContenuDemande(d.id, contenu)
    }
    setFil(await messagesDe(d.id))
    setDemandes(await mesDemandes())
    onLu()
  }

  async function changerStatut(d: Demande, statut: Demande['statut']) {
    await majStatutDemande(d.id, statut)
    setDemandes(await mesDemandes())
  }

  const brouillonDe = useMemo(() => {
    const m = new Map<string, BrouillonReponse>()
    for (const b of brouillons.enAttente) if (!m.has(b.demande_id)) m.set(b.demande_id, b)
    return m
  }, [brouillons])

  async function validerReponse(d: Demande, b: BrouillonReponse, texte: string) {
    const t = texte.trim()
    const ecart = ecartTextes(b.texte, t)
    await repondre(d, t)
    await majBrouillonReponse(b.id, { statut: ecart === 0 ? 'envoye' : 'corrige', texte_envoye: t, ecart: Math.round(ecart * 1000) / 1000 })
    // Même journal que les mails : l'onglet Style montre proposé / envoyé et en déduit des règles.
    await enregistrerRedaction('reponse_client', { a: '', objet: d.sujet, corps: b.texte }, { a: '', objet: d.sujet, corps: t }, d.id).catch(() => {})
    setBrouillons(await listerBrouillonsReponse())
  }

  async function demanderReponse(d: Demande, consigne = '') {
    setPreparation((p) => ({ ...p, [d.id]: 'en_cours' }))
    try {
      const b = await preparerReponse(d.id, consigne)
      setBrouillons(await listerBrouillonsReponse())
      setPreparation((p) => ({ ...p, [d.id]: b ? '' : 'Le dernier message du dossier n’est pas celui du client : rien à préparer.' }))
    } catch (e) {
      setPreparation((p) => ({ ...p, [d.id]: (e as Error).message }))
    }
  }

  function ouvrirDossier(id: string) {
    const d = demandes.find((x) => x.id === id)
    setFiltreDossiers(d?.statut === 'traitee' ? 'termines' : 'actifs')
    setOnglet('dossiers')
    setOuverte(id)
  }

  const dossiersVisibles = demandes
    .filter((d) => (filtreDossiers === 'actifs' ? d.statut !== 'traitee' : d.statut === 'traitee'))
    .sort((a, b) => (nonLu(b) > 0 ? 1 : 0) - (nonLu(a) > 0 ? 1 : 0) || b.updated_at.localeCompare(a.updated_at))
  const nbActifs = demandes.filter((d) => d.statut !== 'traitee').length
  const nbTermines = demandes.length - nbActifs

  const carteDossier = (d: Demande) => {
    const c = d.contenu
    const magasin = texteDe(c.magasin)
    const societe = texteDe(c.societe)
    const asso = texteDe(c.association_concernee)
    const nb = nonLu(d)
    const filOuvert = ouverte === d.id
    const clientsMultiples = new Set(demandes.map((x) => x.user_id)).size > 1
    return (
      <div className={`card dossier${d.statut === 'traitee' ? ' termine' : ''}`} key={d.id} id={`dossier-${d.id}`}>
        <div className="dossier-tete">
          <div style={{ minWidth: 0 }}>
            <span className="fil-genre">{genreDemande(d)}</span>
            <strong style={{ fontSize: 15 }}>
              {magasin ? `${magasin}${societe ? ` · ${societe}` : ''}${asso && asso !== 'aucune en particulier' ? ` — ${asso}` : ''}` : d.sujet}
            </strong>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {magasin && d.type !== 'suivi' ? `${d.sujet} · ` : ''}
              {clientsMultiples ? `${d.email ?? d.user_id} · ` : ''}ouvert le {fmtDateHeure(d.created_at)}
              {d.updated_at.slice(0, 16) !== d.created_at.slice(0, 16) ? ` · activité ${fmtDateHeure(d.updated_at)}` : ''}
            </div>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            {nb > 0 && <span className="pastille">{nb}</span>}
            <span className={LIBELLES_STATUT[d.statut].classe}>{LIBELLES_STATUT[d.statut].texte}</span>
          </span>
        </div>

        <ResumeDossier d={d} />

        {brouillonDe.get(d.id) ? (
          <ReponsePreparee
            key={brouillonDe.get(d.id)!.id}
            brouillon={brouillonDe.get(d.id)!}
            onValider={(texte) => validerReponse(d, brouillonDe.get(d.id)!, texte)}
            onAutreVersion={(consigne) => demanderReponse(d, consigne)}
            onEcarter={async () => {
              await majBrouillonReponse(brouillonDe.get(d.id)!.id, { statut: 'ecarte' })
              setBrouillons(await listerBrouillonsReponse())
            }}
          />
        ) : (
          (nb > 0 || d.statut === 'nouvelle' || (filOuvert && fil.length > 0 && fil[fil.length - 1].auteur === 'client')) && (
            <div className="row-actions" style={{ marginTop: 10, alignItems: 'center' }}>
              <button className="btn btn-ghost btn-sm" disabled={preparation[d.id] === 'en_cours'} onClick={() => demanderReponse(d)}>
                {preparation[d.id] === 'en_cours' ? 'Mana rédige…' : '✨ Préparer une réponse'}
              </button>
              {preparation[d.id] && preparation[d.id] !== 'en_cours' && <span className="muted" style={{ fontSize: 12.5 }}>{preparation[d.id]}</span>}
            </div>
          )
        )}

        {(d.type === 'association' || d.type === 'collecte' || (d.type === 'suivi' && !c.rappels)) && d.statut !== 'traitee' && (
          <ActionsAssociation
            demande={d}
            adminEmail={session.user.email ?? ''}
            onConsigner={(texte, envoi) => repondre(d, texte, envoi)}
            onStyliser={(genre, b) => redigerAvecStyle(genre, b)}
            onMajContenu={async (contenu) => {
              await majContenuDemande(d.id, contenu)
              setDemandes(await mesDemandes())
            }}
            onMessageClient={(texte) => repondre(d, texte)}
            onPropositions={async (associations, remarque) => {
              await majContenuDemande(d.id, { ...d.contenu, propositions: associations, propositions_remarque: remarque })
              setDemandes(await mesDemandes())
            }}
          />
        )}

        <div className="row-actions" style={{ marginTop: 10 }}>
          <button className={`btn btn-sm ${nb > 0 && !filOuvert ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOuverte(filOuvert ? null : d.id)}>
            {filOuvert ? 'Replier le fil' : nb > 0 ? `Lire les ${nb > 1 ? `${nb} messages` : 'message'}` : 'Fil avec le client'}
          </button>
          {d.statut === 'traitee' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => changerStatut(d, 'en_cours')}>Rouvrir</button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => changerStatut(d, 'traitee')}>✓ Clore le dossier</button>
          )}
        </div>

        {filOuvert && (
          <div className="dossier-fil">
            {fil.map((m) => (
              <div key={m.id} className={`bulle ${m.auteur === 'mana' ? 'mana' : m.auteur === 'association' ? 'association' : 'moi'}`} style={{ maxWidth: '100%' }}>
                <div className="bulle-tete">
                  {m.auteur === 'mana' ? 'Mana' : m.auteur === 'association' ? 'Association (e-mail reçu)' : 'Client'} · {fmtDateHeure(m.created_at)}
                </div>
                {m.texte}
              </div>
            ))}
            {fil.length === 0 && <p className="muted">Aucun message pour l’instant.</p>}
            <Composer placeholder="Votre message au client…" onEnvoyer={(texte) => repondre(d, texte, undefined, true)} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <h2>Console Mana</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Connecté en administrateur ({session.user.email}).{' '}
        <button className="amt" onClick={recharger}>Actualiser</button>
        {surveillance && (
          <> · Surveillance : dernier passage {fmtDateHeure(surveillance.commencee_le)}{surveillance.erreurs.length ? <span style={{ color: 'var(--rouge)' }}> · {surveillance.erreurs.length} erreur(s)</span> : ''}</>
        )}
      </p>
      {erreur && <div className="info-banner alerte">{erreur}</div>}

      <div className="chips">
        <button className={`chip ${onglet === 'afaire' ? 'active' : ''}`} onClick={() => setOnglet('afaire')}>
          À faire{aFaire.length > 0 ? ` (${aFaire.length})` : ''}
        </button>
        <button className={`chip ${onglet === 'dossiers' ? 'active' : ''}`} onClick={() => setOnglet('dossiers')}>
          Dossiers{nbActifs > 0 ? ` (${nbActifs})` : ''}
        </button>
        <button className={`chip ${onglet === 'signaux' ? 'active' : ''}`} onClick={() => setOnglet('signaux')}>
          Signaux{aTraiter > 0 ? ` (${aTraiter}${alertes > 0 ? `, ${alertes} alerte${alertes > 1 ? 's' : ''}` : ''})` : ''}
        </button>
        <button className={`chip ${onglet === 'clients' ? 'active' : ''}`} onClick={() => setOnglet('clients')}>
          Clients ({clients.length})
        </button>
        <button className={`chip ${onglet === 'style' ? 'active' : ''}`} onClick={() => setOnglet('style')}>
          Réponses &amp; style
        </button>
        {societes.length > 0 && (
          <button className={`chip ${onglet === 'documents' ? 'active' : ''}`} onClick={() => setOnglet('documents')}>
            Documents
          </button>
        )}
      </div>

      {onglet === 'afaire' && (
        <div className="card">
          <h3>À faire aujourd’hui{aFaire.length > 0 ? ` (${aFaire.length})` : ''}</h3>
          {aFaire.length === 0 ? (
            <p className="muted" style={{ margin: '4px 0 0' }}>Rien en attente : aucune nouvelle demande, aucun message non lu, aucun signal ouvert.</p>
          ) : (
            <p className="muted" style={{ margin: '2px 0 6px' }}>Du plus pressant au moins pressant.</p>
          )}
          {aFaire.map((l) => (
            <div className="afaire-ligne" key={l.cle}>
              <span className={l.badge.classe} style={{ flex: 'none' }}>{l.badge.texte}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{l.texte}</span>
              {l.demandeId ? (
                <button className="btn btn-primary btn-sm" onClick={() => ouvrirDossier(l.demandeId!)}>Ouvrir le dossier</button>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setOnglet('signaux')}>Voir le signal</button>
              )}
            </div>
          ))}
        </div>
      )}

      {onglet === 'dossiers' && (
        <div>
          <div className="chips" style={{ marginTop: 0 }}>
            <button className={`chip ${filtreDossiers === 'actifs' ? 'active' : ''}`} onClick={() => setFiltreDossiers('actifs')}>En cours ({nbActifs})</button>
            <button className={`chip ${filtreDossiers === 'termines' ? 'active' : ''}`} onClick={() => setFiltreDossiers('termines')}>Clos ({nbTermines})</button>
          </div>
          {dossiersVisibles.length === 0 && <div className="card empty">{filtreDossiers === 'actifs' ? 'Aucun dossier en cours.' : 'Aucun dossier clos.'}</div>}
          {dossiersVisibles.map(carteDossier)}
        </div>
      )}

      {onglet === 'signaux' && (
        <SignauxAdmin
          signaux={signaux}
          clients={clients}
          surveillance={surveillance}
          enCours={surveillanceEnCours}
          onLancer={surveillerMaintenant}
          onStatut={changerStatutSignal}
          onOuvrirFil={ouvrirDossier}
        />
      )}

      {onglet === 'style' && (
        <>
          <AutonomieReponses
            traites={brouillons.traites}
            demandes={demandes}
            onOuvrirDossier={ouvrirDossier}
          />
          <StyleAdmin />
        </>
      )}

      {onglet === 'documents' && societes.length > 0 && (
        <div className="card">
          <h3>Documents LAB (éditeur de Mana)</h3>
          <p className="muted" style={{ margin: '0 0 8px' }}>
            Une convention intra-groupe par société cliente détenue par LAB, à signer une fois.
          </p>
          <div className="row-actions">
            {societes.map((so) => (
              <button key={so.id} className="btn btn-ghost btn-sm" onClick={() => void pdfConventionIntraGroupe(so)}>
                ⬇ Convention intra-groupe — {so.raisonSociale}
              </button>
            ))}
          </div>
        </div>
      )}

      {onglet === 'clients' && (
        <div>
          {clients.length === 0 && <div className="card empty">Aucun client synchronisé pour l’instant.</div>}
          {clients.map((c) => {
            const aggs = c.etat ? aggParSociete(c.etat, exercice) : []
            const baseTotale = aggs.reduce((t, a) => t + a.baseBrute, 0)
            const commissions = aggs.reduce((t, a) => t + a.commissionsHT, 0)
            const nbSaisies = c.etat?.saisies.length ?? 0
            const alerte = aggs.some((a) => a.alerteCA)
            const plafondAtteint = aggs.some((a) => a.plafondAtteint)
            return (
              <div className="card" key={c.user_id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 14.5, overflowWrap: 'anywhere' }}>{c.email ?? c.user_id}</strong>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>synchro {fmtDateHeure(c.updated_at)}</span>
                </div>
                {c.etat ? (
                  <div className="detail-lignes">
                    <div className="ligne">
                      <span>Sociétés / magasins / saisies</span>
                      <strong>{c.etat.societes.length} · {c.etat.magasins.length} · {fmtNum(nbSaisies)}</strong>
                    </div>
                    <div className="ligne">
                      <span>Base documentée (exercice)</span>
                      <strong>{fmtEUR(baseTotale, 2)}</strong>
                    </div>
                    <div className="ligne">
                      <span>Commissions facturées (HT)</span>
                      <strong>{fmtEUR(commissions, 2)}</strong>
                    </div>
                    {aggs.map((a) => (
                      <div className="ligne" key={a.societe.id}>
                        <span>{a.societe.raisonSociale}</span>
                        <span>
                          {Math.round((a.baseBrute / a.resultat.plafond) * 100)} % du plafond
                          {a.plafondAtteint ? ' · saturé' : ''}
                        </span>
                      </div>
                    ))}
                    {(alerte || plafondAtteint) && (
                      <div className="ligne">
                        <span>Signaux</span>
                        <span>
                          {alerte && <span className="badge alerte">alerte 2,5 % CA</span>}{' '}
                          {plafondAtteint && <span className="badge">plafond atteint</span>}
                        </span>
                      </div>
                    )}
                    <Reseau state={c.etat} compact />
                  </div>
                ) : (
                  <p className="muted">État illisible.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ORDRE_NIVEAU = { alerte: 0, attention: 1, info: 2 } as const
const ORDRE_STATUT = { ouvert: 0, traite: 1, ignore: 2, resolu: 3 } as const

function fmtJourCourt(j: string): string {
  const [y, m, d] = j.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Ce que le détail d'un signal a d'utile à lire, en une ligne. */
function resumeDetail(s: Signal): string {
  const d = s.detail
  const morceaux: string[] = []
  if (Array.isArray(d.dates) && d.dates.length) morceaux.push(`passages : ${(d.dates as string[]).map(fmtJourCourt).join(', ')}`)
  if (typeof d.dernierBordereau === 'string') morceaux.push(`dernier bordereau : ${fmtJourCourt(d.dernierBordereau)}`)
  if (typeof d.rythme === 'string') morceaux.push(`rythme compris : ${d.rythme}`)
  if (typeof d.part === 'number') morceaux.push(`${d.part} % du plafond (${fmtEUR(Number(d.base))} sur ${fmtEUR(Number(d.plafond))})`)
  if (typeof d.jours === 'number') morceaux.push(`${d.jours} jours`)
  if (typeof d.joursDepuisCreation === 'number') morceaux.push(`magasin créé il y a ${d.joursDepuisCreation} jours`)
  if (typeof d.note === 'string') morceaux.push(d.note)
  return morceaux.join(' · ')
}

/**
 * Onglet Signaux de la console : ce que la surveillance nocturne a relevé, par client,
 * du plus urgent au plus anodin. Semaine 1 du plan : la liste et son état ; les dossiers
 * de résolution (mails prêts, associations de remplacement) arrivent ensuite.
 */
function SignauxAdmin({
  signaux,
  clients,
  surveillance,
  enCours,
  onLancer,
  onStatut,
  onOuvrirFil,
}: {
  signaux: Signal[]
  clients: ClientAdmin[]
  surveillance: Surveillance | null
  enCours: boolean
  onLancer: () => void
  onStatut: (s: Signal, statut: 'ouvert' | 'traite' | 'ignore') => void
  onOuvrirFil: (demandeId: string) => void
}) {
  const emailDe = new Map(clients.map((c) => [c.user_id, c.email ?? c.user_id]))
  const nomMagasin = (s: Signal) => {
    const etat = clients.find((c) => c.user_id === s.user_id)?.etat
    return etat?.magasins.find((m) => m.id === s.magasin_id)?.nom ?? etat?.societes.find((so) => so.id === s.societe_id)?.raisonSociale ?? ''
  }
  const tries = [...signaux].sort(
    (a, b) => ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut] || ORDRE_NIVEAU[a.niveau] - ORDRE_NIVEAU[b.niveau] || b.mis_a_jour_le.localeCompare(a.mis_a_jour_le),
  )
  const parClient = new Map<string, Signal[]>()
  for (const s of tries) parClient.set(s.user_id, [...(parClient.get(s.user_id) ?? []), s])

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: 14.5 }}>Surveillance des collectes</strong>
            <div className="muted">
              {surveillance
                ? `Dernier passage ${fmtDateHeure(surveillance.commencee_le)} (${surveillance.declencheur.startsWith('admin') ? 'lancé à la main' : 'automatique'}) · ${surveillance.comptes} compte${surveillance.comptes > 1 ? 's' : ''} · ${surveillance.signaux_ouverts} signal${surveillance.signaux_ouverts > 1 ? 'aux' : ''} vivant${surveillance.signaux_ouverts > 1 ? 's' : ''}, ${surveillance.nouveaux} nouveau${surveillance.nouveaux > 1 ? 'x' : ''}, ${surveillance.resolus} résolu${surveillance.resolus > 1 ? 's' : ''} · ${surveillance.rappels ?? 0} rappel${(surveillance.rappels ?? 0) > 1 ? 's' : ''} au magasin · ${surveillance.courriels ?? 0} e-mail${(surveillance.courriels ?? 0) > 1 ? 's' : ''} expédié${(surveillance.courriels ?? 0) > 1 ? 's' : ''}${surveillance.erreurs.length ? ` · ${surveillance.erreurs.length} erreur(s)` : ''}`
                : 'Aucun passage enregistré pour l’instant : le moteur tourne chaque nuit vers 5 h.'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onLancer} disabled={enCours}>
            {enCours ? 'Surveillance en cours…' : 'Lancer maintenant'}
          </button>
        </div>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Sans bordereau 24 h après le créneau, le passage est manqué. 2 d’affilée : un dossier s’ouvre. 3 : alerte, Mana prend la main.
        </p>
        {surveillance?.erreurs.map((e, i) => (
          <div className="info-banner alerte" key={i} style={{ marginTop: 8 }}>{e.compte} : {e.erreur}</div>
        ))}
      </div>

      {parClient.size === 0 && <div className="card empty">Aucun signal vivant : tout est en ordre.</div>}
      {[...parClient.entries()].map(([userId, liste]) => (
        <div className="card" key={userId}>
          <strong style={{ fontSize: 14.5, overflowWrap: 'anywhere' }}>{emailDe.get(userId) ?? userId}</strong>
          {liste.map((s) => (
            <div className={`signal-ligne ${s.statut}`} key={s.id}>
              <span className={LIBELLES_NIVEAU[s.niveau].classe} style={{ flex: 'none', marginTop: 2 }}>{LIBELLES_NIVEAU[s.niveau].texte}</span>
              <div className="corps">
                <div>
                  <strong>{s.titre}</strong>
                  {nomMagasin(s) && !s.titre.includes(nomMagasin(s)) ? <span className="muted"> · {nomMagasin(s)}</span> : null}
                </div>
                {resumeDetail(s) && <small>{resumeDetail(s)}</small>}
                <small>
                  {ACTIONS_SIGNAL[s.type as TypeSignal] ?? ''} Ouvert {fmtDateHeure(s.ouvert_le)}
                  {s.statut !== 'ouvert' && s.traite_le ? ` · ${s.statut === 'traite' ? 'traité' : 'ignoré'} par ${s.traite_par ?? 'Mana'} le ${fmtDateHeure(s.traite_le)}` : ''}
                </small>
              </div>
              <div className="row-actions" style={{ flex: 'none', marginTop: 0 }}>
                {s.demande_id && (
                  <button className="btn btn-primary btn-sm" onClick={() => onOuvrirFil(s.demande_id!)}>Dossier</button>
                )}
                {s.statut === 'ouvert' ? (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => onStatut(s, 'traite')}>Traité</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => onStatut(s, 'ignore')}>Ignorer</button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => onStatut(s, 'ouvert')}>Rouvrir</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Apprentissage et autonomie des réponses aux clients : combien de réponses préparées ont été
 * envoyées sans retouche notable, et l'interrupteur de l'envoi autonome, qui ne s'ouvre qu'au-delà
 * du seuil. Même règle que la fonction preparer-reponse, qui la revérifie avant chaque envoi.
 */
function AutonomieReponses({ traites, demandes, onOuvrirDossier }: { traites: BrouillonReponse[]; demandes: Demande[]; onOuvrirDossier: (id: string) => void }) {
  const [actif, setActif] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState('')
  useEffect(() => {
    lireParametre<{ actif?: boolean }>('reponse_auto').then((p) => setActif(!!p?.actif)).catch(() => {})
  }, [])
  const valides = traites.filter((b) => b.statut === 'envoye' || b.statut === 'corrige').slice(0, SEUIL_NOMBRE)
  const legers = valides.filter((b) => b.statut === 'envoye' || Number(b.ecart ?? 1) <= ECART_LEGER).length
  const telsQuels = valides.filter((b) => b.statut === 'envoye').length
  const taux = valides.length ? legers / valides.length : 0
  const seuilAtteint = valides.length >= SEUIL_NOMBRE && taux >= SEUIL_TAUX
  const autos = traites.filter((b) => b.statut === 'auto').slice(0, 10)
  const sujet = (id: string) => demandes.find((d) => d.id === id)?.sujet ?? 'dossier'
  const pct = (x: number) => `${Math.round(x * 100)} %`

  async function basculer(v: boolean) {
    setEnregistrement(true)
    setErreur('')
    try {
      await ecrireParametre('reponse_auto', { actif: v })
      setActif(v)
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <div className="card">
      <h3>Réponses aux clients</h3>
      <p className="muted" style={{ margin: '2px 0 10px' }}>
        Mana prépare une réponse à chaque message. Vos corrections lui apprennent votre façon de répondre.
      </p>
      <div className="impact reseau-tuiles">
        <div className="tuile"><strong>{valides.length}<span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>/{SEUIL_NOMBRE}</span></strong><span>réponses validées récemment</span></div>
        <div className="tuile"><strong>{telsQuels}</strong><span>envoyées telles quelles</span></div>
        <div className="tuile"><strong style={{ color: seuilAtteint ? 'var(--vert)' : undefined }}>{valides.length ? pct(taux) : '—'}</strong><span>sans retouche notable (seuil {pct(SEUIL_TAUX)})</span></div>
        <div className="tuile"><strong>{traites.filter((b) => b.statut === 'auto').length}</strong><span>envoyées seules par Mana</span></div>
      </div>
      <label className="field" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, opacity: seuilAtteint || actif ? 1 : 0.6 }}>
        <input type="checkbox" checked={actif} disabled={enregistrement || (!seuilAtteint && !actif)} onChange={(e) => basculer(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--vert)' }} />
        <span style={{ marginBottom: 0 }}>
          <strong>Laisser Mana répondre seul aux messages simples</strong>
          <span className="muted" style={{ display: 'block', fontSize: 13, fontWeight: 400 }}>
            {seuilAtteint
              ? 'Seulement les réponses que Mana juge sûres (confiance haute, aucune décision à prendre). Tout le reste attend votre validation, comme aujourd’hui.'
              : `Disponible après ${SEUIL_NOMBRE} réponses validées, dont ${pct(SEUIL_TAUX)} sans retouche notable (écart de moins de ${pct(ECART_LEGER)} du texte). Il en manque ${Math.max(0, SEUIL_NOMBRE - valides.length)}${valides.length >= SEUIL_NOMBRE ? ', et le taux est encore trop bas' : ''}.`}
            {actif && !seuilAtteint ? ' Activé, mais suspendu tant que le seuil n’est pas atteint : Mana revérifie avant chaque envoi.' : ''}
          </span>
        </span>
      </label>
      {erreur && <p className="muted" style={{ color: 'var(--rouge)' }}>{erreur}</p>}
      {autos.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13.5, margin: '10px 0 4px' }}>Dernières réponses envoyées seules</div>
          {autos.map((b) => (
            <div className="afaire-ligne" key={b.id}>
              <span className="muted" style={{ flex: 'none', fontSize: 12.5 }}>{b.traite_le ? fmtDateHeure(b.traite_le) : ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{sujet(b.demande_id)} — « {(b.texte_envoye ?? b.texte).slice(0, 90)}… »</span>
              <button className="btn btn-ghost btn-sm" onClick={() => onOuvrirDossier(b.demande_id)}>Relire</button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/** Deux textes côte à côte : ce que Mana proposait, ce qui est parti. */
function Comparaison({ r }: { r: Redaction }) {
  const [ouvert, setOuvert] = useState(false)
  const identique = r.propose_corps.trim() === r.envoye_corps.trim() && r.propose_objet.trim() === r.envoye_objet.trim()
  return (
    <div style={{ borderTop: '1px solid var(--trait-doux)', paddingTop: 8, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span>
          <strong>{r.genre}</strong> · {fmtDateHeure(r.cree_le)} · {r.admin_email}
          {identique ? <span className="badge vert" style={{ marginLeft: 8 }}>envoyé tel quel</span> : <span className="badge" style={{ marginLeft: 8 }}>corrigé</span>}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOuvert(!ouvert)}>{ouvert ? 'Replier' : 'Comparer'}</button>
      </div>
      {ouvert && (
        <div className="style-comparaison">
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Proposé par Mana</div>
            <div className="muted" style={{ marginBottom: 4 }}>Objet : {r.propose_objet}</div>
            <pre>{r.propose_corps}</pre>
          </div>
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Envoyé</div>
            <div className="muted" style={{ marginBottom: 4 }}>Objet : {r.envoye_objet}</div>
            <pre>{r.envoye_corps}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Onglet Style : les règles de rédaction de l'équipe (appliquées par « Appliquer mon style »
 * dans l'éditeur de mail) et l'historique proposé → envoyé dont elles se déduisent.
 */
function StyleAdmin() {
  const [regles, setRegles] = useState('')
  const [enregistre, setEnregistre] = useState<'repos' | 'en_cours' | 'fait'>('repos')
  const [redactions, setRedactions] = useState<Redaction[]>([])
  const [deduction, setDeduction] = useState<'repos' | 'en_cours' | 'erreur'>('repos')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    lireParametre<{ regles?: string }>('style').then((p) => setRegles(p?.regles ?? '')).catch((e) => setErreur((e as Error).message))
    listerRedactions(20).then(setRedactions).catch((e) => setErreur((e as Error).message))
  }, [])

  const corriges = redactions.filter((r) => r.propose_corps.trim() !== r.envoye_corps.trim() || r.propose_objet.trim() !== r.envoye_objet.trim()).length

  return (
    <div>
      <div className="card">
        <h3>Règles de style</h3>
        <p className="muted" style={{ margin: '2px 0 8px' }}>
          Ce que suit « ✨ Appliquer mon style ». Écrivez-les, ou déduisez-les de vos corrections.
        </p>
        <textarea rows={10} value={regles} onChange={(e) => setRegles(e.target.value)} placeholder={'• Tutoyer les associations que nous connaissons déjà\n• Deux paragraphes maximum\n• Toujours proposer un créneau d’appel…'} style={{ width: '100%', fontFamily: 'inherit', lineHeight: 1.45 }} />
        <div className="row-actions" style={{ marginTop: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={enregistre === 'en_cours'}
            onClick={async () => {
              setEnregistre('en_cours')
              try {
                await ecrireParametre('style', { regles })
                setEnregistre('fait')
                window.setTimeout(() => setEnregistre('repos'), 2000)
              } catch (e) {
                setErreur((e as Error).message)
                setEnregistre('repos')
              }
            }}
          >
            {enregistre === 'fait' ? '✓ Enregistré' : 'Enregistrer les règles'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={deduction === 'en_cours' || corriges === 0}
            title={corriges === 0 ? 'Aucune correction enregistrée pour l’instant : envoyez d’abord quelques mails en les retouchant.' : undefined}
            onClick={async () => {
              setDeduction('en_cours')
              setErreur('')
              try {
                const r = await deduireRegles()
                setRegles((actuel) => (actuel.trim() ? `${actuel.trim()}\n\n— Déduit de mes corrections —\n${r}` : r))
                setDeduction('repos')
              } catch (e) {
                setErreur((e as Error).message)
                setDeduction('erreur')
              }
            }}
          >
            {deduction === 'en_cours' ? 'Analyse…' : 'Déduire les règles de mes corrections'}
          </button>
        </div>
        {erreur && <p className="muted" style={{ color: 'var(--rouge)', marginTop: 8 }}>{erreur}</p>}
      </div>
      <div className="card">
        <h3>Mes corrections ({redactions.length}{corriges ? `, dont ${corriges} retouché${corriges > 1 ? 's' : ''}` : ''})</h3>
        <p className="muted" style={{ margin: '2px 0 0' }}>Chaque mail consigné depuis un dossier : la proposition de Mana à gauche, ce que vous avez envoyé à droite.</p>
        {redactions.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Rien pour l’instant.</p>}
        {redactions.map((r) => (
          <Comparaison key={r.id} r={r} />
        ))}
      </div>
    </div>
  )
}
