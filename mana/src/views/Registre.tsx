import { Fragment, useState } from 'react'
import type { AppState, Justificatif, Saisie } from '../types'
import { aggParSociete, baseDeLaSaisie, calculerCloture } from '../lib/selectors'
import { coutEmballes, coutFL } from '../lib/calc'
import { fmtDate, fmtDateHeure, fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { compareWeekIds, weekLabel } from '../lib/iso'
import { semaineDuJourISO } from '../lib/releves'
import { libelleMois } from '../lib/facturation'
import { pdfEtatAnnuel, pdfFacture, pdfNoteDeMethode, pdfRecuFiscal, pdfRegistre } from '../lib/pdf'
import { lireFichiers } from '../lib/fichiers'
import { IconRegistre } from '../components/Icons'
import { Pieces } from '../components/Pieces'
import { supprimerFichierBordereau } from '../lib/cloud'
import { denomination } from '../lib/identite'

/** Registre & documents (spec §4.5) + factures mensuelles et clôture d'exercice (complément §1 et §3). */
export function Registre({
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
  const [societeId, setSocieteId] = useState(aggs[0]?.societe.id ?? '')
  const agg = aggs.find((a) => a.societe.id === societeId) ?? aggs[0]
  const [messageFactures, setMessageFactures] = useState('')
  const [ligneOuverte, setLigneOuverte] = useState<string | null>(null)

  /** Supprime une ligne du registre et les fichiers archivés qui vont avec. */
  async function supprimerLigne(s: Saisie) {
    const quoi = s.type === 'correction' ? 'cette correction' : s.jour ? `le bordereau du ${fmtDate(s.jour)}` : `la ligne de la ${weekLabel(s.semaine)}`
    if (!confirm(`Supprimer ${quoi}${s.justificatifs.length ? ` et ses ${s.justificatifs.length} pièce(s) jointe(s)` : ''} ? Le calcul de la semaine est refait.`)) return
    for (const j of s.justificatifs) if (j.chemin) await supprimerFichierBordereau(j.chemin).catch(() => {})
    onDeleteSaisie(s.id)
  }

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
      'Semaine ISO', 'Jour', 'Type', 'Origine', 'Colis', 'Association', 'Magasin', 'Société', 'PV emballés (EUR)', 'Marge appliquée (%)', 'Coût emballés (EUR)',
      'Poids F&L (kg)', 'Coût F&L (EUR/kg)', 'Coût F&L (EUR)', 'Base semaine (EUR)', 'Horodatage', 'Justificatifs', 'Alerte 2,5 % CA', 'Note',
    ].join(sep)
    const rows = [...agg.saisies]
      .sort((a, b) => compareWeekIds(a.semaine, b.semaine))
      .map((s) => {
        const m = magasinDe(s.magasinId)
        const num = (n: number) => n.toFixed(2).replace('.', ',')
        return [
          s.semaine, s.jour ?? '', s.type === 'correction' ? 'Correction' : 'Don',
          s.origine === 'bordereau' ? 'Bordereau' : s.origine === 'releve' ? 'Relevé' : 'Saisie', String(s.colis ?? ''), s.collecteur ?? '',
          m?.nom ?? '', denomination(societe),
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
              {denomination(a.societe)}
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((s) => {
                  const nature = s.type === 'correction' ? 'correction' : s.origine === 'bordereau' ? 'bordereau' : s.origine === 'releve' ? 'relevé' : 'don'
                  const depliee = ligneOuverte === s.id
                  return (
                    <Fragment key={s.id}>
                      <tr className={agg.saisiesEnAlerte.has(s.id) ? 'ligne-alerte' : undefined}>
                        <td>
                          {weekLabel(s.semaine)}
                          {s.jour ? ` · ${s.jour.slice(8, 10)}/${s.jour.slice(5, 7)}` : ''}
                        </td>
                        <td>{s.type === 'correction' ? <span className="badge alerte">correction</span> : nature}</td>
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
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setLigneOuverte(depliee ? null : s.id)}>
                            {depliee ? 'Fermer' : 'Voir'}
                          </button>{' '}
                          <button className="btn btn-danger btn-sm" onClick={() => void supprimerLigne(s)}>
                            Supprimer
                          </button>
                        </td>
                      </tr>
                      {depliee && (
                        <tr className="ligne-detail">
                          <td colSpan={11}>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                              <div style={{ minWidth: 220, flex: 1 }}>
                                <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                                  <strong>{nature.charAt(0).toUpperCase() + nature.slice(1)}</strong>
                                  {s.jour ? ` du ${fmtDate(s.jour)}` : ` — ${weekLabel(s.semaine)}`}
                                  {s.collecteur ? ` · ${s.collecteur}` : ''}
                                  {s.colis ? ` · ${s.colis} colis` : ''}
                                  {s.signe !== undefined ? ` · ${s.signe ? 'signé' : 'signature non confirmée'}` : ''}
                                  {s.flInclus ? ' · F&L inclus dans le montant' : ''}
                                  {s.releveMois ? ` · issu du relevé de ${libelleMois(s.releveMois)}` : ''}
                                </div>
                                {s.note && <div className="muted" style={{ fontSize: 13 }}>{s.note}</div>}
                                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Enregistré le {fmtDateHeure(s.horodatage)}</div>
                                {s.origine === 'bordereau' && s.jour && (
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13 }}>
                                    <span>Changer la date :</span>
                                    <input
                                      type="date"
                                      value={s.jour}
                                      max={new Date().toISOString().slice(0, 10)}
                                      style={{ width: 'auto', padding: 6 }}
                                      onChange={(e) => {
                                        const nouveau = e.target.value
                                        if (!nouveau || nouveau === s.jour) return
                                        if (state.saisies.some((x) => x.id !== s.id && x.magasinId === s.magasinId && x.origine === 'bordereau' && x.jour === nouveau)) {
                                          alert(`Il y a déjà un bordereau le ${fmtDate(nouveau)} pour ce magasin.`)
                                          return
                                        }
                                        onSaveSaisie({ ...s, jour: nouveau, semaine: semaineDuJourISO(nouveau) })
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                              <div style={{ flex: 2, minWidth: 220 }}>
                                {s.justificatifs.length > 0 ? (
                                  <Pieces justificatifs={s.justificatifs} onChange={(liste) => onSaveSaisie({ ...s, justificatifs: liste })} />
                                ) : (
                                  <span className="muted" style={{ fontSize: 13 }}>Aucune pièce jointe.</span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
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
              Total facturé : <strong>{fmtEUR(agg.commissionsHT, 2)} HT</strong> sur une commission due de {fmtEUR(agg.resultat.factureMana, 2)} HT — base facturée {fmtEUR(agg.baseFacturee, 2)} /
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
        <h3>Bordereaux archivés</h3>
        <p className="muted">
          Les pièces justificatives, mois par mois — tous les magasins de la société. Ouvrez une vignette pour vérifier
          le bordereau en grand ; déplacez-le s’il a été enregistré sur le mauvais magasin ; supprimez-le s’il est en
          double (le fichier archivé est effacé avec).
        </p>
        {(() => {
          const bordereaux = state.saisies
            .filter((x) => agg.magasins.some((m) => m.id === x.magasinId) && x.type === 'don' && x.jour && parseInt(x.jour.slice(0, 4), 10) === exercice)
            .sort((a, b) => (b.jour ?? '').localeCompare(a.jour ?? ''))
          if (bordereaux.length === 0) return <p className="muted">Aucun bordereau enregistré sur l’exercice.</p>
          const parMois = new Map<string, typeof bordereaux>()
          for (const b of bordereaux) {
            const k = b.jour!.slice(0, 7)
            parMois.set(k, [...(parMois.get(k) ?? []), b])
          }
          const autresMagasins = (b: Saisie) => state.magasins.filter((m) => m.id !== b.magasinId)
          const deplacer = (b: Saisie, versId: string) => {
            const cible = state.magasins.find((m) => m.id === versId)
            const soc = state.societes.find((x) => x.id === cible?.societeId)
            if (!cible || !soc) return
            if (!confirm(`Déplacer le bordereau du ${b.jour} vers « ${cible.nom} » ?`)) return
            onSaveSaisie({
              ...b,
              magasinId: cible.id,
              // L'association et les coefficients suivent le magasin d'arrivée
              collecteur: cible.collecteurs.some((c) => c.nom === b.collecteur) ? b.collecteur : cible.collecteurs.length === 1 ? cible.collecteurs[0].nom : undefined,
              margePctAppliquee: soc.margePct,
              coutKgFLApplique: cible.coutKgFL,
            })
          }
          const supprimer = async (b: Saisie) => {
            if (!confirm(`Supprimer le bordereau du ${b.jour} (${magasinDe(b.magasinId)?.nom ?? ''}) et ses ${b.justificatifs.length} pièce(s) ?`)) return
            for (const j of b.justificatifs) if (j.chemin) await supprimerFichierBordereau(j.chemin).catch(() => {})
            onDeleteSaisie(b.id)
          }
          return [...parMois.entries()].map(([mois, liste]) => (
            <div key={mois} style={{ marginBottom: 14 }}>
              <h4 style={{ margin: '10px 0 6px', fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 15.5 }}>
                {libelleMois(mois)} — {liste.length} bordereau{liste.length > 1 ? 'x' : ''}
              </h4>
              {liste.map((b) => (
                <div className="bordereau-ligne" key={b.id}>
                  <div className="bordereau-vignettes">
                    {b.justificatifs.length > 0 ? <Pieces justificatifs={b.justificatifs} compact /> : <span className="muted" style={{ fontSize: 12 }}>pas de photo</span>}
                  </div>
                  <div className="infos" style={{ flex: 1, minWidth: 0 }}>
                    <strong>
                      {fmtDate(b.jour!)} · {magasinDe(b.magasinId)?.nom ?? '—'}
                    </strong>
                    <small>
                      {[b.collecteur, b.colis ? `${b.colis} colis` : '', b.kgFL ? `${fmtNum(b.kgFL, 1)} kg F&L` : '', b.signe ? 'signé' : 'signature non confirmée', b.note]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                    <div className="row-actions" style={{ marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
                      {autresMagasins(b).map((m) => (
                        <button key={m.id} className="btn btn-ghost btn-sm" onClick={() => deplacer(b, m.id)}>
                          → {m.nom}
                        </button>
                      ))}
                      <button className="btn btn-danger btn-sm" onClick={() => void supprimer(b)}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        })()}
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
            <span>Dons de l’exercice (total des reçus)</span>
            <strong>{fmtEUR(agg.baseBrute, 2)}</strong>
          </div>
          <div className="ligne">
            <span>Retenus dans la limite du plafond</span>
            <strong>{fmtEUR(agg.resultat.basePlafonnee, 2)}</strong>
          </div>
          {agg.reports.imputeCetExercice > 0 && (
            <div className="ligne">
              <span>Excédents antérieurs imputés</span>
              <strong>{fmtEUR(agg.reports.imputeCetExercice, 2)}</strong>
            </div>
          )}
          <div className="ligne">
            <span>Réduction d’IS (60 %)</span>
            <strong>{fmtEUR(agg.reductionISTotale, 2)}</strong>
          </div>
          {agg.reports.nouvelExcedent > 0 && (
            <div className="ligne">
              <span>Excédent {exercice} à reporter (jusqu’en {exercice + 5})</span>
              <strong>{fmtEUR(agg.reports.nouvelExcedent, 2)}</strong>
            </div>
          )}
        </div>
        {agg.reports.soldesFin.length > 0 && (
          <div className="info-banner" style={{ marginBottom: 12 }}>
            <strong>Stock d’excédents reportables au 31/12/{exercice} :</strong>{' '}
            {agg.reports.soldesFin.map((r) => `${fmtEUR(r.solde, 2)} (origine ${r.origine}, imputable jusqu’en ${r.expire})`).join(' · ')}.
            Il ne figure sur aucun reçu : c’est l’état annuel qui le suit d’une année sur l’autre, pour l’imprimé 2069-RCI.
          </div>
        )}
        {agg.semainesSansReleve.length > 0 && (
          <div className="info-banner alerte" style={{ marginBottom: 10 }}>
            <strong>État annuel et reçus bloqués : relevé de démarque manquant.</strong>{' '}
            {agg.semainesSansReleve.length} semaine{agg.semainesSansReleve.length > 1 ? 's ont' : ' a'} des bordereaux sans relevé :{' '}
            {agg.semainesSansReleve.map((x) => `${x.magasinNom} ${x.semaine} (${x.nbBordereaux} bordereau${x.nbBordereaux > 1 ? 'x' : ''})`).join(', ')}.
            Un état annuel sans la valeur de ces dons serait faux, et la commission Mana avec. Ajoutez les relevés dans Saisie.
          </div>
        )}
        {!societe.contrat && (
          <div className="info-banner alerte" style={{ marginBottom: 10 }}>
            <strong>Contrat de service non signé :</strong> l’état annuel et les reçus ne sont émis qu’une fois le contrat signé (onglet Magasins, carte de la société).
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={agg.semainesSansReleve.length > 0 || !societe.contrat} style={{ opacity: agg.semainesSansReleve.length > 0 || !societe.contrat ? 0.5 : 1 }} onClick={() => pdfEtatAnnuel(agg, exercice)}>
          ⬇ État annuel {exercice} — {denomination(societe)}
        </button>
      </div>

      <div className="card">
        <h3>Reçus fiscaux 2041-MEC-SD</h3>
        <p className="muted">
          Un reçu par association, pour la valeur totale qu’elle a reçue — c’est elle qui le délivre, Mana le
          préremplit (donateur lu au registre national, montant en chiffres et en toutes lettres, période, annexe
          mensuelle). Un seul reçu par exercice et par association, même avec un enlèvement par jour.
        </p>
        {(() => {
          const parCollecteur = new Map<string, number>()
          for (const s of agg.saisies) parCollecteur.set(s.collecteur ?? '', (parCollecteur.get(s.collecteur ?? '') ?? 0) + baseDeLaSaisie(s))
          const tous = agg.magasins.flatMap((m) => m.collecteurs.map((c) => c.nom))
          const unSeul = new Set(tous).size === 1 ? tous[0] : undefined
          const entrees = [...parCollecteur.entries()].sort((a, b) => b[1] - a[1])
          if (entrees.length === 0) return <p className="muted">Aucun don enregistré sur l’exercice.</p>
          return entrees.map(([nom, montant]) => {
            const sansNom = nom === ''
            return (
              <div className="row-actions" key={nom || '—'} style={{ marginBottom: 8, alignItems: 'center', gap: 10 }}>
                <button
                  className={`btn btn-sm ${sansNom && !unSeul ? 'btn-ghost' : 'btn-primary'}`}
                  disabled={agg.semainesSansReleve.length > 0 || !societe.contrat}
                  onClick={() => pdfRecuFiscal(agg, exercice, sansNom ? undefined : nom)}
                  style={{ flex: 1, opacity: agg.semainesSansReleve.length > 0 || !societe.contrat ? 0.5 : 1 }}
                >
                  ⬇ Reçu {exercice} — {nom || unSeul || 'association non précisée'} · {fmtEUR(montant, 2)}
                </button>
              </div>
            )
          })
        })()}
        {agg.magasins.some((m) => m.collecteurs.length >= 2) && agg.saisies.some((s) => !s.collecteur) && (
          <p className="muted" style={{ color: 'var(--ambre-texte)', margin: '4px 0 0' }}>
            Certaines saisies n’indiquent pas quelle association a enlevé les denrées : précisez-le dans la saisie
            concernée pour que chaque reçu porte le bon montant.
          </p>
        )}
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
