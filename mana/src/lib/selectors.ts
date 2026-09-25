import type { AppState, Facture, Magasin, Saisie, Societe } from '../types.ts'
import {
  baseDeLaSaisie,
  baseSemaine,
  co2Evite,
  coutEmballes,
  coutFL,
  kgDetournes,
  plafondAnnuel,
  PV_MOYEN_EMBALLES_PAR_KG,
  repasSauves,
  resultatAnnuel,
  TAUX_REDUCTION,
  type ResultatAnnuel,
} from './calc.ts'
import { compareWeekIds, mondayOfWeek, parseWeekId, weeksInYear } from './iso.ts'
import {
  depasseSeuilAlerte,
  derouleFacturation,
  libelleMois,
  moisDeLaSemaine,
  moisEchus,
  montantsFacture,
  prochainNumero,
  tauxCommissionPct,
  SEUIL_ALERTE_CA,
  type LigneFacturation,
} from './facturation.ts'
import { fmtEUR } from './format.ts'
import { suiviReports, type SuiviReports } from './reports.ts'
import { uid } from './storage.ts'

export function saisiesDuMagasin(state: AppState, magasinId: string, exercice: number): Saisie[] {
  return state.saisies
    .filter((s) => s.magasinId === magasinId && parseWeekId(s.semaine).year === exercice)
    .sort((a, b) => compareWeekIds(a.semaine, b.semaine))
}

export { baseDeLaSaisie }

export interface Projection {
  /** Rythme hebdomadaire moyen des 4 dernières semaines saisies (base €/semaine). */
  rythmeHebdo: number
  semainesRestantes: number
  baseProjetee: number
  resultatProjete: ResultatAnnuel
}

export interface AggSociete {
  societe: Societe
  magasins: Magasin[]
  saisies: Saisie[]
  baseBrute: number
  resultat: ResultatAnnuel
  kgFL: number
  kgTotal: number
  repas: number
  co2: number
  projection: Projection | null
  /** Factures de l'exercice (commissions, compléments, avoirs). */
  factures: Facture[]
  baseFacturee: number
  commissionsHT: number
  plafondAtteint: boolean
  /** Garde-fou : base cumulée > 2,5 % du CA déclaré. */
  alerteCA: boolean
  /** Saisies au-delà du seuil de 2,5 % (marquées au registre). */
  saisiesEnAlerte: Set<string>
  /** Date estimée d'atteinte du plafond au rythme actuel (null si atteint ou hors de portée). */
  datePlafondEstimee: Date | null
  /** Excédents reportables (art. 238 bis) : stock, imputation et soldes. */
  reports: SuiviReports
  /** Base ouvrant droit à réduction sur l'exercice : plafonnée de l'année + reports antérieurs imputés. */
  baseRetenueTotale: number
  reductionISTotale: number
  /** Semaines qui ont des bordereaux (preuve) mais aucun relevé (valeur) : le bilan y est incomplet. */
  semainesSansReleve: SemaineSansReleve[]
  /** Ce que ces semaines vaudraient, en attendant le relevé — jamais facturé, seulement affiché. */
  estimationAttente: EstimationAttente
}

export interface SemaineSansReleve {
  magasinId: string
  magasinNom: string
  semaine: string
  nbBordereaux: number
}

export interface EstimationAttente {
  /** Prix de vente HT estimé des semaines sans relevé. */
  pvHT: number
  /** Base (coût de revient) estimée. */
  base: number
  /** Commission Mana qui en découlerait. */
  commission: number
  nbSemaines: number
  nbBordereaux: number
  /** D'où vient le ratio : historique du magasin, estimation du gisement, ou rien. */
  methode: 'historique' | 'gisement' | 'aucune'
  /** PV HT moyen retenu par bordereau. */
  parBordereau: number
}

/**
 * Semaines avec bordereaux sans relevé, et estimation de ce qu'elles vaudraient.
 * Ratio : PV HT du relevé par bordereau, sur les semaines où le magasin a les
 * deux ; à défaut, gisement estimé (kg/jour) × prix de vente moyen au kilo.
 */
