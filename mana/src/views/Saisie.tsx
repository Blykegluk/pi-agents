import { useEffect, useMemo, useState } from 'react'
import type { AppState, Justificatif, Saisie } from '../types'
import { baseSemaine, coutEmballes, coutFL } from '../lib/calc'
import { fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { addWeeks, compareWeekIds, currentWeekId, weekLabel } from '../lib/iso'
import { Amount } from '../components/Formula'
import { IconSaisie } from '../components/Icons'
import { uid } from '../lib/storage'
import { lireFichiers } from '../lib/fichiers'
import { aggParSociete } from '../lib/selectors'

/** Saisie hebdomadaire (spec §4.2) + corrections « dons refusés » (complément §3). */
export function SaisieView({
  state,
  exercice,
  onSave,
  onDelete,
}: {
  state: AppState
  exercice: number
  onSave: (s: Saisie) => void
  onDelete: (id: string) => void
}) {
  const magasins = state.magasins
  const [magasinId, setMagasinId] = useState(magasins[0]?.id ?? '')
  const [semaine, setSemaine] = useState(addWeeks(currentWeekId(), -1)) // par défaut : la semaine écoulée
  const [modeCorrection, setModeCorrection] = useState(false)

  const magasin = magasins.find((m) => m.id === magasinId) ?? magasins[0]
  const societe = state.societes.find((s) => s.id === magasin?.societeId)
  const agg = useMemo(
    () => (societe ? aggParSociete(state, exercice).find((a) => a.societe.id === societe.id) : undefined),
    [state, societe, exercice],
  )

  const existante = useMemo(
    () => state.saisies.find((s) => s.magasinId === magasin?.id && s.semaine === semaine && s.type === 'don'),
    [state.saisies, magasin, semaine],
  )
  const corrections = useMemo(
    () =>
      state.saisies
        .filter((s) => s.magasinId === magasin?.id && s.semaine === semaine && s.type === 'correction')
        .sort((a, b) => a.horodatage.localeCompare(b.horodatage)),
    [state.saisies, magasin, semaine],
  )

  const [pv, setPv] = useState('')
  const [kg, setKg] = useState('')
  const [note, setNote] = useState('')
  const [justificatifs, setJustificatifs] = useState<Justificatif[]>([])
  const [confirmation, setConfirmation] = useState(false)

  // Recharge le formulaire quand on change de magasin, de semaine ou de mode
  useEffect(() => {
    if (modeCorrection) {
      setPv('')
      setKg('')
      setNote('')
      setJustificatifs([])
    } else {
      setPv(existante ? String(existante.pvEmballes) : '')
      setKg(existante ? String(existante.kgFL) : '')
      setNote(existante?.note ?? '')
      setJustificatifs(existante?.justificatifs ?? [])
    }
    setConfirmation(false)
  }, [existante, magasinId, semaine, modeCorrection])

  if (!magasin || !societe) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconSaisie />
        </span>
        Créez d’abord une société et un magasin dans l’onglet « Magasins » pour commencer la saisie hebdomadaire.
      </div>
    )
  }

  const pvNum = Number(pv) || 0
  const kgNum = Number(kg) || 0
  const cEmb = coutEmballes(pvNum, societe.margePct)
  const cFL = coutFL(kgNum, magasin.coutKgFL)
  const base = baseSemaine(pvNum, societe.margePct, kgNum, magasin.coutKgFL)

  const semainePassee = compareWeekIds(semaine, currentWeekId()) < 0
  const correctionValide = modeCorrection
    ? semainePassee && (pvNum < 0 || kgNum < 0) && pvNum <= 0 && kgNum <= 0 && justificatifs.length > 0
    : true
  const formulaireValide = modeCorrection ? correctionValide : pvNum > 0 || kgNum > 0

  async function ajouterFichiers(files: FileList | null) {
    const nouveaux = await lireFichiers(files)
    setJustificatifs((prev) => [...prev, ...nouveaux])
  }

  function enregistrer() {
    if (!formulaireValide || !magasin || !societe) return
    onSave({
      id: modeCorrection ? uid() : (existante?.id ?? uid()),
      magasinId: magasin.id,
      semaine,
      type: modeCorrection ? 'correction' : 'don',
      pvEmballes: pvNum,
      kgFL: kgNum,
      note: note.trim() || (modeCorrection ? 'Dons refusés par l’association' : undefined),
      justificatifs,
      horodatage: new Date().toISOString(),
      margePctAppliquee: societe.margePct,
      coutKgFLApplique: magasin.coutKgFL,
    })
    setConfirmation(true)
    if (modeCorrection) setModeCorrection(false)
    setTimeout(() => setConfirmation(false), 2500)
  }

  return (
    <div>
      <h2>Saisie hebdomadaire</h2>

      {magasins.length > 1 && (
        <div className="chips">
          {magasins.map((m) => (
            <button key={m.id} className={`chip ${m.id === magasin.id ? 'active' : ''}`} onClick={() => setMagasinId(m.id)}>
              {m.nom}
            </button>
          ))}
        </div>
      )}

      {agg?.plafondAtteint && (
        <div className="info-banner vert">
          <strong>Plafond fiscal atteint — vos prochains dons ne sont plus facturés.</strong>
          <br />
          Vous pouvez continuer à documenter vos dons (conformité et impact) : le compteur repart au 1<sup>er</sup> jour
          de l’exercice suivant.
        </div>
      )}
      {agg?.alerteCA && !agg.plafondAtteint && (
        <div className="info-banner alerte">
          Volume de dons inhabituel par rapport au CA déclaré (plus de 2,5 % du CA) — un justificatif complémentaire
          sera demandé. Les semaines concernées sont marquées au registre.
        </div>
      )}

      <div className="semaine-nav">
        <button className="btn btn-ghost" onClick={() => setSemaine(addWeeks(semaine, -1))} aria-label="Semaine précédente">
          ‹
        </button>
        <div className="titre">
          {weekLabel(semaine)}
          <small>
            {existante ? 'Saisie enregistrée — modifiable' : 'Aucune saisie pour cette semaine'}
            {corrections.length > 0 ? ` · ${corrections.length} correction${corrections.length > 1 ? 's' : ''}` : ''}
          </small>
        </div>
        <button className="btn btn-ghost" onClick={() => setSemaine(addWeeks(semaine, 1))} aria-label="Semaine suivante">
          ›
        </button>
      </div>

      {!modeCorrection && (
        <div className="info-banner">
          Rappel : on ne donne <strong>jamais</strong> un produit à DLC dépassée. DDM dépassée = donnable (« à consommer
          de préférence avant »). Fruits &amp; légumes moches mais sains = donnables.
        </div>
      )}

      <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={modeCorrection}
          onChange={(e) => setModeCorrection(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--vert)' }}
        />
        <span style={{ marginBottom: 0, fontWeight: 600, fontSize: 14 }}>
          Correction : retrancher des dons refusés par l’association
        </span>
      </label>
      {modeCorrection && (
        <div className="info-banner">
          Saisissez les montants <strong>en négatif</strong> (ex. −120 € / −8 kg), sur une <strong>semaine passée</strong>,
          avec le justificatif du refus joint. Le cumul, le plafond et la prochaine facture se recalculent automatiquement.
        </div>
      )}

      <div className="card">
        <label className="field">
          <span>{modeCorrection ? 'Correction — produits emballés (prix de vente)' : 'Démarque « don » — produits emballés (prix de vente)'}</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" step={1} max={modeCorrection ? 0 : undefined} min={modeCorrection ? undefined : 0} value={pv} onChange={(e) => setPv(e.target.value)} placeholder={modeCorrection ? 'Ex. −120' : 'Ex. 1 150'} />
            <em>€</em>
          </div>
          {!modeCorrection && <span className="aide">Montant lu dans l’export démarque de votre back-office (motif « don »).</span>}
        </label>
        <label className="field">
          <span>{modeCorrection ? 'Correction — fruits & légumes (poids)' : 'Fruits & légumes donnés (poids total)'}</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" step={0.5} max={modeCorrection ? 0 : undefined} min={modeCorrection ? undefined : 0} value={kg} onChange={(e) => setKg(e.target.value)} placeholder={modeCorrection ? 'Ex. −8' : 'Ex. 55'} />
            <em>kg</em>
          </div>
          {!modeCorrection && <span className="aide">Poids global pesé par le collecteur (bordereau d’enlèvement).</span>}
        </label>
        <label className="field">
          <span>Justificatifs (photos ou PDF){modeCorrection ? ' *' : ''}</span>
          <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => ajouterFichiers(e.target.files)} />
          <span className="aide">
            {modeCorrection
              ? 'Obligatoire : bordereau ou mail de refus de l’association.'
              : 'Export démarque de la semaine + bordereaux d’enlèvement signés.'}
          </span>
          {justificatifs.length > 0 && (
            <span className="justif-list">
              {justificatifs.map((j) => (
                <span className="pj" key={j.id}>
                  📎 {j.nom}
                  <button aria-label={`Retirer ${j.nom}`} onClick={(e) => { e.preventDefault(); setJustificatifs(justificatifs.filter((x) => x.id !== j.id)) }}>
                    ✕
                  </button>
                </span>
              ))}
            </span>
          )}
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Note (facultatif)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={modeCorrection ? 'Ex. 3 cagettes refusées (chaîne du froid)' : 'Ex. bordereau signé par M. Perret, passage vendredi'} />
        </label>
      </div>

      <div className="card accent">
        <h3>{modeCorrection ? 'Correction de la semaine' : 'Valorisation de la semaine'}</h3>
        <div className="detail-lignes">
          <div className="ligne">
            <span>Coût de revient emballés</span>
            <Amount
              titre="Coût de revient — produits emballés"
              lignes={[
                'coût_emballés = PV_semaine × (1 − marge)',
                `= ${fmtEUR(pvNum, 2)} × (1 − ${fmtPct(societe.margePct)})`,
                `= ${fmtEUR(cEmb, 2)}`,
              ]}
            >
              <strong>{fmtEUR(cEmb, 2)}</strong>
            </Amount>
          </div>
          <div className="ligne">
            <span>Valorisation F&amp;L</span>
            <Amount
              titre="Coût de revient — fruits & légumes"
              lignes={[
                'coût_FL = kg × coût_kg',
                `= ${fmtNum(kgNum, 1)} kg × ${fmtEUR(magasin.coutKgFL, 2)}/kg`,
                `= ${fmtEUR(cFL, 2)}`,
              ]}
            >
              <strong>{fmtEUR(cFL, 2)}</strong>
            </Amount>
          </div>
          <div className="ligne">
            <span>Total de la semaine (base fiscale)</span>
            <Amount
              titre="Base de la semaine"
              lignes={[
                'base_semaine = coût_emballés + coût_FL',
                `= ${fmtEUR(cEmb, 2)} + ${fmtEUR(cFL, 2)}`,
                `= ${fmtEUR(base, 2)}`,
                `Réduction d’impôt correspondante (hors plafond) : 60 % × ${fmtEUR(base, 2)} = ${fmtEUR(0.6 * base, 2)}`,
              ]}
            >
              <strong style={{ fontSize: 18 }} className="montant-serif">{fmtEUR(base, 2)}</strong>
            </Amount>
          </div>
        </div>
      </div>

      {modeCorrection && !semainePassee && (
        <p className="muted" style={{ marginBottom: 10 }}>Une correction ne peut porter que sur une semaine passée.</p>
      )}

      <button className="btn btn-primary btn-block" disabled={!formulaireValide} style={{ opacity: formulaireValide ? 1 : 0.5 }} onClick={enregistrer}>
        {modeCorrection ? 'Enregistrer la correction' : existante ? 'Mettre à jour la semaine' : 'Enregistrer la semaine'}
      </button>
      {confirmation && (
        <p style={{ textAlign: 'center', marginTop: 10 }}>
          <span className="badge vert">✓ Enregistré au registre</span>
        </p>
      )}

      {corrections.length > 0 && !modeCorrection && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Corrections de cette semaine</h3>
          {corrections.map((c) => (
            <div className="facture-ligne" key={c.id}>
              <div className="infos">
                <strong>{fmtEUR(c.pvEmballes, 2)} · {fmtNum(c.kgFL, 1)} kg</strong>
                <small>{c.note}</small>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Supprimer cette correction ?')) onDelete(c.id) }}>
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}

      {existante && !modeCorrection && (
        <button
          className="btn btn-danger btn-block"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (confirm('Supprimer la saisie de cette semaine ?')) onDelete(existante.id)
          }}
        >
          Supprimer cette saisie
        </button>
      )}
    </div>
  )
}
