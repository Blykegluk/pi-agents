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
