import { useState } from 'react'
import { simuler, SUCCESS_FEE_PCT } from '../lib/calc'
import { fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { Amount } from '../components/Formula'

/**
 * Simulateur public (spec §4.6) — la page d'accueil et l'outil de vente n°1.
 * 3 champs : CA HT, marge brute, % de démarque (préréglé 3 %) + part donnable réglable (50 %).
 */
export function Simulateur({ onCommencer }: { onCommencer: () => void }) {
  const [caHT, setCaHT] = useState(2_000_000)
  const [marge, setMarge] = useState(30)
  const [demarque, setDemarque] = useState(3)
  const [donnable, setDonnable] = useState(50)
  const FEE = SUCCESS_FEE_PCT

  const r = simuler(caHT, marge, demarque, donnable, FEE)
  const plafonne = r.excedent > 0

  return (
    <div>
      <div className="hero">
        <h2>La manne cachée de vos invendus</h2>
        <p className="muted">
          Vos invendus alimentaires donnent droit à une réduction d’impôt de 60 % de leur coût de revient
          (article 238 bis du CGI). Estimez ce que votre magasin laisse filer chaque année.
        </p>
      </div>

      <div className="card">
        <label className="field">
          <span>Chiffre d’affaires HT annuel</span>
          <div className="suffixe">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
              value={caHT}
              onChange={(e) => setCaHT(Math.max(0, Number(e.target.value)))}
            />
            <em>€ HT</em>
          </div>
        </label>

        <label className="field">
          <span>Marge brute — {fmtPct(marge)}</span>
          <div className="range-row">
            <input type="range" min={10} max={60} step={0.1} value={marge} onChange={(e) => setMarge(Number(e.target.value))} />
            <div className="suffixe">
              <input type="number" inputMode="decimal" min={0} max={90} step={0.1} value={marge} onChange={(e) => setMarge(Number(e.target.value))} />
              <em>%</em>
            </div>
          </div>
          <span className="aide">Celle de votre liasse fiscale, en % du CA.</span>
        </label>

        <label className="field">
          <span>Démarque (casse, invendus) — {fmtPct(demarque)}</span>
          <div className="range-row">
            <input type="range" min={0.5} max={8} step={0.1} value={demarque} onChange={(e) => setDemarque(Number(e.target.value))} />
            <div className="suffixe">
              <input type="number" inputMode="decimal" min={0} max={20} step={0.1} value={demarque} onChange={(e) => setDemarque(Number(e.target.value))} />
              <em>%</em>
            </div>
          </div>
          <span className="aide">Moyenne du commerce alimentaire : ~3 % du CA, au prix de vente.</span>
        </label>

        <label className="field" style={{ marginBottom: 0 }}>
          <span>Part donnable de la démarque — {fmtPct(donnable, 0)}</span>
          <div className="range-row">
            <input type="range" min={10} max={90} step={5} value={donnable} onChange={(e) => setDonnable(Number(e.target.value))} />
            <div className="suffixe">
              <input type="number" inputMode="numeric" min={0} max={100} step={5} value={donnable} onChange={(e) => setDonnable(Number(e.target.value))} />
              <em>%</em>
            </div>
          </div>
          <span className="aide">Hypothèse : produits encore consommables (DLC−1, DDM dépassée, fruits &amp; légumes sains).</span>
        </label>
      </div>

      <div className="card accent resultat-hero">
        <span className="muted">Votre magasin peut récupérer</span>
        <Amount
          className="gros"
          titre="Réduction d’impôt annuelle estimée"
          lignes={[
            `Démarque annuelle (prix de vente) : ${fmtEUR(caHT)} × ${fmtPct(demarque)} = ${fmtEUR(r.demarquePV)}`,
            `Part donnable : ${fmtEUR(r.demarquePV)} × ${fmtPct(donnable, 0)} = ${fmtEUR(r.donnablePV)}`,
            `Coût de revient : ${fmtEUR(r.donnablePV)} × (1 − ${fmtPct(marge)}) = ${fmtEUR(r.baseBrute)}`,
            `Plafond de dons : max(20 000 € ; 0,5 % × ${fmtEUR(caHT)}) = ${fmtEUR(r.plafond)}`,
            `Base retenue : min(${fmtEUR(r.baseBrute)} ; ${fmtEUR(r.plafond)}) = ${fmtEUR(r.basePlafonnee)}`,
            `= Réduction d’IS : 60 % × ${fmtEUR(r.basePlafonnee)} = ${fmtEUR(r.reductionIS)}`,
          ]}
        >
          {fmtEUR(r.reductionIS)} / an
        </Amount>
        <span className="accroche">Vous n’en touchez rien aujourd’hui.</span>

        <div className="detail-lignes" style={{ textAlign: 'left' }}>
          <div className="ligne">
            <span>Base de dons au coût de revient</span>
            <Amount
              titre="Base de dons annuelle"
              lignes={[
                `Démarque donnable au prix de vente : ${fmtEUR(r.donnablePV)}`,
                `Coefficient de coût de revient : 1 − ${fmtPct(marge)} = ${fmtNum(1 - marge / 100, 3)}`,
                `= ${fmtEUR(r.donnablePV)} × ${fmtNum(1 - marge / 100, 3)} = ${fmtEUR(r.baseBrute)}`,
              ]}
            >
              <strong>{fmtEUR(r.baseBrute)}</strong>
            </Amount>
          </div>
          <div className="ligne">
            <span>Plafond annuel de dons</span>
            <Amount
              titre="Plafond annuel (par société)"
              lignes={[
                `max(20 000 € ; 0,5 % × CA HT)`,
                `0,5 % × ${fmtEUR(caHT)} = ${fmtEUR(0.005 * caHT)}`,
                `= ${fmtEUR(r.plafond)}`,
              ]}
            >
              <strong>{fmtEUR(r.plafond)}</strong>
            </Amount>
          </div>
          {plafonne && (
            <div className="ligne">
              <span>
                Excédent au-delà du plafond <span className="badge">reportable 5 exercices</span>
              </span>
              <Amount
                titre="Excédent reportable — les règles"
                lignes={[
                  `Dons au-delà du plafond : ${fmtEUR(r.baseBrute)} − ${fmtEUR(r.plafond)} = ${fmtEUR(r.excedent)}`,
                  'Reportable sur les 5 exercices suivants, mais absorbé uniquement s’il reste de la place sous le plafond de ces années, après les dons de l’année.',
                  'Si le plafond est saturé chaque année, l’excédent expire au bout de 5 ans : viser le plafond, pas le dépasser largement.',
                ]}
              >
                <strong>{fmtEUR(r.excedent)}</strong>
              </Amount>
            </div>
          )}
          <div className="ligne">
            <span>Réduction d’impôt : 60 % des dons retenus</span>
            <Amount
              titre="Réduction d'impôt sur les sociétés"
              lignes={[
                'Le plafond limite les dons retenus — l’État en rend 60 % en réduction d’impôt.',
                `Dons retenus : min(${fmtEUR(r.baseBrute)} ; plafond ${fmtEUR(r.plafond)}) = ${fmtEUR(r.basePlafonnee)}`,
                `= 60 % × ${fmtEUR(r.basePlafonnee)} = ${fmtEUR(r.reductionIS)}`,
              ]}
            >
              <strong>{fmtEUR(r.reductionIS)}</strong>
            </Amount>
          </div>
          <div className="ligne">
            <span>Honoraires Mana ({fmtNum(FEE)} % du gain constaté)</span>
            <Amount
              titre="Honoraires Mana"
              lignes={[
                `${fmtNum(FEE)} % × réduction d’impôt réellement générée`,
                `= ${fmtNum(FEE)} % × ${fmtEUR(r.reductionIS)} = ${fmtEUR(r.factureMana)}`,
                `Pas d’économie = pas de facture.`,
              ]}
            >
              <strong>− {fmtEUR(r.factureMana)}</strong>
            </Amount>
          </div>
          <div className="ligne">
            <span>Votre gain net</span>
            <Amount
              titre="Gain net client"
              lignes={[
                `Réduction d’IS − honoraires Mana`,
                `= ${fmtEUR(r.reductionIS)} − ${fmtEUR(r.factureMana)} = ${fmtEUR(r.gainNetClient)}`,
              ]}
            >
              <strong style={{ fontSize: 17 }}>{fmtEUR(r.gainNetClient)} / an</strong>
            </Amount>
          </div>
        </div>
      </div>

      <button className="btn btn-ambre btn-block" onClick={onCommencer}>
        Créer mon magasin — 5 minutes, 0 € d’abonnement
      </button>

      <footer className="legal">
        0 € fixe : Mana se rémunère uniquement à {SUCCESS_FEE_PCT} % de l’économie d’impôt constatée. Estimation indicative — Mana
        n’est pas un conseil fiscal ; les montants définitifs sont validés par votre expert-comptable.
      </footer>
    </div>
  )
}
