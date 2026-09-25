export interface Collecteur {
  nom: string
  /** Référent chez l'association (nom de la personne). */
  contact: string
  telephone?: string
  email?: string
  /** Rythme convenu — choisi parmi FREQUENCES, 'Autre' ouvrant un champ libre. */
  frequence?: string
  frequenceAutre?: string
  /** Créneau de passage — choisi parmi PLAGES, 'Autre' ouvrant un champ libre. */
  plage?: string
  plageAutre?: string
  /** Jours de passage, en clair. */
  jours: string
  /** Identifiants de l'association (RNA W…, SIREN) — repris sur le reçu fiscal. */
  rna?: string
  siren?: string
  /**
   * Éligibilité au mécénat (art. 238 bis), condition de validité du reçu :
   * 'inconnue' tant qu'aucune pièce n'est réunie ; 'a_verifier' quand les
   * statuts sont là mais pas de position de l'administration ; 'rescrit'
   * quand un rescrit positif est joint ; 'reseau_national' pour les grands
   * réseaux dont l'éligibilité est notoire (Banque Alimentaire, Restos…).
   */
  eligibilite?: 'inconnue' | 'a_verifier' | 'rescrit' | 'reseau_national'
  /** Statuts, récépissé de déclaration, rescrit, convention de don… */
  documents?: Justificatif[]
  /** Dernière analyse des pièces par Mana (verdict calculé par règle fixe). */
  analyse?: AnalyseAssociation
}

export type Tri = 'oui' | 'non' | 'inconnu'

export interface CriteresAssociation {
  declarationPrefecture: Tri
  gestionDesinteressee: Tri
  activiteNonLucrative: Tri
  cercleRestreint: Tri
  devolutionBoni: Tri
  objetEligible: Tri
  rescritPositif: Tri
  dateRescrit: string
  habilitationAideAlimentaire: Tri
  reseauNational: Tri
  gratuiteBeneficiaires: Tri
}

export interface AnalyseAssociation {
  le: string
  verdict: 'validee' | 'a_securiser' | 'refus'
  criteres: CriteresAssociation
  /** Ce que les pièces établissent (faits). */
  motifs: string[]
  /** Ce qui manque ou reste ambigu. */
  doutes: string[]
  /** Ce que Mana propose de faire pour sécuriser. */
  actions: string[]
  documents: { type: string; resume: string; lisible: boolean }[]
  confiance: 'haute' | 'moyenne' | 'basse'
  association: { nom: string; rna: string; siren: string; siege: string; dateDeclaration: string; objet: string }
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
  /** Pièce gardée en local (compte hors ligne) — encombre le localStorage. */
  dataUrl?: string
  /** Chemin dans le bucket Supabase `mana-bordereaux` (compte connecté). */
  chemin?: string
}

/** Vérification du CA et de l'existence de la société — le CA n'est jamais un champ libre. */
export interface VerificationSociete {
  /** Vérification d'existence via l'API Recherche d'Entreprises (api.gouv.fr). */
  apiStatut: 'verifie' | 'introuvable' | 'indisponible' | 'non_verifie'
  /** Dénomination officielle au registre — celle qui figure sur tous les documents. */
  raisonSocialeAPI?: string
  /** Forme juridique et adresse du siège, lues au registre (reçu fiscal). */
  formeJuridique?: string
  adresseSiege?: { voie: string; codePostal: string; commune: string }
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
  /** Contrat de service Mana signé en ligne (la preuve complète est en base, table mana_contrats). */
  contrat?: ContratSigne
}

export interface ContratSigne {
  id: string
  version: string
  signeLe: string
  email: string
  nomSignataire: string
}

/** Avancement de l'assistant « Mise en place de la collecte » (accompagnement). */
export interface MiseEnPlace {
  /** Identifiants des étapes cochées par le magasin. */
  faites: string[]
  /** Gisement estimé de produits donnables, en kg/jour. */
  gisementKgJour?: number
}

/**
 * Une catégorie pesée sur le bordereau. Sa valeur fiscale vient soit du relevé
 * de démarque (le produit a été scanné en caisse : 'releve'), soit du poids
 * multiplié par un coût de revient au kilo ('cout_kg') quand le magasin ne
 * scanne pas ce type de produit. Chaque enseigne a ses habitudes : le profil
 * est réglable magasin par magasin.
 */
