/**
 * Identité de la société via l'API Recherche d'Entreprises
 * (recherche-entreprises.api.gouv.fr — gratuite, sans clé).
 *
 * Le SIREN (ou le SIRET, dont il forme les 9 premiers chiffres) suffit : on
 * en tire la dénomination officielle, la forme juridique et l'adresse du
 * siège — tout ce que réclament le reçu fiscal et les autres documents.
 *
 * Année 2 : brancher l'API INPI / comptes annuels pour préremplir CA et marge
 * quand les comptes sont publiés — voir `prechargerComptesINPI` ci-dessous.
 */

export interface AdresseSiege {
  voie: string
  codePostal: string
  commune: string
}

export interface ResultatSiren {
  ok: boolean
  raisonSociale?: string
  formeJuridique?: string
  adresse?: AdresseSiege
  erreur?: string
}

/** Garde les chiffres ; un SIRET (14 chiffres) est ramené à son SIREN (9 premiers). */
export function normaliserSiren(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, '')
  return chiffres.length === 14 ? chiffres.slice(0, 9) : chiffres
}

export function sirenValide(saisie: string): boolean {
  return /^\d{9}$/.test(normaliserSiren(saisie))
}

/** Codes de nature juridique (nomenclature INSEE) les plus courants dans le commerce. */
const FORMES_JURIDIQUES: Record<string, string> = {
  '1000': 'Entrepreneur individuel',
  '5202': 'Société en nom collectif',
  '5410': 'SARL nationale',
  '5498': 'EURL',
  '5499': 'SARL',
  '5505': 'SA à conseil d’administration',
  '5510': 'SA à conseil d’administration',
  '5599': 'SA',
  '5710': 'SAS',
  '5720': 'SASU',
  '6540': 'SCI',
  '6598': 'Société civile',
  '9220': 'Association déclarée',
}

export function libelleFormeJuridique(code: string | undefined): string | undefined {
  if (!code) return undefined
  return FORMES_JURIDIQUES[code] ?? `Forme juridique ${code}`
}

interface ReponseAPI {
  results?: Array<{
    siren?: string
    nom_complet?: string
    nom_raison_sociale?: string
    nature_juridique?: string
    siege?: {
      numero_voie?: string
      indice_repetition?: string
      type_voie?: string
      libelle_voie?: string
      code_postal?: string
      libelle_commune?: string
    }
  }>
}

export async function verifierSiren(saisie: string): Promise<ResultatSiren> {
  const s = normaliserSiren(saisie)
  if (!sirenValide(s)) return { ok: false, erreur: 'Le SIREN doit comporter 9 chiffres (ou le SIRET 14).' }
  try {
    const reponse = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${s}&page=1&per_page=1`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
    const data = (await reponse.json()) as ReponseAPI
    const r = (data.results ?? []).find((x) => x.siren === s)
    if (!r) return { ok: false, erreur: 'SIREN introuvable au registre national des entreprises.' }
    const siege = r.siege
    const voie = [siege?.numero_voie, siege?.indice_repetition, siege?.type_voie, siege?.libelle_voie]
      .filter(Boolean)
      .join(' ')
      .trim()
    return {
      ok: true,
      raisonSociale: r.nom_raison_sociale ?? r.nom_complet ?? undefined,
      formeJuridique: libelleFormeJuridique(r.nature_juridique),
      adresse:
        siege && (voie || siege.code_postal || siege.libelle_commune)
          ? { voie, codePostal: siege.code_postal ?? '', commune: siege.libelle_commune ?? '' }
          : undefined,
    }
  } catch {
    return { ok: false, erreur: 'Service de vérification injoignable — réessayez plus tard.' }
  }
}

/**
 * Préremplissage CA + marge depuis les comptes annuels publiés (API INPI).
 * Non branché dans le MVP : retourne toujours null ; l'appelant retombe sur
 * l'upload de liasse fiscale ou d'attestation d'expert-comptable.
 */
export async function prechargerComptesINPI(_siren: string): Promise<{ caHT: number; margePct: number } | null> {
  return null
}
