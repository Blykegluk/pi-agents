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

console.log(echecs === 0 ? '\nToutes les vérifications passent.' : `\n${echecs} vérification(s) en échec !`)
process.exit(echecs === 0 ? 0 : 1)
