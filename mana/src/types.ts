export interface Collecteur {
  nom: string
  contact: string
  jours: string
}

/** Version des paramètres de valorisation — trace la constance de la méthode (note de méthode). */
export interface VersionParametres {
  version: number
  date: string // ISO
  margePct: number
  coutKgFL: number
}

export interface Magasin {
  id: string
  nom: string
  societe: string
  siren?: string
  enseigne?: string
  caHT: number
  /** Marge brute de la liasse fiscale, en % (ex. 33,6) */
  margePct: number
  /** Coût de revient moyen fruits & légumes, €/kg */
  coutKgFL: number
  /** Success fee Mana, en % (préréglé 25) */
  successFeePct: number
  collecteurs: Collecteur[]
  creeLe: string // ISO
  versionsParametres: VersionParametres[]
}

export interface Justificatif {
  id: string
  nom: string
  type: string
  taille: number
  dataUrl: string
}

export interface Saisie {
  id: string
  magasinId: string
  /** Semaine ISO, ex. "2026-W33" */
  semaine: string
  /** Montant prix de vente de la démarque "don" — produits emballés (€) */
  pvEmballes: number
  /** Poids de fruits & légumes donnés (kg) */
  kgFL: number
  note?: string
  justificatifs: Justificatif[]
  /** Horodatage de l'enregistrement (registre opposable) */
  horodatage: string
  /** Coefficients figés au moment de la saisie */
  margePctAppliquee: number
  coutKgFLApplique: number
}

export interface AppState {
  schema: 1
  magasins: Magasin[]
  saisies: Saisie[]
}
