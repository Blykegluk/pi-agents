import type { AppState } from '../types'
import { aggParSociete, type AggSociete } from '../lib/selectors'
import { fmtDate, fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { Amount } from '../components/Formula'
import { Gauge } from '../components/Gauge'
import { denomination } from '../lib/identite'
import { IconTableau } from '../components/Icons'
import { CO2_PAR_KG, KG_PAR_REPAS, PV_MOYEN_EMBALLES_PAR_KG, TAUX_IS, TAUX_REDUCTION } from '../lib/calc'
import { pdfResumeGroupe } from '../lib/pdf'

/**
 * Bloc consolidé du groupe : figé en tête du Bilan quand il y a plusieurs sociétés.
 * Réduction, commission, gain, avantage réel et impact, toutes sociétés confondues,
 * avec le résumé de groupe en PDF.
 */
export function Consolide({ aggs, exercice }: { aggs: AggSociete[]; exercice: number }) {
  const totalReduction = aggs.reduce((t, a) => t + a.reductionISTotale, 0)
  const totalCommissions = aggs.reduce((t, a) => t + a.resultat.factureMana, 0)
  const totalFacture = aggs.reduce((t, a) => t + a.commissionsHT, 0)
  const totalAttente = aggs.reduce((t, a) => t + a.estimationAttente.commission, 0)
  const totalAvantage = aggs.reduce((t, a) => t + a.resultat.avantageReel, 0)
  const totalRepas = aggs.reduce((t, a) => t + a.repas, 0)
  const totalKg = aggs.reduce((t, a) => t + a.kgTotal, 0)
  const totalCO2 = aggs.reduce((t, a) => t + a.co2, 0)
  return (
    <div className="card accent">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Groupe — {aggs.length} sociétés</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => void pdfResumeGroupe(aggs, exercice)} title="Résumé consolidé du groupe, société par société">
          ⬇ Résumé du groupe (PDF)
        </button>
      </div>
      <div className="detail-lignes">
        <div className="ligne">
          <span>Réduction d’IS acquise à date</span>
          <Amount titre="Réduction consolidée" lignes={[...aggs.map((a) => `${denomination(a.societe)} : ${fmtEUR(a.reductionISTotale, 2)}`), `= ${fmtEUR(totalReduction, 2)}`]}>
            <strong style={{ fontSize: 18 }} className="montant-serif">{fmtEUR(totalReduction, 2)}</strong>
          </Amount>
        </div>
        <div className="ligne">
          <span>Commission Mana due (30 % de la réduction acquise)</span>
          <strong>{fmtEUR(totalCommissions, 2)} HT{totalFacture < totalCommissions - 0.005 ? ` · dont facturée ${fmtEUR(totalFacture, 2)}` : ''}</strong>
        </div>
        {totalAttente > 0 && (
          <div className="ligne">
            <span>+ estimée, en attente de relevés</span>
            <strong style={{ color: 'var(--ambre-texte)' }}>≈ {fmtEUR(totalAttente, 2)} HT</strong>
          </div>
        )}
        <div className="ligne">
          <span>Réduction nette de la commission</span>
          <strong>{fmtEUR(totalReduction - totalCommissions, 2)}</strong>
        </div>
        <div className="ligne">
          <span>Résultat net pour le groupe, après impôt (IS à 25 %)</span>
          <Amount titre="Résultat net du groupe, après impôt" lignes={[...aggs.map((a) => `${denomination(a.societe)} : ${fmtEUR(a.resultat.avantageReel, 2)}`), `= ${fmtEUR(totalAvantage, 2)}`, 'Le plafond s’apprécie société par société ; la mère impute les réductions des filiales en intégration fiscale.']}>
            <strong className="montant-serif" style={{ fontSize: 16 }}>{fmtEUR(totalAvantage, 2)}</strong>
          </Amount>
        </div>
      </div>
      <div className="impact" style={{ marginTop: 12 }}>
        <div className="tuile"><strong>{fmtNum(totalRepas)}</strong><span>repas sauvés</span></div>
        <div className="tuile"><strong>{fmtNum(totalKg)}</strong><span>kg détournés</span></div>
        <div className="tuile"><strong>{fmtNum(totalCO2)}</strong><span>kg CO₂ évités</span></div>
      </div>
    </div>
  )
}

