/**
 * Facturation mensuelle au succès (complément de spec §1 et §3).
 * Fonctions pures — testées par scripts/verify-calc.ts.
 *
 * Règle centrale : à la fin de chaque mois, la base facturable est
 *   min(base cumulée de l'exercice ; plafond) − base déjà facturée.
 * Elle prend en compte le plafond (arrêt automatique, dernier mois proratisé)
 * et les corrections a posteriori (dons refusés → montant réduit, voire avoir).
 */
// Extensions .ts explicites : ce module est aussi exécuté par Node (scripts/verify-calc.ts)
import { TAUX_REDUCTION } from './calc.ts'
import { mondayOfWeek, parseWeekId } from './iso.ts'

export const TAUX_TVA_PCT = 20

/** Commission en % de la base valorisée : success fee (25 %) × taux de réduction (60 %) = 15 %. */
export function tauxCommissionPct(successFeePct: number): number {
  return successFeePct * TAUX_REDUCTION
}

/** Une semaine ISO appartient au mois de son jeudi (convention ISO 8601). */
export function moisDeLaSemaine(weekId: string): string {
  const jeudi = mondayOfWeek(weekId)
  jeudi.setUTCDate(jeudi.getUTCDate() + 3)
  return `${jeudi.getUTCFullYear()}-${String(jeudi.getUTCMonth() + 1).padStart(2, '0')}`
}

export const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export function libelleMois(periode: string): string {
  const [annee, mois] = periode.split('-').map(Number)
  return `${NOMS_MOIS[mois - 1]} ${annee}`
}

export interface LigneFacturation {
  /** 'AAAA-MM' */
  mois: string
  baseDuMois: number
  cumulBase: number
  cumulFactureAvant: number
  /** Base facturée ce mois : min(cumul ; plafond) − déjà facturé. Négative = avoir. */
  baseFacturable: number
  montantHT: number
}

/**
 * Déroule la facturation mois par mois sur une liste [mois, base] TRIÉE.
 * `montantHT` est arrondi au centime.
 */
export function derouleFacturation(
  basesParMois: [string, number][],
  plafond: number,
  commissionPct: number,
): LigneFacturation[] {
  const lignes: LigneFacturation[] = []
  let cumulBase = 0
  let cumulFacture = 0
  for (const [mois, base] of basesParMois) {
    cumulBase += base
    const facturable = Math.min(cumulBase, plafond) - cumulFacture
    const montantHT = Math.round(facturable * commissionPct) / 100
    lignes.push({ mois, baseDuMois: base, cumulBase, cumulFactureAvant: cumulFacture, baseFacturable: facturable, montantHT })
    cumulFacture += facturable
  }
  return lignes
}

/** Montants TVA/TTC d'une facture, arrondis au centime. */
export function montantsFacture(montantHT: number): { montantTVA: number; montantTTC: number } {
  const montantTVA = Math.round(montantHT * TAUX_TVA_PCT) / 100
  return { montantTVA, montantTTC: Math.round((montantHT + montantTVA) * 100) / 100 }
}

/** Prochain numéro séquentiel : MANA-AAAA-NNN (sur l'ensemble des sociétés). */
export function prochainNumero(numerosExistants: string[], annee: number): string {
  const prefixe = `MANA-${annee}-`
  const max = numerosExistants
    .filter((n) => n.startsWith(prefixe))
    .reduce((m, n) => Math.max(m, Number(n.slice(prefixe.length)) || 0), 0)
  return `${prefixe}${String(max + 1).padStart(3, '0')}`
}

/** Mois échus d'un exercice à une date donnée : 'AAAA-01' … jusqu'au dernier mois entièrement écoulé. */
export function moisEchus(exercice: number, aujourdhui: Date): string[] {
  const result: string[] = []
  for (let m = 1; m <= 12; m++) {
    const finDuMois = new Date(Date.UTC(exercice, m, 1)) // 1er jour du mois suivant
    if (finDuMois.getTime() <= aujourdhui.getTime()) {
      result.push(`${exercice}-${String(m).padStart(2, '0')}`)
    }
  }
  return result
}

/** Garde-fou anti-fraude : base cumulée > 2,5 % du CA déclaré. */
export const SEUIL_ALERTE_CA = 0.025

export function depasseSeuilAlerte(baseCumulee: number, caHT: number): boolean {
  return baseCumulee > SEUIL_ALERTE_CA * caHT
}

export { parseWeekId }