function attenteDeReleve(magasins: Magasin[], saisies: Saisie[], margePct: number, successFeePct: number): { semainesSansReleve: SemaineSansReleve[]; estimationAttente: EstimationAttente } {
  const semainesSansReleve: SemaineSansReleve[] = []
  let pvHT = 0
  let nbBordereaux = 0
  let methode: EstimationAttente['methode'] = 'aucune'
  let parBordereauRetenu = 0
  for (const m of magasins) {
    const lignes = saisies.filter((x) => x.magasinId === m.id && x.type === 'don')
    const parSemaine = new Map<string, { bordereaux: number; releve: number; aReleve: boolean }>()
    for (const x of lignes) {
      const e = parSemaine.get(x.semaine) ?? { bordereaux: 0, releve: 0, aReleve: false }
      if (x.origine === 'bordereau') e.bordereaux += 1
      else {
        e.aReleve = true
        e.releve += x.pvEmballes
      }
      parSemaine.set(x.semaine, e)
    }
    // Ratio historique : semaines complètes (bordereaux + relevé)
    let pvHist = 0
    let nbHist = 0
    for (const e of parSemaine.values()) if (e.aReleve && e.bordereaux > 0) {
      pvHist += e.releve
      nbHist += e.bordereaux
    }
    let parBordereau = 0
    if (nbHist > 0 && pvHist > 0) {
      parBordereau = pvHist / nbHist
      methode = 'historique'
    } else if ((m.miseEnPlace?.gisementKgJour ?? 0) > 0) {
      parBordereau = (m.miseEnPlace!.gisementKgJour as number) * PV_MOYEN_EMBALLES_PAR_KG
      if (methode !== 'historique') methode = 'gisement'
    }
    for (const [semaine, e] of parSemaine) if (e.bordereaux > 0 && !e.aReleve) {
      semainesSansReleve.push({ magasinId: m.id, magasinNom: m.nom, semaine, nbBordereaux: e.bordereaux })
      nbBordereaux += e.bordereaux
      pvHT += e.bordereaux * parBordereau
      parBordereauRetenu = parBordereau
    }
  }
  semainesSansReleve.sort((a, b) => compareWeekIds(a.semaine, b.semaine))
  const base = coutEmballes(pvHT, margePct)
  const commission = (successFeePct / 100) * TAUX_REDUCTION * base
  return {
    semainesSansReleve,
    estimationAttente: { pvHT, base, commission, nbSemaines: new Set(semainesSansReleve.map((x) => `${x.magasinId}|${x.semaine}`)).size, nbBordereaux, methode: semainesSansReleve.length ? methode : 'aucune', parBordereau: parBordereauRetenu },
  }
}


/** Agrégats par société — plafond fiscal, facturation et vérification s'apprécient PAR SOCIÉTÉ. */
export function aggParSociete(state: AppState, exercice: number): AggSociete[] {
  return state.societes.map((societe) => {
    const magasins = state.magasins.filter((m) => m.societeId === societe.id)
    const ids = new Set(magasins.map((m) => m.id))
    const saisies = state.saisies
      .filter((s) => ids.has(s.magasinId) && parseWeekId(s.semaine).year === exercice)
      .sort((a, b) => compareWeekIds(a.semaine, b.semaine))

    const baseBrute = saisies.reduce((t, s) => t + baseDeLaSaisie(s), 0)
    const resultat = resultatAnnuel(baseBrute, societe.caHT, societe.successFeePct)

    const kgFL = saisies.reduce((t, s) => t + s.kgFL, 0)
    const kgTotal = saisies.reduce((t, s) => t + kgDetournes(s.pvEmballes, s.kgFL), 0)

    const factures = state.factures
      .filter((f) => f.societeId === societe.id && f.exercice === exercice)
      .sort((a, b) => a.numero.localeCompare(b.numero))
    const baseFacturee = factures.reduce((t, f) => t + f.baseFacturable, 0)
    const commissionsHT = factures.reduce((t, f) => t + f.montantHT, 0)

    const projection = calcProjection(saisies, baseBrute, societe, exercice)
    const plafondAtteint = baseBrute >= resultat.plafond - 0.005

    // Garde-fou 2,5 % : marque toutes les saisies à partir du franchissement du seuil
    const alerteCA = depasseSeuilAlerte(baseBrute, societe.caHT)
    const saisiesEnAlerte = new Set<string>()
    let cumul = 0
    for (const s of saisies) {
      cumul += baseDeLaSaisie(s)
      if (cumul > SEUIL_ALERTE_CA * societe.caHT) saisiesEnAlerte.add(s.id)
    }

    let datePlafondEstimee: Date | null = null
    if (!plafondAtteint && projection && projection.rythmeHebdo > 0 && projection.baseProjetee >= resultat.plafond) {
      const semainesNecessaires = Math.ceil((resultat.plafond - baseBrute) / projection.rythmeHebdo)
      const derniereSemaine = saisies[saisies.length - 1].semaine
      const d = mondayOfWeek(derniereSemaine)
      d.setUTCDate(d.getUTCDate() + semainesNecessaires * 7 + 6)
      datePlafondEstimee = d
    }

    const reports = suiviReports(state, societe, exercice)
    const baseRetenueTotale = resultat.basePlafonnee + reports.imputeCetExercice
    const reductionISTotale = TAUX_REDUCTION * baseRetenueTotale
    const { semainesSansReleve, estimationAttente } = attenteDeReleve(magasins, saisies, societe.margePct, societe.successFeePct)

    return {
      semainesSansReleve,
      estimationAttente,
      societe,
      magasins,
      saisies,
      baseBrute,
      resultat,
      reports,
      baseRetenueTotale,
      reductionISTotale,
      kgFL,
      kgTotal,
      repas: repasSauves(kgTotal),
      co2: co2Evite(kgTotal),
      projection,
      factures,
      baseFacturee,
      commissionsHT,
      plafondAtteint,
      alerteCA,
      saisiesEnAlerte,
      datePlafondEstimee,
    }
  })
}

