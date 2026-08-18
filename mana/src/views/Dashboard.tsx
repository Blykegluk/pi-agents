import type { AppState } from '../types'
import { aggParSociete } from '../lib/selectors'
import { fmtDate, fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { Amount } from '../components/Formula'
import { Gauge } from '../components/Gauge'
import { IconTableau } from '../components/Icons'
import { CO2_PAR_KG, KG_PAR_REPAS, PV_MOYEN_EMBALLES_PAR_KG } from '../lib/calc'

/** Dashboard (spec §4.4 + complément §4) — jauge, projection, contrat en clair, impact. */
export function Dashboard({ state, exercice }: { state: AppState; exercice: number }) {
  const aggs = aggParSociete(state, exercice)

  if (state.societes.length === 0) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconTableau />
        </span>
        Le tableau de bord s’affichera dès qu’une société sera créée et qu’une semaine sera saisie.
      </div>
    )
  }

  const totalReduction = aggs.reduce((t, a) => t + a.resultat.reductionIS, 0)
  const totalCommissions = aggs.reduce((t, a) => t + a.commissionsHT, 0)
  const totalRepas = aggs.reduce((t, a) => t + a.repas, 0)
  const totalKg = aggs.reduce((t, a) => t + a.kgTotal, 0)
  const totalCO2 = aggs.reduce((t, a) => t + a.co2, 0)

  return (
    <div>
      <h2>Tableau de bord — {exercice}</h2>

      {aggs.length > 1 && (
        <div className="card accent">
          <h3>Consolidé — {aggs.length} sociétés</h3>
          <div className="detail-lignes">
            <div className="ligne">
              <span>Réduction d’IS acquise à date</span>
              <Amount
                titre="Réduction consolidée"
                lignes={[
                  ...aggs.map((a) => `${a.societe.raisonSociale} : ${fmtEUR(a.resultat.reductionIS, 2)}`),
                  `= ${fmtEUR(totalReduction, 2)}`,
                ]}
              >
                <strong style={{ fontSize: 18 }} className="montant-serif">{fmtEUR(totalReduction, 2)}</strong>
              </Amount>
            </div>
            <div className="ligne">
              <span>Commissions Mana facturées (HT)</span>
              <strong>{fmtEUR(totalCommissions, 2)}</strong>
            </div>
            <div className="ligne">
              <span>Gain net clients</span>
              <strong>{fmtEUR(totalReduction - totalCommissions, 2)}</strong>
            </div>
          </div>
        </div>
      )}

      {aggs.map((a) => {
        const r = a.resultat
        const p = a.projection
        return (
          <div className="card" key={a.societe.id}>
            <h3>{a.societe.raisonSociale}</h3>
            <p className="muted" style={{ marginTop: 2 }}>
              {a.magasins.map((m) => m.nom).join(' · ') || 'Aucun magasin'}
            </p>

            {a.plafondAtteint && (
              <div className="info-banner vert" style={{ marginTop: 10 }}>
                <strong>Plafond fiscal atteint — vos prochains dons ne sont plus facturés.</strong> Vous pouvez continuer
                à documenter vos dons (conformité, impact) ; le compteur repart au 1<sup>er</sup> jour de l’exercice suivant.
              </div>
            )}
            {a.alerteCA && !a.plafondAtteint && (
              <div className="info-banner alerte" style={{ marginTop: 10 }}>
                Volume de dons inhabituel par rapport au CA déclaré (&gt; 2,5 % du CA) — un justificatif complémentaire
                sera demandé. Semaines concernées marquées au registre.
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
                  <span>Commissions Mana facturées (HT)</span>
                  <Amount
                    titre="Commissions Mana"
                    lignes={[
                      `${fmtPct(a.societe.successFeePct, 0)} de la réduction, soit ${(a.societe.successFeePct * 0.6).toLocaleString('fr-FR')} % de la base documentée`,
                      ...a.factures.map((f) => `${f.numero} (${f.periode}) : ${fmtEUR(f.montantHT, 2)} HT`),
                      `= ${fmtEUR(a.commissionsHT, 2)} HT`,
                    ]}
                  >
                    <strong>− {fmtEUR(a.commissionsHT, 2)}</strong>
                  </Amount>
                </div>
                <div className="ligne">
                  <span>Votre gain net depuis le début de l’exercice</span>
                  <strong className="montant-serif" style={{ fontSize: 16 }}>{fmtEUR(r.reductionIS - a.commissionsHT, 2)}</strong>
                </div>
                {a.datePlafondEstimee && (
                  <div className="ligne">
                    <span>Plafond atteint (estimation, rythme actuel)</span>
                    <strong>{fmtDate(a.datePlafondEstimee.toISOString())}</strong>
                  </div>
                )}
              </div>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
                La facturation s’arrête automatiquement quand vos dons ne génèrent plus de réduction.
              </p>
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
                  <Amount
                    titre="CO₂ évité"
                    lignes={[`${fmtNum(a.kgTotal, 1)} kg × ${fmtNum(CO2_PAR_KG, 1)} kg CO₂e/kg`, `= ${fmtNum(a.co2)} kg CO₂e`]}
                  >
                    {fmtNum(a.co2)}
                  </Amount>
                </strong>
                <span>kg CO₂ évités</span>
              </div>
            </div>
          </div>
        )
      })}

      {aggs.length > 1 && (
        <div className="card">
          <h3>Impact consolidé</h3>
          <div className="impact">
            <div className="tuile">
              <strong>{fmtNum(totalRepas)}</strong>
              <span>repas sauvés</span>
            </div>
            <div className="tuile">
              <strong>{fmtNum(totalKg)}</strong>
              <span>kg détournés</span>
            </div>
            <div className="tuile">
              <strong>{fmtNum(totalCO2)}</strong>
              <span>kg CO₂ évités</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
