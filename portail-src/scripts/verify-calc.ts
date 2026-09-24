/**
 * Vérification chiffrée du moteur de calcul (spec §4.3).
 * Lancer : npm run verify
 */
import {
  baseSemaine,
  coutEmballes,
  coutFL,
  plafondAnnuel,
  resultatAnnuel,
  simuler,
} from '../src/lib/calc.ts'
import { derouleFacturation, tauxCommissionPct } from '../src/lib/facturation.ts'
import { suiviReports } from '../src/lib/reports.ts'
import { joursEntre, normaliserEnPVHT, repartirReleve, repartirRelevePeriode, semainesDuMois } from '../src/lib/releves.ts'

let echecs = 0

function attendre(nom: string, obtenu: number, attendu: number) {
  const ok = Math.abs(obtenu - attendu) < 1e-9
  if (!ok) echecs++
  console.log(`${ok ? '✓' : '✗'} ${nom} : ${obtenu.toFixed(2)} € (attendu ${attendu.toFixed(2)} €)`)
}

console.log('— Exemple 1 : une semaine, magasin à marge 33,6 % —')
// PV démarque don emballés = 1 000 € ; 50 kg F&L à 2,20 €/kg
attendre('coût_emballés = 1 000 × (1 − 33,6 %)', coutEmballes(1000, 33.6), 664)
attendre('coût_FL = 50 × 2,20', coutFL(50, 2.2), 110)
attendre('base_semaine = 664 + 110', baseSemaine(1000, 33.6, 50, 2.2), 774)

console.log('\n— Exemple 2 : plafonnement annuel (CA 1,97 M€) —')
attendre('plafond = max(20 000 ; 0,5 % × 1 970 000)', plafondAnnuel(1_970_000), 20_000)
// Base annuelle de 24 000 € → plafonnée à 20 000, excédent 4 000
const r = resultatAnnuel(24_000, 1_970_000, 30)
attendre('base plafonnée = min(24 000 ; 20 000)', r.basePlafonnee, 20_000)
attendre('excédent (reportable 5 exercices)', r.excedent, 4_000)
attendre('réduction_IS = 60 % × 20 000', r.reductionIS, 12_000)
attendre('facture_Mana = 30 % × 12 000', r.factureMana, 3_600)
attendre('gain_net_client = 12 000 − 3 600', r.gainNetClient, 8_400)
attendre('avantage réel = 35 % × 20 000 − 75 % × 3 600', r.avantageReel, 4_300)

console.log('\n— Exemple 3 : plafond au CA élevé (CA 5 M€) —')
attendre('plafond = max(20 000 ; 0,5 % × 5 000 000)', plafondAnnuel(5_000_000), 25_000)

console.log('\n— Exemple 4 : simulateur public (CA 2 M€, marge 30 %, démarque 3 %, donnable 50 %) —')
const s = simuler(2_000_000, 30, 3, 50, 30)
attendre('démarque PV = 2 000 000 × 3 %', s.demarquePV, 60_000)
attendre('donnable PV = 60 000 × 50 %', s.donnablePV, 30_000)
attendre('base = 30 000 × (1 − 30 %)', s.baseBrute, 21_000)
attendre('base retenue (plafond 20 000)', s.basePlafonnee, 20_000)
attendre('excédent reportable', s.excedent, 1_000)
attendre('réduction_IS = 60 % × 20 000', s.reductionIS, 12_000)
attendre('gain net = 12 000 − 30 %', s.gainNetClient, 8_400)

console.log('\n— Exemple 5 : facturation au succès avec arrêt au plafond (complément de spec §1) —')
// Société à 6 M€ de CA (plafond 30 000 €), 2 800 € de base documentée par mois
const plafond6M = plafondAnnuel(6_000_000)
attendre('plafond = max(20 000 ; 0,5 % × 6 000 000)', plafond6M, 30_000)
const commissionPct = tauxCommissionPct(30) // 30 % de la réduction de 60 % = 18 % de la base
if (commissionPct !== 18) {
  echecs++
  console.log(`✗ taux de commission attendu 18 %, obtenu ${commissionPct} %`)
} else {
  console.log('✓ taux de commission = 30 % × 60 % = 18 % de la base')
}
const basesMensuelles: [string, number][] = Array.from({ length: 12 }, (_, i) => [
  `2026-${String(i + 1).padStart(2, '0')}`,
  2_800,
])
const lignes = derouleFacturation(basesMensuelles, plafond6M, commissionPct)
for (let m = 0; m < 10; m++) attendre(`facture du mois ${m + 1} : 18 % × 2 800`, lignes[m].montantHT, 504)
attendre('facture du mois 11 (proratisée au plafond) : 18 % × 2 000', lignes[10].montantHT, 360)
attendre('facture du mois 12 (plafond atteint → arrêt)', lignes[11].montantHT, 0)
const totalFacture = lignes.reduce((t, l) => t + l.montantHT, 0)
attendre('total facturé sur l’exercice = 18 % × 30 000', totalFacture, 5_400)


