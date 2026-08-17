import type { AppState, Magasin, Saisie } from '../types'
import { isoWeekOf, weekId, mondayOfWeek, addWeeks, currentWeekId } from './iso'

/**
 * Jeu de données de démonstration : 2 magasins (2 sociétés distinctes),
 * 6 semaines de saisies déjà remplies — les 6 semaines pleines qui précèdent
 * la semaine courante, pour que la démo soit parlante quel que soit le jour d'ouverture.
 */
export function buildDemoState(): AppState {
  const magasin1: Magasin = {
    id: 'demo-m1',
    nom: 'Marché Frais Centre-Ville',
    societe: 'SARL Delmas Distribution',
    siren: '842 517 396',
    enseigne: 'Marché Frais',
    caHT: 1_970_000,
    margePct: 33.6,
    coutKgFL: 2.2,
    successFeePct: 25,
    collecteurs: [
      { nom: 'Banque Alimentaire du Rhône', contact: 'M. Perret — 04 78 52 11 30', jours: 'Mardi et vendredi matin' },
    ],
    creeLe: '2026-06-29T10:15:00.000Z',
    versionsParametres: [{ version: 1, date: '2026-06-29T10:15:00.000Z', margePct: 33.6, coutKgFL: 2.2 }],
  }

  const magasin2: Magasin = {
    id: 'demo-m2',
    nom: 'Épicerie du Port',
    societe: 'SAS Riva Alimentaire',
    siren: '901 284 375',
    enseigne: 'Bio&Local',
    caHT: 1_680_000,
    margePct: 28.9,
    coutKgFL: 2.2,
    successFeePct: 25,
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
      pvEmballes: donneesM1[i].pv,
      kgFL: donneesM1[i].kg,
      note: donneesM1[i].note,
      justificatifs: [],
      horodatage: horodatageM1.toISOString(),
      margePctAppliquee: magasin1.margePct,
      coutKgFLApplique: magasin1.coutKgFL,
    })

    const horodatageM2 = new Date(lundiSuivant)
    horodatageM2.setUTCHours(9, 15 + i * 2, 0, 0)
    saisies.push({
      id: `demo-s2-${i}`,
      magasinId: magasin2.id,
      semaine: sem,
      pvEmballes: donneesM2[i].pv,
      kgFL: donneesM2[i].kg,
      note: donneesM2[i].note,
      justificatifs: [],
      horodatage: horodatageM2.toISOString(),
      margePctAppliquee: magasin2.margePct,
      coutKgFLApplique: magasin2.coutKgFL,
    })
  })

  return { schema: 1, magasins: [magasin1, magasin2], saisies }
}

/** Exercice courant (année civile de la semaine courante). */
export function exerciceCourant(): number {
  return isoWeekOf(new Date()).year
}

export { weekId }
