import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState, Facture, Justificatif, Magasin, Saisie, Societe } from './types'
import { buildDemoState, exerciceCourant } from './lib/demo'
import { clearState, etatVide, exportJSON, importJSON, loadState, saveState, setMajLocale, getSyncLocale, setSyncLocale, sauvegarder, lireSauvegarde, effacerSauvegarde, etatEstVide, resumeEtat, getCompteLie, setCompteLie, purgerAppareil, getAttentePush, setAttentePush, uid } from './lib/storage'
import { chargerEtatDistant, dateEtatDistant, compterNonLus, connexion, connexionGoogle, deconnexion, estAdmin, inscription, pousserEtatDistant, supabase, type NonLus, monAcces, definirCompteDelegue, compteId, type Acces, type EtatDistant } from './lib/cloud'
import { aggParSociete, calculerCloture, facturesCommissionManquantes } from './lib/selectors'
import { montantsFacture, prochainNumero } from './lib/facturation'
import { completerIdentites } from './lib/identite'
import { FormulaProvider } from './components/Formula'
import { Aide } from './components/Aide'
import { IconAdmin, IconAide, IconMagasins, IconMessages, IconReglages, IconSaisie, IconSimulateur, IconTableau, LogoMana } from './components/Icons'
import { Simulateur } from './views/Simulateur'
import { MagasinsView } from './views/Magasins'
import { Bilan } from './views/Bilan'
import { SaisieView } from './views/Saisie'
import { Admin } from './views/Admin'
import { AccesPartages } from './components/AccesPartages'
import { Messages } from './views/Messages'

/**
 * Quatre onglets, un par moment : Saisie (chaque jour), Magasins (mise en
 * place, collecte comprise), Bilan (chiffres, registre, documents), Messages.
 * Le simulateur n'est plus un onglet : c'est la page d'accueil du visiteur,
 * et la première étape de l'ajout d'un magasin pour un client.
 */
type Tab = 'simulateur' | 'saisie' | 'magasins' | 'bilan' | 'messages' | 'admin'

/** L'état local est-il le jeu de démonstration (jamais synchronisé vers un compte) ? */
function estDemo(etat: AppState): boolean {
  return etat.societes.some((s) => s.id.startsWith('demo-'))
}

/** Onglets ouverts à un accès partagé : les mêmes, sans la gestion des sociétés (masquée dans Magasins). */
const TABS_INVITE: Tab[] = ['saisie', 'magasins', 'bilan', 'messages']

const TABS: { id: Tab; label: string; icone: () => JSX.Element }[] = [
  { id: 'saisie', label: 'Saisie', icone: IconSaisie },
  { id: 'magasins', label: 'Magasins', icone: IconMagasins },
  { id: 'bilan', label: 'Bilan', icone: IconTableau },
  { id: 'messages', label: 'Messages', icone: IconMessages },
]

/** Un visiteur (sans compte) explore la démo : le simulateur est sa porte d'entrée, les messages demandent un compte. */
const TABS_VISITEUR: { id: Tab; label: string; icone: () => JSX.Element }[] = [
  { id: 'simulateur', label: 'Simulateur', icone: IconSimulateur },
  ...TABS.filter((t) => t.id !== 'messages'),
]

