/**
 * Moteur de calcul Mana — section 4.3 de la spécification.
 * Toutes les fonctions sont pures : mêmes entrées → mêmes sorties.
 */

/** Taux de la réduction d'impôt (article 238 bis du CGI) — fixe. */
export const TAUX_REDUCTION = 0.6
/** Plancher du plafond annuel de dons (€). */
export const PLAFOND_FIXE = 20_000
/** Alternative : 0,5 % du CA HT. */
export const TAUX_PLAFOND_CA = 0.005
/** Équivalence impact : ~500 g par repas. */
export const KG_PAR_REPAS = 0.5
/** Équivalence impact : ~2,5 kg CO₂e évités par kg alimentaire détourné. */
export const CO2_PAR_KG = 2.5
/**
 * Hypothèse d'estimation du poids des produits emballés à partir de leur prix
 * de vente (pour les compteurs d'impact uniquement — jamais pour le calcul fiscal).
 */
export const PV_MOYEN_EMBALLES_PAR_KG = 7.5

/** coût_emballés = PV_semaine × (1 − marge) */
export function coutEmballes(pvSemaine: number, margePct: number): number {
  return pvSemaine * (1 - margePct / 100)
}

/** coût_FL = kg × coût_kg */
export function coutFL(kg: number, coutKg: number): number {
  return kg * coutKg
}

/** base_semaine = coût_emballés + coût_FL */
export function baseSemaine(pvSemaine: number, margePct: number, kg: number, coutKg: number): number {
  return coutEmballes(pvSemaine, margePct) + coutFL(kg, coutKg)
}

/** Plafond annuel de dons : max(20 000 € ; 0,5 % × CA HT). Le plafond s'apprécie PAR SOCIÉTÉ. */
export function plafondAnnuel(caHT: number): number {
  return Math.max(PLAFOND_FIXE, TAUX_PLAFOND_CA * caHT)
}

export interface ResultatAnnuel {
  baseBrute: number
  plafond: number
  basePlafonnee: number
  /** Excédent au-delà du plafond — reportable sur les 5 exercices suivants. */
  excedent: number
  reductionIS: number
  factureMana: number
  gainNetClient: number
}

/**
 * Résultat annuel à partir de la base brute cumulée (Σ base_semaine de l'exercice),
 * du CA HT de la société et du taux de success fee.
 */
export function resultatAnnuel(baseBrute: number, caHT: number, successFeePct: number): ResultatAnnuel {
  const plafond = plafondAnnuel(caHT)
  const basePlafonnee = Math.min(baseBrute, plafond)
  const excedent = Math.max(0, baseBrute - plafond)
  const reductionIS = TAUX_REDUCTION * basePlafonnee
  const factureMana = (successFeePct / 100) * reductionIS
  const gainNetClient = reductionIS - factureMana
  return { baseBrute, plafond, basePlafonnee, excedent, reductionIS, factureMana, gainNetClient }
}

/** Kg détournés de la poubelle : kg F&L réels + estimation des emballés (hypothèse PV moyen). */
export function kgDetournes(pvEmballes: number, kgFL: number): number {
  return kgFL + pvEmballes / PV_MOYEN_EMBALLES_PAR_KG
}

/** Équivalent repas sauvés (base ~500 g/repas). */
export function repasSauves(kg: number): number {
  return kg / KG_PAR_REPAS
}

/** Kg de CO₂e évités (~2,5 kg CO₂e/kg alimentaire). */
export function co2Evite(kg: number): number {
  return kg * CO2_PAR_KG
}

export interface ResultatSimulateur {
  demarquePV: number
  donnablePV: number
  baseBrute: number
  plafond: number
  basePlafonnee: number
  excedent: number
  reductionIS: number
  factureMana: number
  gainNetClient: number
}

/**
 * Simulateur public (section 4.6) : CA HT, marge brute, % de démarque, part donnable.
 * Le simulateur ne connaît pas le détail F&L / emballés : tout est valorisé au
 * coefficient de marge (méthode prudente et lisible pour la démo).
 */
export function simuler(
  caHT: number,
  margePct: number,
  demarquePct: number,
  partDonnablePct: number,
  successFeePct: number,
): ResultatSimulateur {
  const demarquePV = caHT * (demarquePct / 100)
  const donnablePV = demarquePV * (partDonnablePct / 100)
  const baseBrute = donnablePV * (1 - margePct / 100)
  const r = resultatAnnuel(baseBrute, caHT, successFeePct)
  return { demarquePV, donnablePV, ...r }
}
