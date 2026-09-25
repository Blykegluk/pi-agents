import { useState } from 'react'
import type { AppState, Justificatif, Saisie } from '../types'
import { aggParSociete } from '../lib/selectors'
import { denomination } from '../lib/identite'
import { fmtEUR } from '../lib/format'
import { IconTableau } from '../components/Icons'
import { Consolide, Dashboard } from './Dashboard'
import { Registre, exporterRegistreCSV } from './Registre'
import { pdfEtatAnnuel, pdfRegistre } from '../lib/pdf'
import { useGrandEcran } from '../lib/ecran'
import { Reseau } from '../components/Reseau'

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
  // Grand écran : tableau de bord | factures & documents, puis registre pleine largeur,
  // puis bordereaux archivés | clôture. Mobile : tout à la suite, inchangé.
  const grand = useGrandEcran()

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

  const selecteur = (
    <select value={agg.societe.id} onChange={(e) => setSocieteSel(e.target.value)} aria-label="Choisir une société">
      {aggs.map((a) => (
        <option key={a.societe.id} value={a.societe.id}>
          {denomination(a.societe)} · réduction {fmtEUR(a.reductionISTotale)} · {a.magasins.length} magasin{a.magasins.length > 1 ? 's' : ''}
        </option>
      ))}
    </select>
  )

  if (grand) {
    const partie = (p: 'documents' | 'registre' | 'archives' | 'cloture') => (
      <Registre
        state={state}
        exercice={exercice}
        societeId={agg.societe.id}
        partie={p}
        actionsDansBarre
        onGenererFactures={onGenererFactures}
        onCloturer={onCloturer}
        onSaveSaisie={onSaveSaisie}
        onDeleteSaisie={onDeleteSaisie}
      />
    )
    const sansLigne = agg.saisies.length === 0
    const etatBloque = agg.semainesSansReleve.length > 0 || !agg.societe.contrat
    return (
      <div className="bilan">
        <h2>Bilan — {exercice}</h2>

        <Reseau state={state} />

        {aggs.length > 1 && <Consolide aggs={aggs} exercice={exercice} />}

        <div className="barre-societes">
          {aggs.length > 1 ? selecteur : <strong style={{ fontSize: 14, color: 'var(--vert-fonce)' }}>{denomination(agg.societe)}</strong>}
          <div className="barre-societes-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => exporterRegistreCSV(agg, state, exercice)} disabled={sansLigne}>
              ⬇ Export CSV
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => pdfRegistre(agg, exercice)} disabled={sansLigne}>
              ⬇ Registre PDF
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={etatBloque}
              style={{ opacity: etatBloque ? 0.5 : 1 }}
              title={etatBloque ? 'Relevé de démarque manquant ou contrat non signé — voir la carte « État annuel »' : undefined}
              onClick={() => pdfEtatAnnuel(agg, exercice)}
            >
              ⬇ État annuel {exercice}
            </button>
          </div>
        </div>

        <div className="bilan-grille">
          <div>
            <Dashboard state={state} exercice={exercice} societeId={agg.societe.id} />
          </div>
          <div>{partie('documents')}</div>
        </div>

        {partie('registre')}

        <div className="bilan-grille">
          <div>{partie('archives')}</div>
          <div>{partie('cloture')}</div>
        </div>

        <footer className="legal">
          Mana n’est pas un conseil fiscal ; l’état annuel est destiné à validation par votre expert-comptable.
        </footer>
      </div>
    )
  }

  return (
    <div className="bilan">
      <h2>Bilan — {exercice}</h2>

      <Reseau state={state} />

      {aggs.length > 1 && <Consolide aggs={aggs} exercice={exercice} />}

      {aggs.length > 1 && <div className="barre-societes">{selecteur}</div>}

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
