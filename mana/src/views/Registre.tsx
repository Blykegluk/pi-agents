import { useState } from 'react'
import type { AppState, Justificatif } from '../types'
import { aggParSociete, baseDeLaSaisie, calculerCloture } from '../lib/selectors'
import { coutEmballes, coutFL } from '../lib/calc'
import { fmtDate, fmtDateHeure, fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { compareWeekIds, weekLabel } from '../lib/iso'
import { libelleMois } from '../lib/facturation'
import { pdfEtatAnnuel, pdfFacture, pdfNoteDeMethode, pdfRegistre } from '../lib/pdf'
import { lireFichiers } from '../lib/fichiers'
import { IconRegistre } from '../components/Icons'

/** Registre & documents (spec §4.5) + factures mensuelles et clôture d'exercice (complément §1 et §3). */
export function Registre({
  state,
  exercice,
  onGenererFactures,
  onCloturer,
}: {
  state: AppState
  exercice: number
  onGenererFactures: (societeId: string) => number
  onCloturer: (societeId: string, caReel: number, margeReellePct: number, justificatif: Justificatif | null) => void
}) {
  const aggs = aggParSociete(state, exercice)
  const [societeId, setSocieteId] = useState(aggs[0]?.societe.id ?? '')
  const agg = aggs.find((a) => a.societe.id === societeId) ?? aggs[0]
  const [messageFactures, setMessageFactures] = useState('')

  // Clôture d'exercice
  const [caReel, setCaReel] = useState('')
  const [margeReelle, setMargeReelle] = useState('')
  const [pieceCloture, setPieceCloture] = useState<Justificatif | null>(null)

  if (!agg || state.societes.length === 0) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconRegistre />
        </span>
        Le registre se remplit automatiquement à chaque saisie hebdomadaire.
      </div>
    )
  }

  const societe = agg.societe
  const lignes = [...agg.saisies].sort((a, b) => compareWeekIds(b.semaine, a.semaine))
  const magasinDe = (id: string) => state.magasins.find((m) => m.id === id)
  const cloture = state.clotures.find((c) => c.societeId === societe.id && c.exercice === exercice)
  const caReelNum = Number(caReel) || 0
  const margeReelleNum = Number(margeReelle) || 0
  const apercuCloture =
    caReelNum > 0 && margeReelleNum > 0 && margeReelleNum < 100 ? calculerCloture(agg, caReelNum, margeReelleNum) : null

  function exporterCSV() {
    if (!agg) return
    const sep = ';'
    const head = [
      'Semaine ISO', 'Jour', 'Type', 'Magasin', 'Société', 'PV emballés (EUR)', 'Marge appliquée (%)', 'Coût emballés (EUR)',
      'Poids F&L (kg)', 'Coût F&L (EUR/kg)', 'Coût F&L (EUR)', 'Base semaine (EUR)', 'Horodatage', 'Justificatifs', 'Alerte 2,5 % CA', 'Note',
    ].join(sep)
    const rows = [...agg.saisies]
      .sort((a, b) => compareWeekIds(a.semaine, b.semaine))
      .map((s) => {
        const m = magasinDe(s.magasinId)
        const num = (n: number) => n.toFixed(2).replace('.', ',')
        return [
          s.semaine, s.jour ?? '', s.type === 'correction' ? 'Correction' : 'Don', m?.nom ?? '', societe.raisonSociale,
          num(s.pvEmballes), String(s.margePctAppliquee).replace('.', ','),
          num(coutEmballes(s.pvEmballes, s.margePctAppliquee)), String(s.kgFL).replace('.', ','),
          num(s.coutKgFLApplique), num(coutFL(s.kgFL, s.coutKgFLApplique)), num(baseDeLaSaisie(s)),
          fmtDateHeure(s.horodatage), String(s.justificatifs.length), agg.saisiesEnAlerte.has(s.id) ? 'OUI' : '',
          (s.note ?? '').replaceAll(sep, ','),
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

  async function choisirPieceCloture(files: FileList | null) {
    const [pj] = await lireFichiers(files)
    if (pj) setPieceCloture(pj)
  }

  return (
    <div>
      <h2>Registre &amp; documents</h2>

      {aggs.length > 1 && (
        <div className="chips">
          {aggs.map((a) => (
            <button
              key={a.societe.id}
              className={`chip ${a.societe.id === societe.id ? 'active' : ''}`}
              onClick={() => {
                setSocieteId(a.societe.id)
                setMessageFactures('')
              }}
            >
              {a.societe.raisonSociale}
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
        {agg.saisiesEnAlerte.size > 0 && (
          <div className="info-banner alerte">
            Les lignes surlignées dépassent 2,5 % du CA déclaré en cumul — un justificatif complémentaire sera demandé.
          </div>
        )}
        {lignes.length === 0 ? (
          <p className="muted">Aucune saisie sur cet exercice.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Semaine</th>
                  <th>Type</th>
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
                  <tr key={s.id} className={agg.saisiesEnAlerte.has(s.id) ? 'ligne-alerte' : undefined}>
                    <td>
                      {weekLabel(s.semaine)}
                      {s.jour ? ` · ${s.jour.slice(8, 10)}/${s.jour.slice(5, 7)}` : ''}
                    </td>
                    <td>{s.type === 'correction' ? <span className="badge alerte">correction</span> : 'don'}</td>
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
        <h3>Factures Mana — commission au succès</h3>
        <p className="muted">
          Facture mensuelle à terme échu : {(societe.successFeePct * 0.6).toLocaleString('fr-FR')} % de la base des dons
          documentés du mois (TVA 20 %, règlement par prélèvement SEPA B2B). La facturation s’arrête automatiquement au
          plafond de la société.
        </p>
        {agg.plafondAtteint && (
          <div className="info-banner vert">Plafond fiscal atteint — vos prochains dons ne sont plus facturés.</div>
        )}
        {agg.factures.length === 0 ? (
          <p className="muted">Aucune facture émise sur cet exercice.</p>
        ) : (
          <div>
            {agg.factures.map((f) => (
              <div className="facture-ligne" key={f.id}>
                <div className="infos">
                  <strong>
                    {f.numero}
                    {f.type === 'avoir' ? ' — avoir' : f.type === 'complement' ? ' — complément' : ''}
                  </strong>
                  <small>
                    {f.periode.length === 7 ? libelleMois(f.periode) : `Régularisation ${f.periode}`} · émise le {fmtDate(f.emiseLe)} · base{' '}
                    {fmtEUR(f.baseFacturable, 2)}
                  </small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="montant">{fmtEUR(f.montantTTC, 2)}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => pdfFacture(f, societe)}>
                    PDF
                  </button>
                </div>
              </div>
            ))}
            <p className="muted" style={{ marginTop: 8 }}>
              Total facturé : <strong>{fmtEUR(agg.commissionsHT, 2)} HT</strong> — base facturée {fmtEUR(agg.baseFacturee, 2)} /
              plafond {fmtEUR(agg.resultat.plafond)}.
            </p>
          </div>
        )}
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 10 }}
          onClick={() => {
            const n = onGenererFactures(societe.id)
            setMessageFactures(
              n === 0
                ? agg.plafondAtteint
                  ? 'Aucune facture à émettre : plafond atteint, les dons documentés ne sont plus facturés.'
                  : 'Aucune facture à émettre : tous les mois échus sont déjà facturés.'
                : `${n} facture${n > 1 ? 's' : ''} émise${n > 1 ? 's' : ''}.`,
            )
          }}
        >
          Générer les factures des mois échus
        </button>
        {messageFactures && <p className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{messageFactures}</p>}
      </div>

      <div className="card">
        <h3>Note de méthode</h3>
        <p className="muted">
          Méthode de valorisation (coefficient de marge issu de la liasse, coût moyen F&amp;L et sa source, constance).
          Datée et versionnée à chaque changement de paramètre.
        </p>
        {agg.magasins.map((m) => (
          <div className="row-actions" key={m.id} style={{ marginBottom: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => pdfNoteDeMethode(societe, m, exercice)}>
              ⬇ Note de méthode — {m.nom} (v{m.versionsParametres[m.versionsParametres.length - 1]?.version ?? 1})
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>État annuel de valorisation</h3>
        <p className="muted">
          Récapitulatif prêt pour l’expert-comptable : base, plafond, réduction, reçus 2041-MEC-SD attendus, report
          2069-RCI, déclaration au-delà de 10 000 € de dons — et rappel de l’obligation contractuelle de fournir la
          liasse sous 60 jours après dépôt.
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
          ⬇ État annuel {exercice} — {societe.raisonSociale}
        </button>
      </div>

      <div className="card">
        <h3>Clôture d’exercice — régularisation</h3>
        {cloture ? (
          <div>
            <div className="info-banner vert">
              Clôture {exercice} effectuée le {fmtDate(cloture.effectueeLe)} — CA réel {fmtEUR(cloture.caReel)}, marge
              réelle {fmtPct(cloture.margeReellePct)}. {cloture.factureId ? 'La facture de régularisation figure ci-dessus.' : 'Aucune régularisation nécessaire.'}
            </div>
          </div>
        ) : (
          <div>
            <p className="muted">
              À réception de la liasse définitive : l’app recalcule le plafond et la marge réels de l’exercice, compare
              aux montants facturés et génère une facture complémentaire ou un avoir, avec le détail du calcul.
            </p>
            <label className="field">
              <span>CA HT réel de l’exercice (liasse définitive)</span>
              <div className="suffixe">
                <input type="number" inputMode="numeric" min={0} step={10000} value={caReel} onChange={(e) => setCaReel(e.target.value)} />
                <em>€ HT</em>
              </div>
            </label>
            <label className="field">
              <span>Marge brute réelle</span>
              <div className="suffixe">
                <input type="number" inputMode="decimal" min={0} max={99} step={0.1} value={margeReelle} onChange={(e) => setMargeReelle(e.target.value)} />
                <em>%</em>
              </div>
            </label>
            <label className="field">
              <span>Liasse fiscale (justificatif) *</span>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => choisirPieceCloture(e.target.files)} />
              {pieceCloture && (
                <span className="justif-list">
                  <span className="pj">
                    📎 {pieceCloture.nom}
                    <button onClick={(e) => { e.preventDefault(); setPieceCloture(null) }} aria-label="Retirer">✕</button>
                  </span>
                </span>
              )}
            </label>
            {apercuCloture && (
              <div className="detail-lignes" style={{ marginBottom: 12 }}>
                {apercuCloture.detail.map((l, i) => (
                  <div className="ligne" key={i}>
                    <span style={{ fontSize: 13 }}>{l}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              className="btn btn-primary btn-block"
              disabled={!apercuCloture || !pieceCloture}
              style={{ opacity: apercuCloture && pieceCloture ? 1 : 0.5 }}
              onClick={() => {
                if (!apercuCloture || !pieceCloture) return
                onCloturer(societe.id, caReelNum, margeReelleNum, pieceCloture)
                setCaReel('')
                setMargeReelle('')
                setPieceCloture(null)
              }}
            >
              Clôturer l’exercice {exercice}
            </button>
          </div>
        )}
      </div>

      <footer className="legal">
        Mana n’est pas un conseil fiscal ; l’état annuel est destiné à validation par votre expert-comptable.
      </footer>
    </div>
  )
}
