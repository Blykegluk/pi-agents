import { useEffect, useRef, useState } from 'react'
import type { AppState, Facture, Justificatif, Magasin, Saisie, Societe } from './types'
import { buildDemoState, exerciceCourant } from './lib/demo'
import { clearState, etatVide, exportJSON, importJSON, loadState, saveState, uid } from './lib/storage'
import { aggParSociete, calculerCloture, facturesCommissionManquantes } from './lib/selectors'
import { montantsFacture, prochainNumero } from './lib/facturation'
import { FormulaProvider } from './components/Formula'
import { IconCollecte, IconMagasins, IconRegistre, IconReglages, IconSaisie, IconSimulateur, IconTableau, LogoMana } from './components/Icons'
import { Simulateur } from './views/Simulateur'
import { MagasinsView } from './views/Magasins'
import { Collecte } from './views/Collecte'
import { SaisieView } from './views/Saisie'
import { Dashboard } from './views/Dashboard'
import { Registre } from './views/Registre'

type Tab = 'simulateur' | 'magasins' | 'collecte' | 'saisie' | 'dashboard' | 'registre'

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

  useEffect(() => {
    if (!saveState(state)) {
      alert('Espace de stockage local saturé : allégez les justificatifs (photos plus légères) ou exportez puis purgez les anciennes semaines.')
    }
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
        <button onClick={() => setReglages(true)} aria-label="Réglages et données">
          <IconReglages />
        </button>
      </header>

      <main>
        {tab === 'simulateur' && <Simulateur onCommencer={() => setTab('magasins')} />}
        {tab === 'magasins' && (
          <MagasinsView
            societes={state.societes}
            magasins={state.magasins}
            onSaveSociete={saveSociete}
            onDeleteSociete={deleteSociete}
            onSaveMagasin={saveMagasin}
            onDeleteMagasin={deleteMagasin}
          />
        )}
        {tab === 'collecte' && <Collecte state={state} onSaveMagasin={saveMagasin} onAllerSaisie={() => setTab('saisie')} />}
        {tab === 'saisie' && (
          <SaisieView state={state} exercice={exercice} onSave={saveSaisie} onDelete={deleteSaisie} onAllerCollecte={() => setTab('collecte')} />
        )}
        {tab === 'dashboard' && <Dashboard state={state} exercice={exercice} />}
        {tab === 'registre' && (
          <Registre state={state} exercice={exercice} onGenererFactures={genererFactures} onCloturer={cloturer} />
        )}
      </main>

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <t.icone />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {reglages && (
        <div className="sheet-backdrop" onClick={() => setReglages(false)}>
          <div className="sheet" role="dialog" aria-label="Réglages" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>Données &amp; réglages</h3>
            <p className="muted">
              Toutes les données restent sur cet appareil (localStorage). Exportez régulièrement un JSON de sauvegarde.
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
