/**
 * Excédents reportables de l'article 238 bis — module pur, sans dépendance
 * navigateur, vérifié par scripts/verify-calc.ts (d'où les extensions .ts).
 */
import type { AppState, Societe } from '../types.ts'
import { baseSemaine, plafondAnnuel } from './calc.ts'
import { parseWeekId } from './iso.ts'

export interface ReportExcedent {
  /** Exercice d'origine de l'excédent. */
  origine: number
  initial: number
  impute: number
  solde: number
  /** Dernier exercice d'imputation possible (origine + 5). */
  expire: number
}

export interface SuiviReports {
  /** Stock non expiré disponible en début d'exercice, par origine. */
  disponibles: ReportExcedent[]
  imputeCetExercice: number
  nouvelExcedent: number
  /** Soldes en fin d'exercice (ce qui reste à reporter), par origine. */
  soldesFin: ReportExcedent[]
}

/**
 * Suivi des excédents reportables de l'article 238 bis : l'excédent d'un
 * exercice s'impute sur les cinq exercices suivants, dans la limite du plafond
 * de chacun et APRÈS les dons de l'exercice, au plus ancien d'abord. Le plafond
 * d'un exercice clos se calcule sur son CA réel (clôture), sinon sur le CA de
 * référence courant.
 */
export function suiviReports(state: AppState, societe: Societe, exercice: number): SuiviReports {
  const ids = new Set(state.magasins.filter((m) => m.societeId === societe.id).map((m) => m.id))
  const parAnnee = new Map<number, number>()
  for (const s of state.saisies) {
    if (!ids.has(s.magasinId)) continue
    const y = parseWeekId(s.semaine).year
    parAnnee.set(y, (parAnnee.get(y) ?? 0) + baseSemaine(s.pvEmballes, s.margePctAppliquee, s.kgFL, s.coutKgFLApplique))
  }
  const premiere = Math.min(exercice, ...parAnnee.keys())
  const caDe = (y: number) => state.clotures.find((c) => c.societeId === societe.id && c.exercice === y)?.caReel ?? societe.caHT

  let stock: ReportExcedent[] = []
  let resultat: SuiviReports = { disponibles: [], imputeCetExercice: 0, nouvelExcedent: 0, soldesFin: [] }
  for (let y = premiere; y <= exercice; y++) {
    // Les excédents périmés sortent du stock
    stock = stock.filter((r) => r.expire >= y)
    const disponibles = stock.map((r) => ({ ...r }))
    const base = parAnnee.get(y) ?? 0
    const plafond = plafondAnnuel(caDe(y))
    let marge = Math.max(0, plafond - base)
    let impute = 0
    for (const r of stock) {
      if (marge <= 0) break
      const part = Math.min(r.solde, marge)
      r.impute += part
      r.solde -= part
      marge -= part
      impute += part
    }
    const nouvel = Math.max(0, base - plafond)
    if (nouvel > 0) stock.push({ origine: y, initial: nouvel, impute: 0, solde: nouvel, expire: y + 5 })
    stock = stock.filter((r) => r.solde > 0.005)
    if (y === exercice) {
      resultat = { disponibles, imputeCetExercice: impute, nouvelExcedent: nouvel, soldesFin: stock.map((r) => ({ ...r })) }
    }
  }
  return resultat
}
