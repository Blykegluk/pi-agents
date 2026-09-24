/**
 * Relevés de démarque — le montant en euros de la démarque « don », lu dans
 * l'export du back-office une fois par semaine ou par mois, à rattacher aux
 * semaines ISO du registre et, s'il y en a plusieurs, aux associations.
 *
 * Module pur (extensions .ts) : vérifié par scripts/verify-calc.ts.
 */
import { isoWeekOf, weekId } from './iso.ts'
import { moisDeLaSemaine } from './facturation.ts'

/** Semaines ISO rattachées à un mois : celles dont le jeudi tombe dans le mois (règle de facturation). */
export function semainesDuMois(mois: string): string[] {
  const [annee, m] = mois.split('-').map(Number)
  const semaines: string[] = []
  const d = new Date(Date.UTC(annee, m - 1, 1))
  // On balaie du 1er au dernier jour du mois, en retenant chaque semaine une fois
  while (d.getUTCMonth() === m - 1) {
    const w = isoWeekOf(d)
    const id = weekId(w.year, w.week)
    if (!semaines.includes(id) && moisDeLaSemaine(id) === mois) semaines.push(id)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return semaines
}

export interface BordereauResume {
  semaine: string
  collecteur: string
}

export interface PartReleve {
  semaine: string
  collecteur: string
  montant: number
}

/**
 * Répartit un montant sur des semaines (et des associations) au prorata du
 * nombre de bordereaux enregistrés — plus il y a eu de passages, plus la part
 * de démarque est grande. Sans bordereau, répartition égale entre les
 * semaines, sur l'unique association connue (ou aucune).
 * Les centimes d'arrondi vont sur la dernière part pour que la somme soit exacte.
 */
export function repartirReleve(montant: number, semaines: string[], bordereaux: BordereauResume[], collecteurs: string[]): PartReleve[] {
  if (semaines.length === 0 || montant === 0) return []
  const cle = (s: string, c: string) => `${s}|${c}`
  const poids = new Map<string, number>()
  for (const b of bordereaux) {
    if (!semaines.includes(b.semaine)) continue
    poids.set(cle(b.semaine, b.collecteur), (poids.get(cle(b.semaine, b.collecteur)) ?? 0) + 1)
  }
  let cles: string[]
  if (poids.size > 0) {
    cles = [...poids.keys()]
  } else {
    const c = collecteurs.length === 1 ? collecteurs[0] : ''
    cles = semaines.map((s) => cle(s, c))
    for (const k of cles) poids.set(k, 1)
  }
  const total = [...poids.values()].reduce((t, p) => t + p, 0)
  const parts: PartReleve[] = []
  let distribue = 0
  cles.forEach((k, i) => {
    const [semaine, collecteur] = k.split('|')
    const brut = (montant * (poids.get(k) ?? 0)) / total
    const part = i === cles.length - 1 ? Math.round((montant - distribue) * 100) / 100 : Math.round(brut * 100) / 100
    distribue += part
    parts.push({ semaine, collecteur, montant: part })
  })
  return parts
}

/** Jours (AAAA-MM-JJ) d'une période bornée incluse. */
export function joursEntre(du: string, au: string): string[] {
  const jours: string[] = []
  const d = new Date(du + 'T00:00:00Z')
  const fin = new Date(au + 'T00:00:00Z')
  while (d <= fin) {
    jours.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return jours
}

/** Semaine ISO d'un jour AAAA-MM-JJ. */
export function semaineDuJourISO(jour: string): string {
  const w = isoWeekOf(new Date(jour + 'T00:00:00Z'))
  return weekId(w.year, w.week)
}

/**
 * Répartit un relevé saisi sur une période libre (du … au, incluses) : au
 * prorata des bordereaux de la période par semaine et association ; sans
 * bordereau, au prorata du nombre de jours de la période tombant dans chaque
 * semaine. Le relevé prime toujours : les bordereaux ne servent qu'à le ventiler.
 */
export function repartirRelevePeriode(
  montant: number,
  du: string,
  au: string,
  bordereaux: { jour: string; collecteur: string }[],
  collecteurs: string[],
): PartReleve[] {
  const jours = joursEntre(du, au)
  if (jours.length === 0 || montant === 0) return []
  const dansPeriode = bordereaux.filter((b) => b.jour >= du && b.jour <= au)
  if (dansPeriode.length > 0) {
    const semaines = [...new Set(jours.map(semaineDuJourISO))]
    return repartirReleve(montant, semaines, dansPeriode.map((b) => ({ semaine: semaineDuJourISO(b.jour), collecteur: b.collecteur })), collecteurs)
  }
  // Pas de bordereau : chaque jour de la période pèse 1
  const c = collecteurs.length === 1 ? collecteurs[0] : ''
  return repartirReleve(montant, [...new Set(jours.map(semaineDuJourISO))], jours.map((j) => ({ semaine: semaineDuJourISO(j), collecteur: c })), collecteurs)
}

/** TVA sur les denrées alimentaires : 5,5 % sauf exceptions (confiserie, alcool exclu du don). */
export const TVA_ALIMENTAIRE = 5.5

/**
 * Ramène un montant saisi au PRIX DE VENTE HORS TAXES, seule grandeur que le
 * moteur de calcul manipule (coût de revient = PV HT × (1 − marge brute)).
 * - TTC → HT : ÷ (1 + TVA)
 * - prix d'achat (coût) → PV : ÷ (1 − marge), pour que PV × (1 − marge) redonne le coût saisi
 */
export function normaliserEnPVHT(montant: number, saisiEn: 'pv_ht' | 'pv_ttc' | 'pa_ht' | 'pa_ttc', margePct: number, tauxTVA = TVA_ALIMENTAIRE): number {
  let ht = montant
  if (saisiEn === 'pv_ttc' || saisiEn === 'pa_ttc') ht = montant / (1 + tauxTVA / 100)
  if (saisiEn === 'pa_ht' || saisiEn === 'pa_ttc') {
    const coef = 1 - margePct / 100
    if (coef <= 0) return 0
    ht = ht / coef
  }
  return Math.round(ht * 100) / 100
}
