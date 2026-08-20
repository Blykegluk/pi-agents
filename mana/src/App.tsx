import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState, Facture, Justificatif, Magasin, Saisie, Societe } from './types'
import { buildDemoState, exerciceCourant } from './lib/demo'
import { clearState, etatVide, exportJSON, importJSON, loadState, saveState, getMajLocale, setMajLocale, uid } from './lib/storage'
import { chargerEtatDistant, connexion, connexionGoogle, deconnexion, estAdmin, inscription, pousserEtatDistant, supabase } from './lib/cloud'
import { aggParSociete, calculerCloture, facturesCommissionManquantes } from './lib/selectors'
import { montantsFacture, prochainNumero } from './lib/facturation'
import { FormulaProvider } from './components/Formula'
import { Aide } from './components/Aide'
import { IconAdmin, IconAide, IconCollecte, IconMagasins, IconRegistre, IconReglages, IconSaisie, IconSimulateur, IconTableau, LogoMana } from './components/Icons'
import { Simulateur } from './views/Simulateur'
import { MagasinsView } from './views/Magasins'
import { Collecte } from './views/Collecte'
import { SaisieView } from './views/Saisie'
import { Dashboard } from './views/Dashboard'
import { Registre } from './views/Registre'
import { Admin } from './views/Admin'

type Tab = 'simulateur' | 'magasins' | 'collecte' | 'saisie' | 'dashboard' | 'registre' | 'admin'

/** L'état local est-il le jeu de démonstration (jamais synchronisé vers un compte) ? */
function estDemo(etat: AppState): boolean {
  return etat.societes.some((s) => s.id.startsWith('demo-'))
}

const TABS: { id: Tab; label: string; icone: () => JSX.Element }[] = [
  { id: 'simulateur', label: 'Simulateur', icone: IconSimulateur },
  { id: 'magasins', label: 'Magasins', icone: IconMagasins },
  { id: 'collecte', label: 'Collecte', icone: IconCollecte },
  { id: 'saisie', label: 'Saisie', icone: IconSaisie },
  { id: 'dashboard', label: 'Tableau', icone: IconTableau },
  { id: 'registre', label: 'Registre', icone: IconRegistre },
]

