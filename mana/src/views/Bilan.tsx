import type { AppState, Justificatif, Saisie } from '../types'
import { Dashboard } from './Dashboard'
import { Registre } from './Registre'

/**
 * Bilan = « où en suis-je » : les chiffres de l'exercice en haut (ancien
 * Tableau), le registre opposable et les documents fiscaux en dessous
 * (ancien Registre). Une seule question, un seul écran.
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
  return (
    <div>
      <Dashboard state={state} exercice={exercice} />
      <div style={{ height: 18 }} />
      <Registre
        state={state}
        exercice={exercice}
        onGenererFactures={onGenererFactures}
        onCloturer={onCloturer}
        onSaveSaisie={onSaveSaisie}
        onDeleteSaisie={onDeleteSaisie}
      />
    </div>
  )
}
