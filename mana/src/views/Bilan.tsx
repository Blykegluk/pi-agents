import { useState } from 'react'
import type { AppState, Justificatif, Saisie } from '../types'
import { aggParSociete } from '../lib/selectors'
import { denomination } from '../lib/identite'
import { fmtEUR } from '../lib/format'
import { IconTableau } from '../components/Icons'
import { Consolide, Dashboard } from './Dashboard'
import { Registre } from './Registre'

/**
 * Bilan = « où en suis-je ». En tête, le consolidé du groupe (quand il y a
 * plusieurs sociétés) ; puis un sélecteur de société figé, et tout ce qui en
 * découle : tableau de bord, registre, factures, documents de la société choisie.
 */
export function Bilan({
  state,
  exercice,
  onGenererFactures,
  onCloturer,
  onSaveSaisie,
  onDeleteSaisie,
}: {
  state: AppState
  exercice: number
  onGenererFactures: (societeId: string) => number
  onCloturer: (societeId: string, caReel: number, margeReellePct: number, justificatif: Justificatif | null) => void
  onSaveSaisie: (s: Saisie) => void
  onDeleteSaisie: (id: string) => void
}) {
  const aggs = aggParSociete(state, exercice)
  const [societeSel, setSocieteSel] = useState('')
  const agg = aggs.find((a) => a.societe.id === societeSel) ?? aggs[0]

  if (!agg) {
    return (
      <div>
        <h2>Bilan — {exercice}</h2>
        <div className="card empty">
          <span className="ico">
            <IconTableau />
          </span>
          Le bilan s’affichera dès qu’une société sera créée et qu’une semaine sera saisie.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>Bilan — {exercice}</h2>

      {aggs.length > 1 && <Consolide aggs={aggs} exercice={exercice} />}

      {aggs.length > 1 && (
        <div className="barre-societes">
          <select value={agg.societe.id} onChange={(e) => setSocieteSel(e.target.value)} aria-label="Choisir une société">
            {aggs.map((a) => (
              <option key={a.societe.id} value={a.societe.id}>
                {denomination(a.societe)} · réduction {fmtEUR(a.reductionISTotale)} · {a.magasins.length} magasin{a.magasins.length > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <Dashboard state={state} exercice={exercice} societeId={agg.societe.id} />
      <div style={{ height: 18 }} />
      <Registre
        state={state}
        exercice={exercice}
        societeId={agg.societe.id}
        onGenererFactures={onGenererFactures}
        onCloturer={onCloturer}
        onSaveSaisie={onSaveSaisie}
        onDeleteSaisie={onDeleteSaisie}
      />
    </div>
  )
}
