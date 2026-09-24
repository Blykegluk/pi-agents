import type { AppState, Societe } from '../types'
import { verifierSiren } from './entreprise'

/** Dénomination à faire figurer sur les documents : celle du registre national si elle est connue. */
export function denomination(societe: Societe): string {
  return societe.verification.raisonSocialeAPI?.trim() || societe.raisonSociale
}

/**
 * Sociétés vérifiées au registre mais enregistrées avant que Mana ne conserve
 * la forme juridique et l'adresse du siège : on complète depuis le registre.
 * Retourne l'état mis à jour, ou null si rien ne change.
 */
export async function completerIdentites(state: AppState): Promise<AppState | null> {
  const aCompleter = state.societes.filter(
    (s) => s.verification.apiStatut === 'verifie' && (!s.verification.formeJuridique || !s.verification.adresseSiege),
  )
  if (aCompleter.length === 0) return null
  const resultats = await Promise.all(aCompleter.map(async (s) => ({ id: s.id, r: await verifierSiren(s.siren) })))
  let change = false
  const societes = state.societes.map((s) => {
    const trouve = resultats.find((x) => x.id === s.id)?.r
    if (!trouve?.ok) return s
    change = true
    return {
      ...s,
      raisonSociale: trouve.raisonSociale ?? s.raisonSociale,
      verification: {
        ...s.verification,
        raisonSocialeAPI: trouve.raisonSociale ?? s.verification.raisonSocialeAPI,
        formeJuridique: trouve.formeJuridique,
        adresseSiege: trouve.adresse,
        apiVerifieLe: new Date().toISOString(),
      },
    }
  })
  return change ? { ...state, societes } : null
}
