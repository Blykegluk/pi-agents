import { useState } from 'react'
import type { AppState } from '../types'
import { aggParSociete, baseDeLaSaisie } from '../lib/selectors'
import { coutEmballes, coutFL } from '../lib/calc'
import { fmtDateHeure, fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { compareWeekIds, weekLabel } from '../lib/iso'
import { pdfEtatAnnuel, pdfNoteDeMethode, pdfRegistre } from '../lib/pdf'

/** Registre & documents (spec §4.5) — la valeur fiscale du produit. */
export function Registre({ state, exercice }: { state: AppState; exercice: number }) {
  const aggs = aggParSociete(state, exercice)
  const [societe, setSociete] = useState(aggs[0]?.societe ?? '')
  const agg = aggs.find((a) => a.societe === societe) ?? aggs[0]

  if (!agg || state.magasins.length === 0) {
    return (
      <div className="card empty">
        <span className="ico">📁</span>
        Le registre se remplit automatiquement à chaque saisie hebdomadaire.
      </div>
    )
  }

  const lignes = [...agg.saisies].sort((a, b) => compareWeekIds(b.semaine, a.semaine))
  const magasinDe = (id: string) => state.magasins.find((m) => m.id === id)

  function exporterCSV() {
    const sep = ';'
    const head = [
      'Semaine ISO', 'Magasin', 'Société', 'PV emballés (EUR)', 'Marge appliquée (%)', 'Coût emballés (EUR)',
      'Poids F&L (kg)', 'Coût F&L (EUR/kg)', 'Coût F&L (EUR)', 'Base semaine (EUR)', 'Horodatage', 'Justificatifs', 'Note',
    ].join(sep)
    const rows = [...agg.saisies]
      .sort((a, b) => compareWeekIds(a.semaine, b.semaine))
      .map((s) => {
        const m = magasinDe(s.magasinId)
        const num = (n: number) => n.toFixed(2).replace('.', ',')
        return [
          s.semaine, m?.nom ?? '', m?.societe ?? '', num(s.pvEmballes), String(s.margePctAppliquee).replace('.', ','),
          num(coutEmballes(s.pvEmballes, s.margePctAppliquee)), String(s.kgFL).replace('.', ','),
          num(s.coutKgFLApplique), num(coutFL(s.kgFL, s.coutKgFLApplique)), num(baseDeLaSaisie(s)),
          fmtDateHeure(s.horodatage), String(s.justificatifs.length), (s.note ?? '').replaceAll(sep, ','),
        ].join(sep)
      })
    const blob = new Blob(['﻿' + [head, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mana-registre-${exercice}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h2>Registre &amp; documents</h2>

      {aggs.length > 1 && (
        <div className="chips">
          {aggs.map((a) => (
            <button key={a.societe} className={`chip ${a.societe === agg.societe ? 'active' : ''}`} onClick={() => setSociete(a.societe)}>
              {a.societe}
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Registre des dons — exercice {exercice}</h3>
        <p className="muted">
          Tableau chronologique horodaté : chaque ligne fige les montants saisis et les coefficients en vigueur.
          Cumul : <strong>{fmtEUR(agg.baseBrute, 2)}</strong> de base fiscale.
        </p>
        {lignes.length === 0 ? (
          <p className="muted">Aucune saisie sur cet exercice.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Semaine</th>
                  <th>Magasin</th>
                  <th className="num">PV emballés</th>
                  <th className="num">Marge</th>
                  <th className="num">F&amp;L</th>
                  <th className="num">Coût/kg</th>
                  <th className="num">Base semaine</th>
                  <th>Horodatage</th>
                  <th className="num">Justif.</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((s) => (
                  <tr key={s.id}>
                    <td>{weekLabel(s.semaine)}</td>
                    <td>{magasinDe(s.magasinId)?.nom}</td>
                    <td className="num">{fmtEUR(s.pvEmballes, 2)}</td>
                    <td className="num">{fmtPct(s.margePctAppliquee)}</td>
                    <td className="num">{fmtNum(s.kgFL, 1)} kg</td>
                    <td className="num">{fmtEUR(s.coutKgFLApplique, 2)}</td>
                    <td className="num">
                      <strong>{fmtEUR(baseDeLaSaisie(s), 2)}</strong>
                    </td>
                    <td>{fmtDateHeure(s.horodatage)}</td>
                    <td className="num">{s.justificatifs.length > 0 ? `📎 ${s.justificatifs.length}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={exporterCSV} disabled={lignes.length === 0}>
            ⬇ Export CSV
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => pdfRegistre(agg, exercice)} disabled={lignes.length === 0}>
            ⬇ Registre PDF
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Note de méthode</h3>
        <p className="muted">
          Une page décrivant la méthode de valorisation (coefficient de marge issu de la liasse, coût moyen F&amp;L et sa
          source, constance de la méthode). Datée et versionnée à chaque changement de paramètre.
        </p>
        {agg.magasins.map((m) => (
          <div className="row-actions" key={m.id} style={{ marginBottom: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => pdfNoteDeMethode(m, exercice)}>
              ⬇ Note de méthode — {m.nom} (v{m.versionsParametres[m.versionsParametres.length - 1]?.version ?? 1})
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>État annuel de valorisation</h3>
        <p className="muted">
          Récapitulatif par société prêt à transmettre à l’expert-comptable : base, plafond, réduction, reçus fiscaux
          attendus des associations, et rappel des obligations (reçu 2041-MEC-SD délivré par l’association, report sur
          la 2069-RCI, déclaration spécifique au-delà de 10 000 € de dons).
        </p>
        <div className="detail-lignes" style={{ marginBottom: 12 }}>
          <div className="ligne">
            <span>Base retenue (plafonnée)</span>
            <strong>{fmtEUR(agg.resultat.basePlafonnee, 2)}</strong>
          </div>
          <div className="ligne">
            <span>Réduction d’IS (60 %)</span>
            <strong>{fmtEUR(agg.resultat.reductionIS, 2)}</strong>
          </div>
          {agg.resultat.excedent > 0 && (
            <div className="ligne">
              <span>Excédent reportable 5 exercices</span>
              <strong>{fmtEUR(agg.resultat.excedent, 2)}</strong>
            </div>
          )}
        </div>
        <button className="btn btn-primary btn-block" onClick={() => pdfEtatAnnuel(agg, exercice)}>
          ⬇ État annuel {exercice} — {agg.societe}
        </button>
      </div>

      <footer className="legal">
        Mana n’est pas un conseil fiscal ; l’état annuel est destiné à validation par votre expert-comptable.
      </footer>
    </div>
  )
}