// ---------------------------------------------------------------------------
// Excédents reportables (art. 238 bis) : imputation après les dons de l'année,
// dans la limite du plafond, au plus ancien d'abord, expiration à origine + 5.
// ---------------------------------------------------------------------------
{
  const societe = {
    id: 'S', raisonSociale: 'TEST', siren: '000000000', caHT: 1_000_000, margePct: 30, successFeePct: 30,
    verification: { apiStatut: 'non_verifie' as const }, creeLe: '',
  }
  const magasin = { id: 'M', societeId: 'S', nom: 'M', coutKgFL: 1, collecteurs: [], creeLe: '', versionsParametres: [] }
  // Une saisie par an, base = pvEmballes × (1 − 0) avec marge 0 → base = pv
  const saisie = (an: number, pv: number) => ({
    id: `s${an}`, magasinId: 'M', semaine: `${an}-W10`, type: 'don' as const, pvEmballes: pv, kgFL: 0,
    justificatifs: [], horodatage: '', margePctAppliquee: 0, coutKgFLApplique: 1,
  })
  const etat = (saisies: ReturnType<typeof saisie>[]) => ({
    schema: 2 as const, societes: [societe], magasins: [magasin], saisies, factures: [], clotures: [],
  })
  // 2024 : 26 000 (plafond 20 000) → excédent 6 000. 2025 : 15 000 → marge 5 000, on impute 5 000. 2026 : 21 000 → excédent 1 000, solde 2024 = 1 000.
  const e = etat([saisie(2024, 26_000), saisie(2025, 15_000), saisie(2026, 21_000)])
  const r24 = suiviReports(e as never, societe as never, 2024)
  const r25 = suiviReports(e as never, societe as never, 2025)
  const r26 = suiviReports(e as never, societe as never, 2026)
  attendre('2024 : excédent né', r24.nouvelExcedent, 6000)
  attendre('2025 : imputé sur la marge sous plafond (20 000 − 15 000)', r25.imputeCetExercice, 5000)
  attendre('2025 : solde 2024 restant', r25.soldesFin[0]?.solde ?? -1, 1000)
  attendre('2026 : rien d’imputable (dons ≥ plafond)', r26.imputeCetExercice, 0)
  attendre('2026 : nouvel excédent', r26.nouvelExcedent, 1000)
  attendre('2026 : deux origines en stock', r26.soldesFin.length, 2)
  attendre('2026 : le solde 2024 expire fin 2029', r26.soldesFin[0]?.expire ?? -1, 2029)
  // Imputation immédiate dès qu'une année laisse de la place sous le plafond
  const e2 = etat([saisie(2020, 30_000), saisie(2021, 12_000)])
  attendre('2021 : l’excédent 2020 (10 000) s’impute sur la marge 2021 (8 000)', suiviReports(e2 as never, societe as never, 2021).imputeCetExercice, 8000)
  attendre('2021 : solde 2020 restant', suiviReports(e2 as never, societe as never, 2021).soldesFin[0]?.solde ?? -1, 2000)
  // Expiration : plafond saturé chaque année de 2021 à 2025, l'excédent 2020 périme fin 2025
  const e3 = etat([saisie(2020, 30_000), ...[2021, 2022, 2023, 2024, 2025].map((an) => saisie(an, 20_000)), saisie(2026, 10_000)])
  attendre('2025 : excédent 2020 toujours en stock (jamais de place)', suiviReports(e3 as never, societe as never, 2025).soldesFin.length, 1)
  attendre('2026 : excédent 2020 périmé — 10 000 de place, rien d’imputé', suiviReports(e3 as never, societe as never, 2026).imputeCetExercice, 0)
  attendre('2026 : stock vide', suiviReports(e3 as never, societe as never, 2026).soldesFin.length, 0)
}


