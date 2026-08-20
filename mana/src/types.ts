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

export interface Justificatif {
  id: string
  nom: string
  type: string
  taille: number
  dataUrl: string
}

/** Vérification du CA et de l'existence de la société — le CA n'est jamais un champ libre. */
export interface VerificationSociete {
  /** Vérification d'existence via l'API Recherche d'Entreprises (api.gouv.fr). */
  apiStatut: 'verifie' | 'introuvable' | 'indisponible' | 'non_verifie'
  raisonSocialeAPI?: string
  apiVerifieLe?: string
  /** Vérification du CA par justificatif (liasse 2052 ou attestation d'expert-comptable). */
  caVerifieLe?: string
  caSource?: string
}

/** Le plafond fiscal, la facturation et la vérification du CA s'apprécient PAR SOCIÉTÉ. */
export interface Societe {
  id: string
  raisonSociale: string
  siren: string
  caHT: number
  /** Marge brute de la liasse fiscale, en % — liée au justificatif CA. */
  margePct: number
  /** Success fee en % de la réduction d'impôt (30, fixé par Mana) — soit 18 % de la base valorisée. */
  successFeePct: number
  verification: VerificationSociete
  justificatifCA?: Justificatif
  creeLe: string
}

/** Avancement de l'assistant « Mise en place de la collecte » (accompagnement). */
export interface MiseEnPlace {
  /** Identifiants des étapes cochées par le magasin. */
  faites: string[]
  /** Gisement estimé de produits donnables, en kg/jour. */
  gisementKgJour?: number
}

export interface Magasin {
  id: string
  societeId: string
  nom: string
  enseigne?: string
  /** Coût de revient moyen fruits & légumes, €/kg */
  coutKgFL: number
  /** Rythme de saisie des pertes choisi par le magasin (hebdomadaire par défaut). */
  frequenceSaisie?: 'hebdomadaire' | 'quotidienne'
  collecteurs: Collecteur[]
  miseEnPlace?: MiseEnPlace
  creeLe: string
  versionsParametres: VersionParametres[]
}

export interface Saisie {
  id: string
  magasinId: string
  /** Semaine ISO, ex. "2026-W33" */
  semaine: string
  /** Jour précis (AAAA-MM-JJ) pour les magasins en saisie quotidienne — absent en saisie hebdomadaire. */
  jour?: string
  /** 'don' = saisie normale ; 'correction' = dons refusés retranchés a posteriori (montants négatifs). */
  type: 'don' | 'correction'
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

export interface Facture {
  id: string
  /** Numérotation séquentielle : MANA-AAAA-NNN */
  numero: string
  societeId: string
  exercice: number
  /** 'AAAA-MM' pour une commission mensuelle ; 'AAAA' pour une régularisation de clôture. */
  periode: string
  type: 'commission' | 'complement' | 'avoir'
  libelle: string
  /** Base de dons facturée ce mois (négative pour un avoir). */
  baseFacturable: number
  tauxCommissionPct: number
  montantHT: number
  tauxTVAPct: number
  montantTVA: number
  montantTTC: number
  emiseLe: string
  /** Détail du calcul, ligne à ligne (transparence). */
  detail: string[]
}

/** Clôture d'exercice : régularisation sur la liasse réelle. */
export interface Cloture {
  id: string
  societeId: string
  exercice: number
  caReel: number
  margeReellePct: number
  justificatif?: Justificatif
  effectueeLe: string
  factureId?: string
}

export interface AppState {
  schema: 2
  societes: Societe[]
  magasins: Magasin[]
  saisies: Saisie[]
  factures: Facture[]
  clotures: Cloture[]
}