/** Projection fin d'année : extrapolation sur le rythme des 4 dernières semaines saisies. */
function calcProjection(saisies: Saisie[], baseBrute: number, societe: Societe, exercice: number): Projection | null {
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
    resultatProjete: resultatAnnuel(baseProjetee, societe.caHT, societe.successFeePct),
  }
}

/** Bases mensuelles d'une société (semaine rattachée au mois de son jeudi), triées. */
export function basesMensuelles(saisies: Saisie[]): [string, number][] {
  const parMois = new Map<string, number>()
  for (const s of saisies) {
    const mois = moisDeLaSemaine(s.semaine)
    parMois.set(mois, (parMois.get(mois) ?? 0) + baseDeLaSaisie(s))
  }
  return [...parMois.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/** Déroulé de facturation de l'exercice pour affichage (mois par mois). */
export function lignesFacturationSociete(agg: AggSociete): LigneFacturation[] {
  return derouleFacturation(basesMensuelles(agg.saisies), agg.resultat.plafond, tauxCommissionPct(agg.societe.successFeePct))
}

/**
 * Factures de commission à émettre : mois échus, non encore facturés, montant non nul.
 * Retourne les factures prêtes à ajouter à l'état (numérotées à la suite).
 */
export function facturesCommissionManquantes(
  agg: AggSociete,
  exercice: number,
  aujourdhui: Date,
  numerosExistants: string[],
): Facture[] {
  const commissionPct = tauxCommissionPct(agg.societe.successFeePct)
  const lignes = lignesFacturationSociete(agg)
  const echus = new Set(moisEchus(exercice, aujourdhui))
  const dejaFacturees = new Set(agg.factures.filter((f) => f.periode.length === 7).map((f) => f.periode))
  const nouvelles: Facture[] = []
  const numeros = [...numerosExistants]

  for (const l of lignes) {
    if (!echus.has(l.mois) || dejaFacturees.has(l.mois) || Math.abs(l.montantHT) < 0.01) continue
    const numero = prochainNumero(numeros, exercice)
    numeros.push(numero)
    const { montantTVA, montantTTC } = montantsFacture(l.montantHT)
    const plafonnee = Math.abs(l.baseFacturable - l.baseDuMois) > 0.005
    const detail = [
      `Base des dons documentés de ${libelleMois(l.mois)} : ${fmtEUR(l.baseDuMois, 2)}`,
      `Base cumulée de l'exercice : ${fmtEUR(l.cumulBase, 2)} — plafond de la société : ${fmtEUR(agg.resultat.plafond)}`,
      ...(plafonnee
        ? [`Base facturable : min(cumul ; plafond) − déjà facturé (${fmtEUR(l.cumulFactureAvant, 2)}) = ${fmtEUR(l.baseFacturable, 2)}`]
        : []),
      `Commission ${commissionPct.toLocaleString('fr-FR')} % × ${fmtEUR(l.baseFacturable, 2)} = ${fmtEUR(l.montantHT, 2)} HT`,
      // Facture consolidée : la répartition par magasin, pour le DAF d'un réseau.
      ...(agg.magasins.length > 1
        ? agg.magasins
            .map((m) => [m.nom, agg.saisies.filter((s) => s.magasinId === m.id && moisDeLaSemaine(s.semaine) === l.mois).reduce((t, s) => t + baseDeLaSaisie(s), 0)] as const)
            .filter(([, base]) => Math.abs(base) >= 0.005)
            .sort((a, b) => b[1] - a[1])
            .map(([nom, base]) => `dont ${nom} : ${fmtEUR(base, 2)} de dons documentés`)
        : []),
    ]
    nouvelles.push({
      id: uid(),
      numero,
      societeId: agg.societe.id,
      exercice,
      periode: l.mois,
      type: l.montantHT >= 0 ? 'commission' : 'avoir',
      libelle:
        l.montantHT >= 0
          ? `Commission Mana — ${commissionPct.toLocaleString('fr-FR')} % de la valeur des dons documentés du mois de ${libelleMois(l.mois)}`
          : `Avoir Mana — régularisation des dons de ${libelleMois(l.mois)} (dons refusés / corrections)`,
      baseFacturable: l.baseFacturable,
      tauxCommissionPct: commissionPct,
      montantHT: l.montantHT,
      tauxTVAPct: 20,
      montantTVA,
      montantTTC,
      emiseLe: aujourdhui.toISOString(),
      detail,
    })
  }
  return nouvelles
}

export interface ResultatCloture {
  baseRecalculee: number
  plafondReel: number
  baseRetenueReelle: number
  commissionDueHT: number
  dejaFactureHT: number
  /** Positif → facture complémentaire ; négatif → avoir. */
  deltaHT: number
  detail: string[]
}

/**
 * Clôture d'exercice (complément §3) : à réception de la liasse définitive,
 * recalcule la base avec la marge réelle, le plafond avec le CA réel,
 * et compare la commission due au total déjà facturé.
 */
export function calculerCloture(agg: AggSociete, caReel: number, margeReellePct: number): ResultatCloture {
  const commissionPct = tauxCommissionPct(agg.societe.successFeePct)
  const baseRecalculee = agg.saisies.reduce(
    (t, s) => t + coutEmballes(s.pvEmballes, margeReellePct) + coutFL(s.kgFL, s.coutKgFLApplique),
    0,
  )
  const plafondReel = plafondAnnuel(caReel)
  const baseRetenueReelle = Math.min(baseRecalculee, plafondReel)
  const commissionDueHT = Math.round(baseRetenueReelle * commissionPct) / 100
  const dejaFactureHT = agg.commissionsHT
  const deltaHT = Math.round((commissionDueHT - dejaFactureHT) * 100) / 100
  const detail = [
    `Base recalculée avec la marge réelle (${margeReellePct.toLocaleString('fr-FR')} %) : ${fmtEUR(baseRecalculee, 2)}`,
    `Plafond réel : max(20 000 € ; 0,5 % × ${fmtEUR(caReel)}) = ${fmtEUR(plafondReel)}`,
    `Base retenue : min(${fmtEUR(baseRecalculee, 2)} ; ${fmtEUR(plafondReel)}) = ${fmtEUR(baseRetenueReelle, 2)}`,
    `Commission due : ${commissionPct.toLocaleString('fr-FR')} % × ${fmtEUR(baseRetenueReelle, 2)} = ${fmtEUR(commissionDueHT, 2)} HT`,
    `Déjà facturé sur l'exercice : ${fmtEUR(dejaFactureHT, 2)} HT`,
    deltaHT >= 0
      ? `= Facture complémentaire de ${fmtEUR(deltaHT, 2)} HT`
      : `= Avoir de ${fmtEUR(-deltaHT, 2)} HT`,
  ]
  return { baseRecalculee, plafondReel, baseRetenueReelle, commissionDueHT, dejaFactureHT, deltaHT, detail }
}