/** Dashboard d'une société (spec §4.4 + complément §4) — jauge, projection, contrat en clair, impact. */
export function Dashboard({ state, exercice, societeId }: { state: AppState; exercice: number; societeId?: string }) {
  const aggs = aggParSociete(state, exercice)
  const a = aggs.find((x) => x.societe.id === societeId) ?? aggs[0]

  if (!a) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconTableau />
        </span>
        Le tableau de bord s’affichera dès qu’une société sera créée et qu’une semaine sera saisie.
      </div>
    )
  }

  const r = a.resultat
  const p = a.projection
  return (
    <div className="card">
      <h3>{denomination(a.societe)}</h3>
      <p className="muted" style={{ marginTop: 2 }}>
        {a.magasins.map((m) => m.nom).join(' · ') || 'Aucun magasin'}
      </p>

      {a.plafondAtteint && (
        <div className="info-banner vert" style={{ marginTop: 10 }}>
          <strong>Plafond fiscal atteint :</strong> les prochains dons ne sont plus facturés.
        </div>
      )}
      {a.alerteCA && !a.plafondAtteint && (
        <div className="info-banner alerte" style={{ marginTop: 10 }}>
          Dons supérieurs à 2,5 % du CA : un justificatif complémentaire sera demandé.
        </div>
      )}

      <Gauge
        valeur={r.baseBrute}
        max={r.plafond}
        sousTitre={`Base de dons cumulée sur l'exercice / plafond de la société — max(20 000 € ; 0,5 % × ${fmtEUR(a.societe.caHT)})`}
      />
      {r.excedent > 0 && (
        <p style={{ textAlign: 'center' }}>
          <span className="badge">Excédent {fmtEUR(r.excedent)} — reportable 5 exercices</span>
        </p>
      )}

      <div className="detail-lignes">
        <div className="ligne">
          <span>Réduction d’IS acquise à date</span>
          <Amount
            titre="Réduction d'impôt acquise"
            lignes={[
              `Base cumulée : ${fmtEUR(r.baseBrute, 2)}`,
              `Plafond : ${fmtEUR(r.plafond)} → base retenue : ${fmtEUR(r.basePlafonnee, 2)}`,
              `= 60 % × ${fmtEUR(r.basePlafonnee, 2)} = ${fmtEUR(r.reductionIS, 2)}`,
            ]}
          >
            <strong style={{ fontSize: 17 }} className="montant-serif">{fmtEUR(r.reductionIS, 2)}</strong>
          </Amount>
        </div>

        {p && p.semainesRestantes > 0 && (
          <div className="ligne">
            <span>Projection fin d’année</span>
            <Amount
              titre="Projection fin d'année"
              lignes={[
                `Rythme moyen des 4 dernières semaines saisies : ${fmtEUR(p.rythmeHebdo, 2)}/semaine`,
                `Base projetée : ${fmtEUR(r.baseBrute, 2)} + ${fmtEUR(p.rythmeHebdo, 2)} × ${p.semainesRestantes} semaines restantes = ${fmtEUR(p.baseProjetee, 2)}`,
                `Base retenue (plafond ${fmtEUR(r.plafond)}) : ${fmtEUR(p.resultatProjete.basePlafonnee, 2)}`,
                p.resultatProjete.excedent > 0
                  ? `Excédent projeté : ${fmtEUR(p.resultatProjete.excedent, 2)} — reportable 5 exercices`
                  : 'Plafond non atteint à ce rythme',
                `= 60 % × ${fmtEUR(p.resultatProjete.basePlafonnee, 2)} = ${fmtEUR(p.resultatProjete.reductionIS, 2)}`,
              ]}
            >
              <strong>
                {fmtEUR(p.resultatProjete.reductionIS)}
                {p.resultatProjete.excedent > 0 ? ' (plafond saturé)' : ''}
              </strong>
            </Amount>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--sable)', borderRadius: 10, padding: '13px 15px', marginTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Votre contrat en clair</div>
        <div className="detail-lignes" style={{ marginTop: 0 }}>
          <div className="ligne">
            <span>Réduction d’impôt acquise</span>
            <strong>{fmtEUR(r.reductionIS, 2)}</strong>
          </div>
          <div className="ligne">
            <span>Commission Mana due (HT)</span>
            <Amount
              titre="Commission Mana"
              lignes={[
                `${fmtPct(a.societe.successFeePct, 0)} de la réduction acquise, soit ${(a.societe.successFeePct * 0.6).toLocaleString('fr-FR')} % de la base documentée`,
                `${(a.societe.successFeePct * 0.6).toLocaleString('fr-FR')} % × ${fmtEUR(r.basePlafonnee, 2)} = ${fmtEUR(r.factureMana, 2)} HT`,
                ...(a.factures.length ? a.factures.map((f) => `facturé : ${f.numero} (${f.periode}) ${fmtEUR(f.montantHT, 2)} HT`) : ['aucune facture émise pour l’instant']),
              ]}
            >
              <strong>− {fmtEUR(r.factureMana, 2)}</strong>
            </Amount>
          </div>
          {a.commissionsHT < r.factureMana - 0.005 && (
            <div className="ligne">
              <span>dont déjà facturée</span>
              <strong>{fmtEUR(a.commissionsHT, 2)} HT</strong>
            </div>
          )}
          <div className="ligne">
            <span>Réduction nette de la commission depuis le début de l’exercice</span>
            <strong className="montant-serif" style={{ fontSize: 16 }}>{fmtEUR(r.reductionIS - r.factureMana, 2)}</strong>
          </div>
          <div className="ligne">
            <span>Résultat net pour la société, après impôt (IS à 25 %)</span>
            <Amount
              titre="Résultat net pour la société"
              lignes={[
                'Ce que la société gagne réellement en donnant plutôt qu’en jetant, une fois l’impôt compté. Jeter est une perte déductible : l’impôt baisse déjà de 25 % du coût de revient. Donner n’est pas déductible (le don est réintégré au résultat) mais ouvre 60 % de réduction.',
                `Gain brut = (${fmtPct(TAUX_REDUCTION * 100, 0)} − ${fmtPct(TAUX_IS * 100, 0)}) × ${fmtEUR(r.basePlafonnee, 2)} = ${fmtEUR((TAUX_REDUCTION - TAUX_IS) * r.basePlafonnee, 2)}`,
                `Commission Mana déductible : coût réel = ${fmtPct((1 - TAUX_IS) * 100, 0)} × ${fmtEUR(r.factureMana, 2)} = ${fmtEUR((1 - TAUX_IS) * r.factureMana, 2)}`,
                `= ${fmtEUR(r.avantageReel, 2)} — PME au taux réduit de 15 % : le résultat net est plus élevé encore.`,
              ]}
            >
              <strong>{fmtEUR(r.avantageReel, 2)}</strong>
            </Amount>
          </div>
          {a.semainesSansReleve.length > 0 && (
            <div className="info-banner" style={{ margin: '10px 0 0' }}>
              <strong>{a.estimationAttente.nbBordereaux} bordereau{a.estimationAttente.nbBordereaux > 1 ? 'x' : ''} sans relevé</strong>{' '}
              ({a.semainesSansReleve.map((x) => `${x.magasinNom} ${x.semaine}`).join(', ')}) : pas encore comptés ci-dessus.
              {a.estimationAttente.methode !== 'aucune' ? <> Estimation : base ≈ {fmtEUR(a.estimationAttente.base, 0)}.</> : null} Ajoutez le relevé dans Saisie.
            </div>
          )}
          {a.datePlafondEstimee && (
            <div className="ligne">
              <span>Plafond atteint (estimation, rythme actuel)</span>
              <strong>{fmtDate(a.datePlafondEstimee.toISOString())}</strong>
            </div>
          )}
        </div>
      </div>

      <hr className="sep" />
      <div className="impact">
        <div className="tuile">
          <strong>
            <Amount
              titre="Repas sauvés"
              lignes={[
                `Kg détournés : ${fmtNum(a.kgTotal, 1)} kg (F&L pesés : ${fmtNum(a.kgFL, 1)} kg + emballés estimés à ${fmtEUR(PV_MOYEN_EMBALLES_PAR_KG, 2)}/kg de prix de vente)`,
                `= ${fmtNum(a.kgTotal, 1)} kg ÷ ${fmtNum(KG_PAR_REPAS, 1)} kg/repas`,
                `= ${fmtNum(a.repas)} repas`,
              ]}
            >
              {fmtNum(a.repas)}
            </Amount>
          </strong>
          <span>repas sauvés</span>
        </div>
        <div className="tuile">
          <strong>{fmtNum(a.kgTotal)}</strong>
          <span>kg détournés de la poubelle</span>
        </div>
        <div className="tuile">
          <strong>
            <Amount titre="CO₂ évité" lignes={[`${fmtNum(a.kgTotal, 1)} kg × ${fmtNum(CO2_PAR_KG, 1)} kg CO₂e/kg`, `= ${fmtNum(a.co2)} kg CO₂e`]}>
              {fmtNum(a.co2)}
            </Amount>
          </strong>
          <span>kg CO₂ évités</span>
        </div>
      </div>
    </div>
  )
}