export interface CategoriePesee {
  id: string
  libelle: string
  valorisation: 'releve' | 'cout_kg'
  /** €/kg, seulement si valorisation = 'cout_kg'. */
  coutKg?: number
  /** Demander de préciser ce qui a été pesé (catégorie fourre-tout). */
  preciser?: boolean
}

export interface ProfilBordereau {
  /** Le bordereau compte les colis de produits emballés. */
  colis: boolean
  categories: CategoriePesee[]
}

export interface Magasin {
  id: string
  societeId: string
  nom: string
  enseigne?: string
  /** Adresse du point de vente (rue, code postal, ville) : bordereaux, recherche d'associations à proximité. */
  adresse?: string
  /** Coût de revient moyen fruits & légumes, €/kg */
  coutKgFL: number
  /** Profil du bordereau (catégories pesées et leur valorisation). Dérivé de modeFL/coutKgFL s'il est absent. */
  profilBordereau?: ProfilBordereau
  /** Rythme de saisie des pertes choisi par le magasin (hebdomadaire par défaut). */
  frequenceSaisie?: 'hebdomadaire' | 'quotidienne'
  /**
   * Fruits & légumes : 'poids' (pesés, valorisés au coût/kg — défaut) ou
   * 'inclus' (déjà compris dans le montant de démarque scanné).
   */
  modeFL?: 'poids' | 'inclus'
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
  /** Poids de fruits & légumes donnés (kg) — 0 si les F&L sont inclus dans le montant. */
  kgFL: number
  /** Les F&L sont compris dans `pvEmballes` (pas de pesée séparée). */
  flInclus?: boolean
  /** Poids par catégorie du profil de bordereau (kg), ex. { fl: 12.5, pain: 3 }. */
  poids?: Record<string, number>
  /** Ce qui a été pesé dans une catégorie « à préciser ». */
  precisionPoids?: string
  /**
   * Valeur (€, coût de revient) des catégories pesées valorisées au kilo,
   * figée à l'enregistrement. Absente sur les anciennes lignes : le moteur
   * retombe alors sur kgFL × coutKgFLApplique.
   */
  coutPeseeApplique?: number
  /** Association qui a enlevé les denrées — indispensable dès qu'un magasin en a plusieurs. */
  collecteur?: string
  /**
   * Nature de la ligne : 'bordereau' = un passage (jour, colis, kg, photo signée — la
   * preuve) ; 'releve' = un montant de démarque lu dans l'export du back-office,
   * rattaché à la semaine. Absent sur les anciennes saisies combinées.
   */
  origine?: 'bordereau' | 'releve'
  /** Colis de produits emballés remis (bacs, cartons ou sacs) — sur un bordereau. */
  colis?: number
  /** Le bordereau porte les deux signatures. */
  signe?: boolean
  /** Relevé mensuel réparti sur ses semaines : le mois d'origine ('AAAA-MM'). */
  releveMois?: string
  /** Relevé sur une période libre : bornes (AAAA-MM-JJ, incluses). */
  releveDu?: string
  releveAu?: string
  /**
   * Ce que le magasin a réellement saisi pour un relevé, avant normalisation en
   * prix de vente HT (`pvEmballes`) : le montant tel quel, son unité et le taux
   * de TVA appliqué. Conservé pour l'audit.
   */
  montantSaisi?: number
  saisiEn?: 'pv_ht' | 'pv_ttc' | 'pa_ht' | 'pa_ttc'
  tauxTVA?: number
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

/**
 * Ce que le magasin dit d'un passage attendu resté sans bordereau : l'association
 * est venue sans rien emporter, n'est pas venue, le bordereau reste à saisir, ou le
 * magasin était fermé. Le moteur de surveillance en tient compte.
 */
export interface ReponsePassage {
  id: string
  magasinId: string
  collecteur: string
  /** Jour du passage attendu (AAAA-MM-JJ). */
  date: string
  reponse: 'venu_sans_don' | 'pas_venu' | 'bordereau_a_saisir' | 'ferme'
  commentaire?: string
  /** Horodatage de la réponse. */
  le: string
  par?: string
}

export interface AppState {
  schema: 2
  societes: Societe[]
  magasins: Magasin[]
  saisies: Saisie[]
  factures: Facture[]
  clotures: Cloture[]
  /** Réponses du magasin sur les passages sans bordereau (absent sur les anciens états). */
  reponsesPassages?: ReponsePassage[]
}
