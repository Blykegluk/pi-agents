/**
 * Vérification d'existence de la société via l'API Recherche d'Entreprises
 * (recherche-entreprises.api.gouv.fr — gratuite, sans clé).
 *
 * Année 2 : brancher l'API INPI / comptes annuels pour préremplir CA et marge
 * quand les comptes sont publiés — voir `prechargerComptesINPI` ci-dessous.
 */

export interface ResultatSiren {
  ok: boolean
  raisonSociale?: string
  erreur?: string
}

export function normaliserSiren(siren: string): string {
  return siren.replace(/\D/g, '')
}

export function sirenValide(siren: string): boolean {
  return /^\d{9}$/.test(normaliserSiren(siren))
}

export async function verifierSiren(siren: string): Promise<ResultatSiren> {
  const s = normaliserSiren(siren)
  if (!sirenValide(s)) return { ok: false, erreur: 'Le SIREN doit comporter 9 chiffres.' }
  try {
    const reponse = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${s}&page=1&per_page=1`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
    const data = await reponse.json()
    const resultat = (data.results ?? []).find((r: { siren?: string }) => r.siren === s)
    if (!resultat) return { ok: false, erreur: 'SIREN introuvable au registre national des entreprises.' }
    return { ok: true, raisonSociale: resultat.nom_complet ?? resultat.nom_raison_sociale ?? undefined }
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