export default function App() {
  // Premier lancement : jeu de données de démonstration prérempli
  const [state, setState] = useState<AppState>(() => loadState() ?? buildDemoState())
  // Un compte qui a déjà ses magasins arrive sur la Saisie (le geste quotidien) ;
  // le simulateur n'est la porte d'entrée que pour un visiteur.
  const [tab, setTab] = useState<Tab>(() => {
    const local = loadState()
    return local && !estDemo(local) && local.magasins.length > 0 ? 'saisie' : 'simulateur'
  })
  const [reglages, setReglages] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const exercice = exerciceCourant()

  // --- Compte & synchronisation multi-appareils ---
  const [session, setSession] = useState<Session | null>(null)
  const [syncStatut, setSyncStatut] = useState<'inactif' | 'encours' | 'ok' | 'erreur'>('inactif')
  const [syncHeure, setSyncHeure] = useState('')
  const [aideOuverte, setAideOuverte] = useState(false)
  const [admin, setAdmin] = useState(false)
  /** Accès partagé du compte connecté : undefined tant qu'on ne sait pas, null si c'est un compte propriétaire. */
  const [acces, setAcces] = useState<Acces | null | undefined>(undefined)
  const [nonLus, setNonLus] = useState<NonLus>({ total: 0, parDemande: {} })
  const sauterProchainPush = useRef(false)
  const timerPush = useRef<number | undefined>(undefined)
  /** Premier passage de l'effet d'état : charger n'est pas modifier — ni horodatage, ni envoi. */
  const premierEffet = useRef(true)
  const [sauvegarde, setSauvegarde] = useState(() => lireSauvegarde())

  /** Vrai dès que l'on sait si une session existe (avant, on n'affiche rien de personnel). */
  const [sessionResolue, setSessionResolue] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionResolue(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  /**
   * Un appareil lié à un compte n'affiche ses données que connecté. La copie
   * locale reste en mémoire pour la synchronisation, mais l'écran est verrouillé.
   */
  const verrouille = sessionResolue && !session && !!getCompteLie() && !estDemo(state)

  /** Déconnexion : les données sont sur le compte, l'appareil n'en garde rien. */
  async function seDeconnecter() {
    if (syncStatut === 'erreur' && !confirm('La dernière synchronisation a échoué : des saisies récentes pourraient ne pas être sur le compte. Se déconnecter quand même ?')) return
    await deconnexion()
    purgerAppareil()
    setSauvegarde(null)
    sauterProchainPush.current = true
    setState(buildDemoState())
    setTab('simulateur')
    setReglages(false)
  }

  useEffect(() => {
    if (session) estAdmin().then(setAdmin)
    else setAdmin(false)
  }, [session?.user.id])

  // Accès partagé ? On le sait avant toute lecture : les appels cloud visent alors le compte du propriétaire.
  useEffect(() => {
    if (!session) {
      definirCompteDelegue(null)
      setAcces(null)
      return
    }
    let annule = false
    setAcces(undefined)
    monAcces()
      .then((a) => {
        if (annule) return
        definirCompteDelegue(a?.proprietaire ?? null)
        setAcces(a)
      })
      .catch(() => {
        if (annule) return
        definirCompteDelegue(null)
        setAcces(null)
      })
    return () => {
      annule = true
    }
  }, [session?.user.id])

  // Un invité ne voit que ses onglets ; s'il est ailleurs, on le ramène à la Saisie.
  useEffect(() => {
    if (acces && !TABS_INVITE.includes(tab)) setTab('saisie')
  }, [acces, tab])

  /** Ce que l'écran montre : tout, ou le seul magasin ouvert à l'invité (et sa société). */
  const stateVisible = useMemo<AppState>(() => {
    if (!acces?.magasin_id) return state
    const magasin = state.magasins.find((m) => m.id === acces.magasin_id)
    if (!magasin) return { ...state, societes: [], magasins: [], saisies: [], factures: [], clotures: [] }
    return {
      ...state,
      societes: state.societes.filter((so) => so.id === magasin.societeId),
      magasins: [magasin],
      saisies: state.saisies.filter((sa) => sa.magasinId === magasin.id),
      factures: state.factures.filter((f) => f.societeId === magasin.societeId),
      clotures: state.clotures.filter((c) => c.societeId === magasin.societeId),
    }
  }, [state, acces])

  /**
   * Pastilles de notification : messages reçus depuis la dernière ouverture du
   * fil. Côté Mana on compte ceux des clients, côté client ceux de Mana. Relevé
   * au chargement, au changement d'onglet, au retour sur l'onglet du navigateur,
   * et toutes les 60 s — il n'y a pas de temps réel sur ces tables.
   */
  const rafraichirNonLus = useCallback(() => {
    if (!session) {
      setNonLus({ total: 0, parDemande: {} })
      return
    }
    compterNonLus(admin ? 'mana' : 'client').then(setNonLus).catch(() => {})
  }, [session?.user.id, admin])

  useEffect(() => {
    rafraichirNonLus()
    const surFocus = () => document.visibilityState === 'visible' && rafraichirNonLus()
    const timer = window.setInterval(rafraichirNonLus, 60_000)
    document.addEventListener('visibilitychange', surFocus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', surFocus)
    }
  }, [rafraichirNonLus, tab])

  // Changement d'onglet → retour en haut de page
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  // Sociétés vérifiées avant que Mana ne conserve forme juridique et adresse :
  // complétées une fois depuis le registre (le reçu fiscal en a besoin).
  useEffect(() => {
    if (estDemo(state)) return
    let annule = false
    completerIdentites(state).then((maj) => {
      if (maj && !annule) {
        // Complément automatique, pas une saisie : ni horodatage local, ni envoi immédiat
        sauterProchainPush.current = true
        setState(maj)
      }
    })
    return () => {
      annule = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.societes.map((s) => `${s.id}:${s.verification.apiStatut}:${s.verification.formeJuridique ?? ''}`).join('|')])

  /** Applique un état venu du cloud sans le re-pousser. */
  function appliquerDistant(etat: AppState, majLe: string, motifSauvegarde?: string) {
    if (motifSauvegarde) {
      sauvegarder(state, motifSauvegarde)
      setSauvegarde(lireSauvegarde())
    }
    sauterProchainPush.current = true
    setMajLocale(Date.parse(majLe))
    setSyncLocale(Date.parse(majLe))
    if (session) setCompteLie(session.user.id)
    setState(etat)
    // À la connexion, un compte équipé quitte le simulateur pour la Saisie
    if (etat.magasins.length > 0) setTab((t) => (t === 'simulateur' ? 'saisie' : t))
    setSyncStatut('ok')
    setSyncHeure(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
  }

  async function pousser(etat: AppState, userId: string, email?: string) {
    try {
      setSyncStatut('encours')
      const majLe = await pousserEtatDistant(userId, etat, email)
      setMajLocale(Date.parse(majLe))
      setSyncLocale(Date.parse(majLe))
      setCompteLie(userId)
      setAttentePush(false)
      setSyncStatut('ok')
      setSyncHeure(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setSyncStatut('erreur')
    }
  }

  /**
   * Le serveur fait foi, comme sur n'importe quel site : à l'ouverture on
   * prend sa version, chaque modification lui est envoyée aussitôt, et les
   * autres appareils la voient au retour sur l'onglet ou dans la minute.
   *
   * Seule exception : des modifications faites ici sans avoir pu partir
   * (hors ligne, page fermée trop tôt). Si le serveur n'a pas bougé depuis
   * qu'on l'a vu, elles partent maintenant ; s'il a bougé, il gagne et la
   * version locale est mise de côté en sauvegarde (Réglages), sans question.
   */
  async function synchroniser(distant: EtatDistant | null, local: AppState) {
    if (!session) return
    const localDemo = estDemo(local)
    if (!distant) {
      if (acces) {
        setSyncStatut('erreur')
        return
      }
      // Premier compte : ce que l'appareil contient devient le compte (la démo ne compte pas).
      const aPousser = localDemo ? etatVide() : local
      if (localDemo) {
        sauterProchainPush.current = true
        setState(aPousser)
      }
      await pousser(aPousser, session.user.id, session.user.email ?? undefined)
      return
    }
    const enAttente = !acces && !localDemo && !etatEstVide(local) && getAttentePush()
    if (enAttente && Date.parse(distant.majLe) <= getSyncLocale()) {
      await pousser(local, session.user.id, session.user.email ?? undefined)
      return
    }
    if (JSON.stringify(local) === JSON.stringify(distant.etat)) {
      appliquerDistant(distant.etat, distant.majLe)
      return
    }
    appliquerDistant(distant.etat, distant.majLe, enAttente ? 'modifications faites hors ligne, remplacées par la version du serveur' : undefined)
    setAttentePush(false)
  }

  /** Synchronisation initiale à la connexion. */
  useEffect(() => {
    if (!session) {
      setSyncStatut('inactif')
      return
    }
    if (acces === undefined) return // on attend de savoir quel compte lire
    let annule = false
    ;(async () => {
      try {
        setSyncStatut('encours')
        const distant = await chargerEtatDistant(compteId(session))
        if (annule) return
        await synchroniser(distant, loadState() ?? buildDemoState())
      } catch {
        if (!annule) setSyncStatut('erreur')
      }
    })()
    return () => {
      annule = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, acces === undefined])

  /**
   * Rafraîchissement depuis le serveur : au retour sur l'onglet et toutes les
   * 30 s. On ne lit d'abord que l'horodatage ; l'état complet n'est rapatrié
   * que s'il a changé ailleurs.
   */
  useEffect(() => {
    if (!session || acces === undefined) return
    let enCours = false
    const rafraichir = async () => {
      if (document.visibilityState !== 'visible' || enCours) return
      enCours = true
      try {
        const compte = compteId(session)
        const date = await dateEtatDistant(compte)
        if (!date || Date.parse(date) <= getSyncLocale()) return
        const distant = await chargerEtatDistant(compte)
        if (distant) await synchroniser(distant, loadState() ?? etatVide())
      } catch {
        /* silencieux : on retentera au prochain passage */
      } finally {
        enCours = false
      }
    }
    const timer = window.setInterval(rafraichir, 30_000)
    document.addEventListener('visibilitychange', rafraichir)
    window.addEventListener('focus', rafraichir)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', rafraichir)
      window.removeEventListener('focus', rafraichir)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, acces === undefined])

  useEffect(() => {
    if (!saveState(state)) {
      alert('Espace de stockage local saturé : allégez les justificatifs (photos plus légères) ou exportez puis purgez les anciennes semaines.')
    }
    if (premierEffet.current) {
      premierEffet.current = false
      return
    }
    if (sauterProchainPush.current) {
      sauterProchainPush.current = false
      return
    }
    setMajLocale(Date.now())
    if (estDemo(state)) return
    // Modification réelle : elle part aussitôt ; le drapeau reste levé tant qu'elle n'est pas arrivée.
    setAttentePush(true)
    if (session && acces !== undefined) {
      window.clearTimeout(timerPush.current)
      timerPush.current = window.setTimeout(() => pousser(state, compteId(session), acces ? undefined : session.user.email ?? undefined), 600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function saveSociete(societe: Societe) {
    setState((s) => {
      const precedente = s.societes.find((x) => x.id === societe.id)
      const margeChangee = precedente && precedente.margePct !== societe.margePct
      const maintenant = new Date().toISOString()
      return {
        ...s,
        societes: precedente ? s.societes.map((x) => (x.id === societe.id ? societe : x)) : [...s.societes, societe],
        // Changement de marge société → nouvelle version de la note de méthode de chaque magasin
        magasins: margeChangee
          ? s.magasins.map((m) => {
              if (m.societeId !== societe.id) return m
              const derniere = m.versionsParametres[m.versionsParametres.length - 1]
              return {
                ...m,
                versionsParametres: [
                  ...m.versionsParametres,
                  { version: (derniere?.version ?? 0) + 1, date: maintenant, margePct: societe.margePct, coutKgFL: m.coutKgFL },
                ],
              }
            })
          : s.magasins,
      }
    })
  }

  function deleteSociete(id: string) {
    setState((s) => {
      const magasinIds = new Set(s.magasins.filter((m) => m.societeId === id).map((m) => m.id))
      return {
        ...s,
        societes: s.societes.filter((x) => x.id !== id),
        magasins: s.magasins.filter((m) => m.societeId !== id),
        saisies: s.saisies.filter((x) => !magasinIds.has(x.magasinId)),
        factures: s.factures.filter((f) => f.societeId !== id),
        clotures: s.clotures.filter((c) => c.societeId !== id),
      }
    })
  }

  function saveMagasin(m: Magasin) {
    setState((s) => ({
      ...s,
      magasins: s.magasins.some((x) => x.id === m.id) ? s.magasins.map((x) => (x.id === m.id ? m : x)) : [...s.magasins, m],
    }))
  }

  function deleteMagasin(id: string) {
    setState((s) => ({
      ...s,
      magasins: s.magasins.filter((m) => m.id !== id),
      saisies: s.saisies.filter((x) => x.magasinId !== id),
    }))
  }

  function saveSaisie(sa: Saisie) {
    setState((s) => ({
      ...s,
      saisies: s.saisies.some((x) => x.id === sa.id) ? s.saisies.map((x) => (x.id === sa.id ? sa : x)) : [...s.saisies, sa],
    }))
  }

  /**
   * Relevé de démarque : remplace d'un bloc les lignes « relevé » du magasin
   * portant sur la même période (semaine ou mois), puis insère les nouvelles.
   */
  function saveReleve(magasinId: string, periode: { semaine?: string; mois?: string; du?: string; au?: string }, nouvelles: Saisie[]) {
    const memePeriode = (x: Saisie) => {
      if (periode.du && periode.au) return x.releveDu === periode.du && x.releveAu === periode.au
      if (periode.mois) return x.releveMois === periode.mois
      return x.semaine === periode.semaine && !x.releveMois && !x.releveDu
    }
    setState((s) => ({
      ...s,
      saisies: [...s.saisies.filter((x) => !(x.magasinId === magasinId && x.origine === 'releve' && memePeriode(x))), ...nouvelles],
    }))
  }

  function deleteSaisie(id: string) {
    setState((s) => ({ ...s, saisies: s.saisies.filter((x) => x.id !== id) }))
  }

  /** Émet les factures de commission des mois échus non facturés. Retourne le nombre émis. */
  function genererFactures(societeId: string): number {
    const agg = aggParSociete(state, exercice).find((a) => a.societe.id === societeId)
    if (!agg) return 0
    if (!agg.societe.contrat) {
      alert('Signez d’abord le contrat de service Mana (onglet Magasins, carte de la société) : aucune facture n’est émise sans contrat.')
      return 0
    }
    const nouvelles = facturesCommissionManquantes(agg, exercice, new Date(), state.factures.map((f) => f.numero))
    if (nouvelles.length > 0) setState((s) => ({ ...s, factures: [...s.factures, ...nouvelles] }))
    return nouvelles.length
  }

  /** Clôture d'exercice : régularisation sur la liasse réelle + mise à jour de la société. */
  function cloturer(societeId: string, caReel: number, margeReellePct: number, justificatif: Justificatif | null) {
    const agg = aggParSociete(state, exercice).find((a) => a.societe.id === societeId)
    if (!agg) return
    const r = calculerCloture(agg, caReel, margeReellePct)
    const maintenant = new Date().toISOString()

    let facture: Facture | null = null
    if (Math.abs(r.deltaHT) >= 0.01) {
      const { montantTVA, montantTTC } = montantsFacture(r.deltaHT)
      facture = {
        id: uid(),
        numero: prochainNumero(state.factures.map((f) => f.numero), exercice),
        societeId,
        exercice,
        periode: String(exercice),
        type: r.deltaHT >= 0 ? 'complement' : 'avoir',
        libelle: `Régularisation annuelle — exercice ${exercice} (liasse fiscale définitive)`,
        baseFacturable: Math.round(((r.deltaHT * 100) / agg.societe.successFeePct / 0.6) * 100) / 100,
        tauxCommissionPct: agg.societe.successFeePct * 0.6,
        montantHT: r.deltaHT,
        tauxTVAPct: 20,
        montantTVA,
        montantTTC,
        emiseLe: maintenant,
        detail: r.detail,
      }
    }

    setState((s) => ({
      ...s,
      factures: facture ? [...s.factures, facture] : s.factures,
      clotures: [
        ...s.clotures,
        {
          id: uid(),
          societeId,
          exercice,
          caReel,
          margeReellePct,
          justificatif: justificatif ?? undefined,
          effectueeLe: maintenant,
          factureId: facture?.id,
        },
      ],
      // La liasse définitive devient la référence de la société
      societes: s.societes.map((x) =>
        x.id === societeId
          ? {
              ...x,
              caHT: caReel,
              margePct: margeReellePct,
              justificatifCA: justificatif ?? x.justificatifCA,
              verification: {
                ...x.verification,
                caVerifieLe: maintenant,
                caSource: `Liasse fiscale 2052 — clôture ${exercice}`,
              },
            }
          : x,
      ),
      magasins: s.magasins.map((m) => {
        if (m.societeId !== societeId) return m
        const derniere = m.versionsParametres[m.versionsParametres.length - 1]
        if (derniere?.margePct === margeReellePct) return m
        return {
          ...m,
          versionsParametres: [
            ...m.versionsParametres,
            { version: (derniere?.version ?? 0) + 1, date: maintenant, margePct: margeReellePct, coutKgFL: m.coutKgFL },
          ],
        }
      }),
    }))
  }

  async function importer(file: File | null) {
    if (!file) return
    try {
      const imported = await importJSON(file)
      if (
        confirm(
          `Importer ${imported.societes.length} société(s), ${imported.magasins.length} magasin(s) et ${imported.saisies.length} saisie(s) ? Les données actuelles seront remplacées.`,
        )
      ) {
        setState(imported)
        setReglages(false)
      }
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <FormulaProvider>
      <header className="header">
        <div className="brand">
          <LogoMana taille={36} />
          <h1>mana</h1>
          <span>la manne cachée de vos invendus</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!session && (
            <button onClick={() => setReglages(true)} style={{ width: 'auto', padding: '0 10px', fontSize: 13.5, fontWeight: 700, color: 'var(--vert)' }}>
              Se connecter
            </button>
          )}
          <button onClick={() => setAideOuverte(true)} aria-label="Aide et contact">
            <IconAide />
          </button>
          <button onClick={() => setReglages(true)} aria-label="Réglages et données" style={{ position: 'relative' }}>
            <IconReglages />
            {session && (
              <span
                title="Synchronisation active"
                style={{
                  position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: '50%',
                  background: syncStatut === 'erreur' ? 'var(--rouge)' : 'var(--vert)', border: '2px solid var(--papier)',
                }}
              />
            )}
          </button>
        </div>
      </header>

      <main>
        {verrouille && (
          <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
            <h3 style={{ marginTop: 0 }}>Connectez-vous pour retrouver vos données</h3>
            <p className="muted" style={{ margin: '0 auto 14px', maxWidth: 460 }}>
              Cet appareil est lié à un compte Mana. Vos sociétés, magasins et saisies ne s’affichent qu’une fois connecté.
            </p>
            <button className="btn btn-primary" onClick={() => setReglages(true)}>Se connecter</button>
          </div>
        )}
        {!verrouille && estDemo(state) && !session && (
          <div className="info-banner" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>
              <strong>Vous explorez la démonstration</strong> (2 magasins fictifs). Créez votre compte pour démarrer
              avec vos vraies données — la démo disparaît automatiquement.
            </span>
            <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setReglages(true)}>
              Créer mon compte
            </button>
          </div>
        )}
        {!verrouille && tab === 'simulateur' && <Simulateur onCommencer={() => setTab('magasins')} />}
        {!verrouille && tab === 'magasins' && (
          <MagasinsView
            state={stateVisible}
            session={session}
            invite={!!acces}
            onSaveSociete={saveSociete}
            onDeleteSociete={deleteSociete}
            onSaveMagasin={saveMagasin}
            onDeleteMagasin={deleteMagasin}
            onAllerSaisie={() => setTab('saisie')}
            onConnexion={() => setReglages(true)}
            onOuvrirAide={() => setAideOuverte(true)}
            onOuvrirMessages={() => setTab('messages')}
          />
        )}
        {!verrouille && tab === 'magasins' && session && acces === null && <AccesPartages session={session} magasins={state.magasins} />}
        {!verrouille && tab === 'saisie' && (
          <SaisieView state={stateVisible} exercice={exercice} session={session} onSave={saveSaisie} onSaveReleve={saveReleve} onDelete={deleteSaisie} onAllerCollecte={() => setTab('magasins')} />
        )}
        {!verrouille && tab === 'bilan' && (
          <Bilan state={stateVisible} exercice={exercice} onGenererFactures={genererFactures} onCloturer={cloturer} onSaveSaisie={saveSaisie} onDeleteSaisie={deleteSaisie} />
        )}
        {!verrouille && tab === 'messages' && (
          <Messages
            session={session}
            nonLus={nonLus}
            onLu={rafraichirNonLus}
            onConnexion={() => setReglages(true)}
            onOuvrirAide={() => setAideOuverte(true)}
          />
        )}
        {!verrouille && tab === 'admin' && session && admin && <Admin session={session} nonLus={nonLus} onLu={rafraichirNonLus} societes={state.societes} />}
      </main>

      {!verrouille && (
      <nav className="tabbar">
        <div className="tabbar-inner">
          {(admin ? [...TABS, { id: 'admin' as Tab, label: 'Admin', icone: IconAdmin }] : acces ? TABS.filter((t) => TABS_INVITE.includes(t.id)) : session ? TABS : TABS_VISITEUR).map((t) => {
            // La pastille vit sur l'onglet où se lisent les messages : Admin pour
            // l'équipe Mana, Messages pour le magasin.
            const porteLaPastille = admin ? t.id === 'admin' : t.id === 'messages'
            return (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                <span className="tab-ico">
                  <t.icone />
                  {porteLaPastille && nonLus.total > 0 && (
                    <span className="pastille" aria-label={`${nonLus.total} message(s) non lu(s)`}>
                      {nonLus.total > 9 ? '9+' : nonLus.total}
                    </span>
                  )}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
      )}

      <Aide
        session={session}
        ouvert={aideOuverte}
        onFermer={() => setAideOuverte(false)}
        onConnexion={() => {
          setAideOuverte(false)
          setReglages(true)
        }}
        onOuvrirMessages={() => {
          setAideOuverte(false)
          setTab('messages')
        }}
      />

      {reglages && (
        <div className="sheet-backdrop" onClick={() => setReglages(false)}>
          <div className="sheet" role="dialog" aria-label="Réglages" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Compte &amp; synchronisation</h3>
            <CompteSection session={session} syncStatut={syncStatut} syncHeure={syncHeure} onDeconnexion={seDeconnecter} />
            {acces && (
              <p className="muted" style={{ marginTop: 8 }}>
                <strong>Accès partagé</strong>{acces.libelle ? ` · ${acces.libelle}` : ''} — vous travaillez sur les données de{' '}
                {acces.magasin_id ? `« ${state.magasins.find((m) => m.id === acces.magasin_id)?.nom ?? 'magasin'} »` : 'tous les magasins'} du compte qui vous a invité.
              </p>
            )}
            <hr className="sep" />
            <h3>Données</h3>
            <p className="muted">
              {acces
                ? 'Chaque saisie est enregistrée sur le compte du propriétaire et visible par lui immédiatement.'
                : session
                ? 'Vos données sont synchronisées entre tous vos appareils connectés à ce compte. L’export JSON reste votre sauvegarde de secours.'
                : 'Sans compte, les données restent sur cet appareil. Créez un compte ci-dessus pour retrouver les mêmes données sur le site et l’application.'}
            </p>
            {sauvegarde && !acces && (
              <div className="info-banner" style={{ marginTop: 10 }}>
                <strong>Sauvegarde de secours sur cet appareil</strong> ({resumeEtat(sauvegarde.etat)}) — {sauvegarde.motif}, le{' '}
                {new Date(sauvegarde.le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.
                <div className="row-actions" style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (!confirm('Remplacer les données actuelles par cette sauvegarde ? La version actuelle deviendra la sauvegarde.')) return
                      sauvegarder(state, 'version remplacée par la restauration d’une sauvegarde')
                      setState(sauvegarde.etat)
                      setSauvegarde(lireSauvegarde())
                      setReglages(false)
                    }}
                  >
                    Restaurer cette sauvegarde
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => exportJSON(sauvegarde.etat)}>Exporter (JSON)</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Supprimer la sauvegarde de secours ?')) { effacerSauvegarde(); setSauvegarde(null) } }}>Supprimer</button>
                </div>
              </div>
            )}
            {!acces && <div className="row-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => exportJSON(state)}>
                ⬇ Exporter les données (JSON)
              </button>
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                ⬆ Importer un export JSON
              </button>
              <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => importer(e.target.files?.[0] ?? null)} />
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (confirm('Recharger le jeu de données de démonstration ? Les données actuelles seront remplacées.')) {
                    setState(buildDemoState())
                    setReglages(false)
                  }
                }}
              >
                ↺ Réinitialiser la démo
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirm('Effacer toutes les données de cet appareil ?')) {
                    clearState()
                    setState(etatVide())
                    setReglages(false)
                  }
                }}
              >
                Tout effacer
              </button>
              <button className="btn btn-ghost" onClick={() => setReglages(false)}>
                Fermer
              </button>
            </div>}
            {acces && (
              <div className="row-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => setReglages(false)}>Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </FormulaProvider>
  )
}

/** Connexion / inscription par e-mail et mot de passe + statut de synchronisation. */
function CompteSection({
  session,
  syncStatut,
  syncHeure,
  onDeconnexion,
}: {
  session: Session | null
  syncStatut: 'inactif' | 'encours' | 'ok' | 'erreur'
  syncHeure: string
  onDeconnexion: () => void
}) {
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion')
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)

  if (session) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 14.5, overflowWrap: 'anywhere' }}>{session.user.email}</strong>
            <div className="muted">
              {syncStatut === 'encours' && 'Synchronisation…'}
              {syncStatut === 'ok' && `Synchronisé${syncHeure ? ` à ${syncHeure}` : ''} — mêmes données sur tous vos appareils.`}
              {syncStatut === 'erreur' && 'Synchronisation impossible — vérifiez la connexion internet, vos données restent enregistrées sur l’appareil.'}
              {syncStatut === 'inactif' && 'Connecté.'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onDeconnexion}>
            Se déconnecter
          </button>
        </div>
      </div>
    )
  }

  async function valider() {
    setMessage('')
    if (!email.trim() || motDePasse.length < 6) {
      setMessage('E-mail et mot de passe (6 caractères minimum) requis.')
      return
    }
    setEnCours(true)
    if (mode === 'connexion') {
      const erreur = await connexion(email.trim(), motDePasse)
      if (erreur) setMessage(erreur)
    } else {
      const r = await inscription(email.trim(), motDePasse)
      if (r.erreur) setMessage(r.erreur)
      else if (r.confirmationRequise)
        setMessage('Compte créé ! Un e-mail de confirmation vient de vous être envoyé : cliquez sur le lien, puis revenez ici pour vous connecter.')
    }
    setEnCours(false)
  }

  return (
    <div>
      <div className="chips" style={{ marginBottom: 10 }}>
        <button className={`chip ${mode === 'connexion' ? 'active' : ''}`} onClick={() => setMode('connexion')}>
          Se connecter
        </button>
        <button className={`chip ${mode === 'inscription' ? 'active' : ''}`} onClick={() => setMode('inscription')}>
          Créer un compte
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <input type="text" inputMode="email" autoComplete="email" placeholder="E-mail (ex. votre adresse Gmail)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'} placeholder="Mot de passe" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valider()} />
        <button className="btn btn-primary" onClick={valider} disabled={enCours} style={{ opacity: enCours ? 0.6 : 1 }}>
          {enCours ? '…' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
        </button>
        <button
          className="btn btn-ghost"
          onClick={async () => {
            setMessage('')
            const erreur = await connexionGoogle()
            if (erreur) setMessage(erreur)
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continuer avec Google
        </button>
      </div>
      {message && <p className="muted" style={{ marginTop: 8, color: message.startsWith('Compte créé') ? 'var(--vert)' : 'var(--rouge)' }}>{message}</p>}
      <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
        Un seul compte par société suffit : connectez-vous avec le même identifiant sur le site et sur l’application pour
        retrouver exactement les mêmes données partout.
      </p>
    </div>
  )
}