// ---------------------------------------------------------------------------
// Relevés de démarque : semaines d'un mois et répartition au prorata des passages
// ---------------------------------------------------------------------------
{
  const sept = semainesDuMois('2026-09')
  attendre('septembre 2026 : nombre de semaines (jeudi dans le mois)', sept.length, 4)
  attendre('septembre 2026 : commence en S36 (jeudi 3/09)', Number(sept[0].slice(-2)), 36)
  attendre('septembre 2026 : finit en S39 (jeudi 24/09 ; S40 a son jeudi le 1er octobre)', Number(sept[sept.length - 1].slice(-2)), 39)

  // 1 000 € sur deux semaines, 3 bordereaux en S36 et 1 en S37 → 750 / 250
  const parts = repartirReleve(1000, ['2026-W36', '2026-W37'], [
    { semaine: '2026-W36', collecteur: 'A' }, { semaine: '2026-W36', collecteur: 'A' }, { semaine: '2026-W36', collecteur: 'A' },
    { semaine: '2026-W37', collecteur: 'A' },
  ], ['A'])
  attendre('prorata : part de S36', parts.find((p) => p.semaine === '2026-W36')!.montant, 750)
  attendre('prorata : part de S37', parts.find((p) => p.semaine === '2026-W37')!.montant, 250)
  // Deux associations la même semaine : 2 passages A, 1 passage B → 2/3, 1/3
  const p2 = repartirReleve(100, ['2026-W36'], [
    { semaine: '2026-W36', collecteur: 'A' }, { semaine: '2026-W36', collecteur: 'A' }, { semaine: '2026-W36', collecteur: 'B' },
  ], ['A', 'B'])
  attendre('deux associations : part A', p2.find((p) => p.collecteur === 'A')!.montant, 66.67)
  attendre('deux associations : part B (reçoit l’arrondi)', p2.find((p) => p.collecteur === 'B')!.montant, 33.33)
  attendre('la somme des parts est exacte', p2.reduce((t, p) => t + p.montant, 0), 100)
  // Sans bordereau : réparti à parts égales
  const p3 = repartirReleve(300, ['2026-W36', '2026-W37', '2026-W38'], [], ['A'])
  attendre('sans bordereau : parts égales', p3[1].montant, 100)
  attendre('sans bordereau : association unique reprise', p3[0].collecteur === 'A' ? 1 : 0, 1)
}


// ---------------------------------------------------------------------------
// Relevés à dates libres et normalisation HT / TTC / prix d'achat
// ---------------------------------------------------------------------------
{
  attendre('joursEntre : du 10 au 16 septembre = 7 jours', joursEntre('2026-09-10', '2026-09-16').length, 7)
  // 700 € du jeudi 10 au mercredi 16 sans bordereau : S37 a 4 jours (10-13), S38 en a 3 (14-16)
  const p = repartirRelevePeriode(700, '2026-09-10', '2026-09-16', [], ['A'])
  attendre('période à cheval : part S37 (4 jours sur 7)', p.find((x) => x.semaine === '2026-W37')!.montant, 400)
  attendre('période à cheval : part S38 (3 jours sur 7)', p.find((x) => x.semaine === '2026-W38')!.montant, 300)
  // Avec bordereaux : seuls les passages comptent (2 en S37, 1 en S38)
  const p2 = repartirRelevePeriode(900, '2026-09-10', '2026-09-16', [
    { jour: '2026-09-10', collecteur: 'A' }, { jour: '2026-09-12', collecteur: 'A' }, { jour: '2026-09-15', collecteur: 'A' },
    { jour: '2026-09-20', collecteur: 'A' }, // hors période : ignoré
  ], ['A'])
  attendre('prorata des bordereaux : S37', p2.find((x) => x.semaine === '2026-W37')!.montant, 600)
  attendre('prorata des bordereaux : S38', p2.find((x) => x.semaine === '2026-W38')!.montant, 300)
  // Normalisation (marge 30 %, TVA 5,5 %)
  attendre('PV HT : inchangé', normaliserEnPVHT(1000, 'pv_ht', 30), 1000)
  attendre('PV TTC 1 055 → PV HT 1 000', normaliserEnPVHT(1055, 'pv_ttc', 30), 1000)
  attendre('prix d’achat HT 700 → PV HT 1 000 (÷ 0,7)', normaliserEnPVHT(700, 'pa_ht', 30), 1000)
  attendre('prix d’achat TTC 738,50 → PV HT 1 000', normaliserEnPVHT(738.5, 'pa_ttc', 30), 1000)
  attendre('cohérence : coût = PV HT × (1 − marge) redonne le prix d’achat saisi', normaliserEnPVHT(700, 'pa_ht', 30) * 0.7, 700)
}



