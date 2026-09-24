import type { AppState, Justificatif, Magasin, Saisie, Societe } from '../types'
import { isoWeekOf, weekId, mondayOfWeek, addWeeks, currentWeekId } from './iso'
import { aggParSociete, facturesCommissionManquantes } from './selectors'

/** Justificatif factice pour la démo (en réel : liasse 2052 ou attestation téléversée). */
function justificatifDemo(nom: string): Justificatif {
  return {
    id: `demo-pj-${nom}`,
    nom,
    type: 'application/pdf',
    taille: 18,
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJSBkZW1v',
  }
}

/**
 * Jeu de données de démonstration : 2 sociétés vérifiées (1 magasin chacune),
 * 6 semaines de saisies déjà remplies et les factures des mois échus déjà émises.
 */
export function buildDemoState(): AppState {
  const societe1: Societe = {
    id: 'demo-soc1',
    raisonSociale: 'SARL Delmas Distribution',
    siren: '842517396',
    caHT: 1_970_000,
    margePct: 33.6,
    successFeePct: 30,
    verification: {
      apiStatut: 'verifie',
      raisonSocialeAPI: 'SARL DELMAS DISTRIBUTION',
      apiVerifieLe: '2026-06-29T10:12:00.000Z',
      caVerifieLe: '2026-06-29T10:14:00.000Z',
      caSource: 'Liasse fiscale 2052 — exercice 2025',
    },
    justificatifCA: justificatifDemo('liasse-2052-2025-delmas.pdf'),
    creeLe: '2026-06-29T10:15:00.000Z',
  }

  const societe2: Societe = {
    id: 'demo-soc2',
    raisonSociale: 'SAS Riva Alimentaire',
    siren: '901284375',
    caHT: 1_680_000,
    margePct: 28.9,
    successFeePct: 30,
    verification: {
      apiStatut: 'verifie',
      raisonSocialeAPI: 'SAS RIVA ALIMENTAIRE',
      apiVerifieLe: '2026-06-30T14:38:00.000Z',
      caVerifieLe: '2026-06-30T14:39:00.000Z',
      caSource: 'Attestation de CA — cabinet Fiduciaire du Port (expert-comptable)',
    },
    justificatifCA: justificatifDemo('attestation-ca-2025-riva.pdf'),
    creeLe: '2026-06-30T14:40:00.000Z',
  }

  const magasin1: Magasin = {
    id: 'demo-m1',
    societeId: societe1.id,
    nom: 'Marché Frais Centre-Ville',
    enseigne: 'Marché Frais',
    coutKgFL: 2.2,
    collecteurs: [
      { nom: 'Banque Alimentaire du Rhône', contact: 'M. Perret — 04 78 52 11 30', jours: 'Mardi et vendredi matin' },
    ],
    creeLe: '2026-06-29T10:15:00.000Z',
    versionsParametres: [{ version: 1, date: '2026-06-29T10:15:00.000Z', margePct: 33.6, coutKgFL: 2.2 }],
  }

  const magasin2: Magasin = {
    id: 'demo-m2',
    societeId: societe2.id,
    nom: 'Épicerie du Port',
    enseigne: 'Bio&Local',
    coutKgFL: 2.2,
    collecteurs: [
      { nom: 'Restos du Cœur — antenne du Port', contact: 'Mme Salaün — 06 71 45 09 82', jours: 'Mercredi après-midi' },
    ],
    creeLe: '2026-06-30T14:40:00.000Z',
    versionsParametres: [{ version: 1, date: '2026-06-30T14:40:00.000Z', margePct: 28.9, coutKgFL: 2.2 }],
  }

  // Les 6 semaines pleines précédant la semaine courante
  const semaines: string[] = []
  for (let i = 6; i >= 1; i--) semaines.push(addWeeks(currentWeekId(), -i))

  const donneesM1 = [
    { pv: 1240, kg: 62, note: 'Bordereau Banque Alimentaire signé (2 passages)' },
    { pv: 980, kg: 48 },
    { pv: 1130, kg: 55, note: 'Semaine du 14-Juillet : fermeture mardi' },
    { pv: 1075, kg: 51 },
    { pv: 1310, kg: 68, note: 'Forte chaleur — rayon frais écoulé en don' },
    { pv: 1180, kg: 58 },
  ]
  const donneesM2 = [
    { pv: 840, kg: 34 },
    { pv: 760, kg: 29, note: 'Collecteur absent mercredi, passage reporté jeudi' },
    { pv: 905, kg: 38 },
    { pv: 690, kg: 26 },
    { pv: 820, kg: 33 },
    { pv: 875, kg: 36, note: 'Bordereau Restos du Cœur signé' },
  ]

  const saisies: Saisie[] = []
  semaines.forEach((sem, i) => {
    // Saisie enregistrée le lundi suivant la semaine concernée
    const lundiSuivant = mondayOfWeek(sem)
    lundiSuivant.setUTCDate(lundiSuivant.getUTCDate() + 7)

    const horodatageM1 = new Date(lundiSuivant)
    horodatageM1.setUTCHours(7, 42 + i * 3, 0, 0)
    saisies.push({
      id: `demo-s1-${i}`,
      magasinId: magasin1.id,
      semaine: sem,
      type: 'don',
      pvEmballes: donneesM1[i].pv,
      kgFL: donneesM1[i].kg,
      note: donneesM1[i].note,
      justificatifs: [],
      horodatage: horodatageM1.toISOString(),
      margePctAppliquee: societe1.margePct,
      coutKgFLApplique: magasin1.coutKgFL,
    })

    const horodatageM2 = new Date(lundiSuivant)
    horodatageM2.setUTCHours(9, 15 + i * 2, 0, 0)
    saisies.push({
      id: `demo-s2-${i}`,
      magasinId: magasin2.id,
      semaine: sem,
      type: 'don',
      pvEmballes: donneesM2[i].pv,
      kgFL: donneesM2[i].kg,
      note: donneesM2[i].note,
      justificatifs: [],
      horodatage: horodatageM2.toISOString(),
      margePctAppliquee: societe2.margePct,
      coutKgFLApplique: magasin2.coutKgFL,
    })
  })

  const state: AppState = {
    schema: 2,
    societes: [societe1, societe2],
    magasins: [magasin1, magasin2],
    saisies,
    factures: [],
    clotures: [],
  }

  // Factures des mois échus déjà émises (comme si l'app tournait depuis juillet)
  const exercice = isoWeekOf(new Date()).year
  const maintenant = new Date()
  for (const agg of aggParSociete(state, exercice)) {
    const nouvelles = facturesCommissionManquantes(agg, exercice, maintenant, state.factures.map((f) => f.numero))
    // Datées du 1er jour du mois suivant la période, à 8 h (facture à terme échu)
    for (const f of nouvelles) {
      const [annee, mois] = f.periode.split('-').map(Number)
      f.emiseLe = new Date(Date.UTC(annee, mois, 1, 8, 0, 0)).toISOString()
    }
    state.factures.push(...nouvelles)
  }

  return state
}

/** Exercice courant (année civile de la semaine courante). */
export function exerciceCourant(): number {
  return isoWeekOf(new Date()).year
}

export { weekId }