export default function App() {
  // Premier lancement : jeu de données de démonstration prérempli
  const [state, setState] = useState<AppState>(() => loadState() ?? buildDemoState())
  const [tab, setTab] = useState<Tab>('simulateur')
  const [reglages, setReglages] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const exercice = exerciceCourant()

  // --- Compte & synchronisation multi-appareils ---
  const [session, setSession] = useState<Session | null>(null)
  const [syncStatut, setSyncStatut] = useState<'inactif' | 'encours' | 'ok' | 'erreur'>('inactif')
  const [syncHeure, setSyncHeure] = useState('')
  const [aideOuverte, setAideOuverte] = useState(false)
  const [admin, setAdmin] = useState(false)
  const sauterProchainPush = useRef(false)
  const timerPush = useRef<number | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) estAdmin().then(setAdmin)
    else setAdmin(false)
  }, [session?.user.id])

  // Changement d'onglet → retour en haut de page
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  /** Applique un état venu du cloud sans le re-pousser. */
  function appliquerDistant(etat: AppState, majLe: string) {
    sauterProchainPush.current = true
    setMajLocale(Date.parse(majLe))
    setState(etat)
    setSyncStatut('ok')
    setSyncHeure(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
  }

  async function pousser(etat: AppState, userId: string, email?: string) {
    try {
      setSyncStatut('encours')
      const majLe = await pousserEtatDistant(userId, etat, email)
      setMajLocale(Date.parse(majLe))
      setSyncStatut('ok')
      setSyncHeure(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setSyncStatut('erreur')
    }
  }

  /** Synchronisation initiale à la connexion : le plus récent gagne. */
  useEffect(() => {
    if (!session) {
      setSyncStatut('inactif')
      return
    }
    let annule = false
    ;(async () => {
      try {
        setSyncStatut('encours')
        const distant = await chargerEtatDistant()
        if (annule) return
        const local = loadState() ?? buildDemoState()
        // Le jeu de démonstration ne rejoint jamais un compte : à la connexion,
        // on prend le cloud s'il existe, sinon on démarre sur un état vierge.
        const localDemo = estDemo(local)
        if (distant && (localDemo || Date.parse(distant.majLe) >= getMajLocale())) {
          appliquerDistant(distant.etat, distant.majLe)
        } else {
          const aPousser = localDemo ? etatVide() : local
          if (localDemo) {
            sauterProchainPush.current = true
            setState(aPousser)
          }
          await pousser(aPousser, session.user.id, session.user.email ?? undefined)
        }
      } catch {
        if (!annule) setSyncStatut('erreur')
      }
    })()
    return () => {
      annule = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  /** Au retour sur l'onglet (ex. saisie faite sur un autre appareil) : rafraîchit si le cloud est plus récent. */
  useEffect(() => {
    if (!session) return
    const surFocus = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const distant = await chargerEtatDistant()
        if (distant && Date.parse(distant.majLe) > getMajLocale() + 2000) {
          appliquerDistant(distant.etat, distant.majLe)
        }
      } catch {
        /* silencieux : on retentera au prochain focus */
      }
    }
    document.addEventListener('visibilitychange', surFocus)
    return () => document.removeEventListener('visibilitychange', surFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  useEffect(() => {
    if (!saveState(state)) {
      alert('Espace de stockage local saturé : allégez les justificatifs (photos plus légères) ou exportez puis purgez les anciennes semaines.')
    }
    if (sauterProchainPush.current) {
      sauterProchainPush.current = false
      return
    }
    setMajLocale(Date.now())
    if (session && !estDemo(state)) {
      window.clearTimeout(timerPush.current)
      timerPush.current = window.setTimeout(() => pousser(state, session.user.id, session.user.email ?? undefined), 1500)
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

  function deleteSaisie(id: string) {
    setState((s) => ({ ...s, saisies: s.saisies.filter((x) => x.id !== id) }))
  }

  /** Émet les factures de commission des mois échus non facturés. Retourne le nombre émis. */
  function genererFactures(societeId: string): number {
    const agg = aggParSociete(state, exercice).find((a) => a.societe.id === societeId)
    if (!agg) return 0
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
          <LogoMana taille={26} />
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
        {estDemo(state) && !session && (
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
        {tab === 'simulateur' && <Simulateur onCommencer={() => setTab('magasins')} />}
        {tab === 'magasins' && (
          <MagasinsView
            societes={state.societes}
            magasins={state.magasins}
            onSaveSociete={saveSociete}
            onDeleteSociete={deleteSociete}
            onSaveMagasin={saveMagasin}
            onDeleteMagasin={deleteMagasin}
            onPremierMagasin={() => setTab('collecte')}
          />
        )}
        {tab === 'collecte' && (
          <Collecte
            state={state}
            session={session}
            onSaveMagasin={saveMagasin}
            onAllerSaisie={() => setTab('saisie')}
            onConnexion={() => setReglages(true)}
            onOuvrirAide={() => setAideOuverte(true)}
          />
        )}
        {tab === 'saisie' && (
          <SaisieView state={state} exercice={exercice} onSave={saveSaisie} onDelete={deleteSaisie} onAllerCollecte={() => setTab('collecte')} />
        )}
        {tab === 'dashboard' && <Dashboard state={state} exercice={exercice} />}
        {tab === 'registre' && (
          <Registre state={state} exercice={exercice} onGenererFactures={genererFactures} onCloturer={cloturer} />
        )}
        {tab === 'admin' && session && admin && <Admin session={session} />}
      </main>

      <nav className="tabbar">
        <div className="tabbar-inner">
          {(admin ? [...TABS, { id: 'admin' as Tab, label: 'Admin', icone: IconAdmin }] : TABS).map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <t.icone />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <Aide
        session={session}
        ouvert={aideOuverte}
        onFermer={() => setAideOuverte(false)}
        onConnexion={() => {
          setAideOuverte(false)
          setReglages(true)
        }}
      />

      {reglages && (
        <div className="sheet-backdrop" onClick={() => setReglages(false)}>
          <div className="sheet" role="dialog" aria-label="Réglages" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Compte &amp; synchronisation</h3>
            <CompteSection session={session} syncStatut={syncStatut} syncHeure={syncHeure} />
            <hr className="sep" />
            <h3>Données</h3>
            <p className="muted">
              {session
                ? 'Vos données sont synchronisées entre tous vos appareils connectés à ce compte. L’export JSON reste votre sauvegarde de secours.'
                : 'Sans compte, les données restent sur cet appareil. Créez un compte ci-dessus pour retrouver les mêmes données sur le site et l’application.'}
            </p>
            <div className="row-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginTop: 12 }}>
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
            </div>
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
}: {
  session: Session | null
  syncStatut: 'inactif' | 'encours' | 'ok' | 'erreur'
  syncHeure: string
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
          <button className="btn btn-ghost btn-sm" onClick={() => deconnexion()}>
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