// ---------- Règle de verdict d'éligibilité ----------
{
  const { verdictDepuisCriteres } = await import('../src/lib/eligibilite.ts')
  const base = { declarationPrefecture: 'oui', gestionDesinteressee: 'oui', activiteNonLucrative: 'oui', cercleRestreint: 'non', devolutionBoni: 'oui', objetEligible: 'oui', rescritPositif: 'inconnu', dateRescrit: '', habilitationAideAlimentaire: 'inconnu', reseauNational: 'inconnu', gratuiteBeneficiaires: 'inconnu' } as const
  const cas: [string, Record<string, string>, string][] = [
    ['statuts parfaits sans rescrit → à sécuriser', {}, 'a_securiser'],
    ['rescrit positif → validée', { rescritPositif: 'oui', dateRescrit: '2026-03-01' }, 'validee'],
    ['réseau national → validée', { reseauNational: 'oui' }, 'validee'],
    ['cercle restreint → refus', { cercleRestreint: 'oui' }, 'refus'],
    ['gestion intéressée → refus, même avec réseau', { gestionDesinteressee: 'non', reseauNational: 'oui' }, 'refus'],
    ['rescrit négatif → refus', { rescritPositif: 'non' }, 'refus'],
    ['revente au prix du marché → refus', { gratuiteBeneficiaires: 'non' }, 'refus'],
    ['rien de lu → à sécuriser', { declarationPrefecture: 'inconnu', gestionDesinteressee: 'inconnu', activiteNonLucrative: 'inconnu', cercleRestreint: 'inconnu', devolutionBoni: 'inconnu', objetEligible: 'inconnu' }, 'a_securiser'],
  ]
  for (const [nom, patch, attendu] of cas) {
    const r = verdictDepuisCriteres({ ...base, ...patch } as never)
    const ok = r.verdict === attendu
    console.log(`${ok ? '✓' : '✗'} verdict : ${nom} : ${r.verdict} (attendu ${attendu})`)
    if (!ok) process.exitCode = 1
  }
}

// ---------- Profils de bordereau : valorisation des pesées ----------
{
  const { coutPesee, profilDeMagasin } = await import('../src/lib/bordereau.ts')
  const { baseDeLaSaisie } = await import('../src/lib/selectors.ts')
  const base = { id: 'x', magasinId: 'm', semaine: '2026-W38', type: 'don' as const, pvEmballes: 1000, kgFL: 10, justificatifs: [], horodatage: '', margePctAppliquee: 30, coutKgFLApplique: 2 }
  const cas: [string, number, number][] = [
    ['ancienne ligne : 1000 × 0,7 + 10 kg × 2 €', baseDeLaSaisie(base), 720],
    ['tout scanné : coutPeseeApplique = 0 → 700', baseDeLaSaisie({ ...base, coutPeseeApplique: 0, poids: { fl: 10, pain: 3 } }), 700],
    ['vrac pesé : 10 kg F&L × 2,2 + 3 kg pain × 2,5 = 29,5', coutPesee({ fl: 10, pain: 3 }, { colis: true, categories: [{ id: 'fl', libelle: 'F&L', valorisation: 'cout_kg', coutKg: 2.2 }, { id: 'pain', libelle: 'Pain', valorisation: 'cout_kg', coutKg: 2.5 }, { id: 'autres', libelle: 'Autres', valorisation: 'releve' }] }), 29.5],
    ['profil dérivé (modeFL inclus) : F&L au relevé', profilDeMagasin({ id: 'm', societeId: 's', nom: 'x', coutKgFL: 2, modeFL: 'inclus', collecteurs: [], creeLe: '', versionsParametres: [] }).categories[0].valorisation === 'releve' ? 1 : 0, 1],
    ['profil dérivé (modeFL poids) : F&L au kilo, 2 €', profilDeMagasin({ id: 'm', societeId: 's', nom: 'x', coutKgFL: 2, modeFL: 'poids', collecteurs: [], creeLe: '', versionsParametres: [] }).categories[0].coutKg ?? 0, 2],
  ]
  for (const [nom, obtenu, attendu] of cas) {
    const ok = Math.abs(obtenu - attendu) < 0.005
    console.log(`${ok ? '✓' : '✗'} bordereau : ${nom} : ${obtenu} (attendu ${attendu})`)
    if (!ok) process.exitCode = 1
  }
}

console.log(echecs === 0 ? '\nToutes les vérifications passent.' : `\n${echecs} vérification(s) en échec !`)
process.exit(echecs === 0 && !process.exitCode ? 0 : 1)
