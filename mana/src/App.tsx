import { useEffect, useRef, useState } from 'react'
import type { AppState, Magasin, Saisie } from './types'
import { buildDemoState, exerciceCourant } from './lib/demo'
import { clearState, exportJSON, importJSON, loadState, saveState } from './lib/storage'
import { FormulaProvider } from './components/Formula'
import { Simulateur } from './views/Simulateur'
import { Magasins } from './views/Magasins'
import { SaisieView } from './views/Saisie'
import { Dashboard } from './views/Dashboard'
import { Registre } from './views/Registre'

type Tab = 'simulateur' | 'magasins' | 'saisie' | 'dashboard' | 'registre'

const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: 'simulateur', label: 'Simulateur', ico: '🧮' },
  { id: 'magasins', label: 'Magasins', ico: '🏪' },
  { id: 'saisie', label: 'Saisie', ico: '✍️' },
  { id: 'dashboard', label: 'Tableau', ico: '📊' },
  { id: 'registre', label: 'Registre', ico: '📁' },
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

  async function importer(file: File | null) {
    if (!file) return
    try {
      const imported = await importJSON(file)
      if (confirm(`Importer ${imported.magasins.length} magasin(s) et ${imported.saisies.length} saisie(s) ? Les données actuelles seront remplacées.`)) {
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
          <h1>🌾 Mana</h1>
          <span>la manne cachée de vos invendus</span>
        </div>
        <button onClick={() => setReglages(true)} aria-label="Réglages et données">
          ⚙
        </button>
      </header>

      <main>
        {tab === 'simulateur' && <Simulateur onCommencer={() => setTab('magasins')} />}
        {tab === 'magasins' && <Magasins magasins={state.magasins} onSave={saveMagasin} onDelete={deleteMagasin} />}
        {tab === 'saisie' && (
          <SaisieView magasins={state.magasins} saisies={state.saisies} onSave={saveSaisie} onDelete={deleteSaisie} />
        )}
        {tab === 'dashboard' && <Dashboard state={state} exercice={exercice} />}
        {tab === 'registre' && <Registre state={state} exercice={exercice} />}
      </main>

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="ico" aria-hidden>
                {t.ico}
              </span>
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
                    setState({ schema: 1, magasins: [], saisies: [] })
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
