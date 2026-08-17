import type { AppState, Magasin, Saisie } from '../types'
import { baseSemaine, co2Evite, kgDetournes, repasSauves, resultatAnnuel, type ResultatAnnuel } from './calc'
import { compareWeekIds, parseWeekId, weeksInYear } from './iso'

export function saisiesDuMagasin(state: AppState, magasinId: string, exercice: number): Saisie[] {
  return state.saisies
    .filter((s) => s.magasinId === magasinId && parseWeekId(s.semaine).year === exercice)
    .sort((a, b) => compareWeekIds(a.semaine, b.semaine))
}

export function baseDeLaSaisie(s: Saisie): number {
  return baseSemaine(s.pvEmballes, s.margePctAppliquee, s.kgFL, s.coutKgFLApplique)
}

export interface Projection {
  /** Rythme hebdomadaire moyen des 4 dernières semaines saisies (base €/semaine). */
  rythmeHebdo: number
  semainesRestantes: number
  baseProjetee: number
  resultatProjete: ResultatAnnuel
}

export interface AggSociete {
  societe: string
  magasins: Magasin[]
  saisies: Saisie[]
  caHT: number
  successFeePct: number
  baseBrute: number
  resultat: ResultatAnnuel
  kgFL: number
  kgTotal: number
  repas: number
  co2: number
  projection: Projection | null
}

/** Agrégats par société — le plafond fiscal s'apprécie PAR SOCIÉTÉ. */
export function aggParSociete(state: AppState, exercice: number): AggSociete[] {
  const societes = [...new Set(state.magasins.map((m) => m.societe))]
  return societes.map((societe) => {
    const magasins = state.magasins.filter((m) => m.societe === societe)
    const ids = new Set(magasins.map((m) => m.id))
    const saisies = state.saisies
      .filter((s) => ids.has(s.magasinId) && parseWeekId(s.semaine).year === exercice)
      .sort((a, b) => compareWeekIds(a.semaine, b.semaine))

    const caHT = magasins.reduce((t, m) => t + m.caHT, 0)
    const successFeePct = magasins[0]?.successFeePct ?? 25
    const baseBrute = saisies.reduce((t, s) => t + baseDeLaSaisie(s), 0)
    const resultat = resultatAnnuel(baseBrute, caHT, successFeePct)

    const kgFL = saisies.reduce((t, s) => t + s.kgFL, 0)
    const kgTotal = saisies.reduce((t, s) => t + kgDetournes(s.pvEmballes, s.kgFL), 0)

    return {
      societe,
      magasins,
      saisies,
      caHT,
      successFeePct,
      baseBrute,
      resultat,
      kgFL,
      kgTotal,
      repas: repasSauves(kgTotal),
      co2: co2Evite(kgTotal),
      projection: calcProjection(saisies, baseBrute, caHT, successFeePct, exercice),
    }
  })
}

/** Projection fin d'année : extrapolation sur le rythme des 4 dernières semaines saisies. */
function calcProjection(
  saisies: Saisie[],
  baseBrute: number,
  caHT: number,
  successFeePct: number,
  exercice: number,
): Projection | null {
  if (saisies.length === 0) return null
  const parSemaine = new Map<string, number>()
  for (const s of saisies) {
    parSemaine.set(s.semaine, (parSemaine.get(s.semaine) ?? 0) + baseDeLaSaisie(s))
  }
  const semaines = [...parSemaine.keys()].sort(compareWeekIds)
  const dernieres = semaines.slice(-4)
  const rythmeHebdo = dernieres.reduce((t, w) => t + (parSemaine.get(w) ?? 0), 0) / dernieres.length
  const derniereSemaine = parseWeekId(semaines[semaines.length - 1]).week
  const semainesRestantes = Math.max(0, weeksInYear(exercice) - derniereSemaine)
  const baseProjetee = baseBrute + rythmeHebdo * semainesRestantes
  return {
    rythmeHebdo,
    semainesRestantes,
    baseProjetee,
    resultatProjete: resultatAnnuel(baseProjetee, caHT, successFeePct),
  }
}
