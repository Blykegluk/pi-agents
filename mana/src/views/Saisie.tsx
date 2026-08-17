import { useEffect, useMemo, useState } from 'react'
import type { Justificatif, Magasin, Saisie } from '../types'
import { baseSemaine, coutEmballes, coutFL } from '../lib/calc'
import { fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { addWeeks, currentWeekId, weekLabel } from '../lib/iso'
import { Amount } from '../components/Formula'
import { uid } from '../lib/storage'

const TAILLE_MAX_PJ = 1.5 * 1024 * 1024 // localStorage : on borne chaque pièce jointe

/** Saisie hebdomadaire (spec §4.2) — l'écran principal, 10 minutes par semaine. */
export function SaisieView({
  magasins,
  saisies,
  onSave,
  onDelete,
}: {
  magasins: Magasin[]
  saisies: Saisie[]
  onSave: (s: Saisie) => void
  onDelete: (id: string) => void
}) {
  const [magasinId, setMagasinId] = useState(magasins[0]?.id ?? '')
  const [semaine, setSemaine] = useState(addWeeks(currentWeekId(), -1)) // par défaut : la semaine écoulée

  const magasin = magasins.find((m) => m.id === magasinId)
  const existante = useMemo(
    () => saisies.find((s) => s.magasinId === magasinId && s.semaine === semaine),
    [saisies, magasinId, semaine],
  )

  const [pv, setPv] = useState('')
  const [kg, setKg] = useState('')
  const [note, setNote] = useState('')
  const [justificatifs, setJustificatifs] = useState<Justificatif[]>([])
  const [confirmation, setConfirmation] = useState(false)

  // Recharge le formulaire quand on change de magasin ou de semaine
  useEffect(() => {
    setPv(existante ? String(existante.pvEmballes) : '')
    setKg(existante ? String(existante.kgFL) : '')
    setNote(existante?.note ?? '')
    setJustificatifs(existante?.justificatifs ?? [])
    setConfirmation(false)
  }, [existante, magasinId, semaine])

  if (!magasin) {
    return (
      <div className="card empty">
        <span className="ico">✍️</span>
        Créez d’abord un magasin dans l’onglet « Magasins » pour commencer la saisie hebdomadaire.
      </div>
    )
  }

  const pvNum = Number(pv) || 0
  const kgNum = Number(kg) || 0
  const cEmb = coutEmballes(pvNum, magasin.margePct)
  const cFL = coutFL(kgNum, magasin.coutKgFL)
  const base = baseSemaine(pvNum, magasin.margePct, kgNum, magasin.coutKgFL)

  async function ajouterFichiers(files: FileList | null) {
    if (!files) return
    const nouveaux: Justificatif[] = []
    for (const f of Array.from(files)) {
      if (f.size > TAILLE_MAX_PJ) {
        alert(`« ${f.name} » dépasse 1,5 Mo — compressez la photo ou le PDF avant de le joindre.`)
        continue
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('lecture impossible'))
        r.readAsDataURL(f)
      })
      nouveaux.push({ id: uid(), nom: f.name, type: f.type, taille: f.size, dataUrl })
    }
    setJustificatifs((prev) => [...prev, ...nouveaux])
  }

  function enregistrer() {
    onSave({
      id: existante?.id ?? uid(),
      magasinId,
      semaine,
      pvEmballes: pvNum,
      kgFL: kgNum,
      note: note.trim() || undefined,
      justificatifs,
      horodatage: new Date().toISOString(),
      margePctAppliquee: magasin!.margePct,
      coutKgFLApplique: magasin!.coutKgFL,
    })
    setConfirmation(true)
    setTimeout(() => setConfirmation(false), 2500)
  }

  return (
    <div>
      <h2>Saisie hebdomadaire</h2>

      {magasins.length > 1 && (
        <div className="chips">
          {magasins.map((m) => (
            <button key={m.id} className={`chip ${m.id === magasinId ? 'active' : ''}`} onClick={() => setMagasinId(m.id)}>
              {m.nom}
            </button>
          ))}
        </div>
      )}

      <div className="semaine-nav">
        <button className="btn btn-ghost" onClick={() => setSemaine(addWeeks(semaine, -1))} aria-label="Semaine précédente">
          ‹
        </button>
        <div className="titre">
          {weekLabel(semaine)}
          <small>{existante ? `Saisie enregistrée — modifiable` : 'Aucune saisie pour cette semaine'}</small>
        </div>
        <button className="btn btn-ghost" onClick={() => setSemaine(addWeeks(semaine, 1))} aria-label="Semaine suivante">
          ›
        </button>
      </div>

      <div className="info-banner">
        Rappel : on ne donne <strong>jamais</strong> un produit à DLC dépassée. DDM dépassée = donnable (« à consommer
        de préférence avant »). Fruits &amp; légumes moches mais sains = donnables.
      </div>

      <div className="card">
        <label className="field">
          <span>Démarque « don » — produits emballés (prix de vente)</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} step={1} value={pv} onChange={(e) => setPv(e.target.value)} placeholder="Ex. 1 150" />
            <em>€</em>
          </div>
          <span className="aide">Montant lu dans l’export démarque de votre back-office (motif « don »).</span>
        </label>
        <label className="field">
          <span>Fruits &amp; légumes donnés (poids total)</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} step={0.5} value={kg} onChange={(e) => setKg(e.target.value)} placeholder="Ex. 55" />
            <em>kg</em>
          </div>
          <span className="aide">Poids global pesé par le collecteur (bordereau d’enlèvement).</span>
        </label>
        <label className="field">
          <span>Justificatifs (photos ou PDF)</span>
          <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => ajouterFichiers(e.target.files)} />
          <span className="aide">Export démarque de la semaine + bordereaux d’enlèvement signés.</span>
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
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. bordereau signé par M. Perret, passage vendredi" />
        </label>
      </div>

      <div className="card accent">
        <h3>Valorisation de la semaine</h3>
        <div className="detail-lignes">
          <div className="ligne">
            <span>Coût de revient emballés</span>
            <Amount
              titre="Coût de revient — produits emballés"
              lignes={[
                'coût_emballés = PV_semaine × (1 − marge)',
                `= ${fmtEUR(pvNum, 2)} × (1 − ${fmtPct(magasin.margePct)})`,
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
              <strong style={{ fontSize: 18 }}>{fmtEUR(base, 2)}</strong>
            </Amount>
          </div>
        </div>
      </div>

      <button className="btn btn-primary btn-block" disabled={pvNum <= 0 && kgNum <= 0} style={{ opacity: pvNum > 0 || kgNum > 0 ? 1 : 0.5 }} onClick={enregistrer}>
        {existante ? 'Mettre à jour la semaine' : 'Enregistrer la semaine'}
      </button>
      {confirmation && (
        <p style={{ textAlign: 'center', marginTop: 10 }}>
          <span className="badge vert">✓ Semaine enregistrée au registre</span>
        </p>
      )}
      {existante && (
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
