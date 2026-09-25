/**
 * Écart entre la réponse proposée par Mana et celle réellement envoyée : 0 = identique,
 * 1 = entièrement réécrite. Mot à mot, par la plus longue sous-suite commune, sans tenir compte
 * de la casse, des espaces ni de la ponctuation. C'est cette mesure qui décide si l'envoi autonome peut s'ouvrir.
 */
export function ecartTextes(propose: string, envoye: string): number {
  const x = propose.toLowerCase().split(/[\s,.;:!?()«»"…]+/).filter(Boolean)
  const y = envoye.toLowerCase().split(/[\s,.;:!?()«»"…]+/).filter(Boolean)
  if (x.length === 0 && y.length === 0) return 0
  const ligne = new Array<number>(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i++) {
    let diagonale = 0
    for (let j = 1; j <= y.length; j++) {
      const avant = ligne[j]
      ligne[j] = x[i - 1] === y[j - 1] ? diagonale + 1 : Math.max(ligne[j], ligne[j - 1])
      diagonale = avant
    }
  }
  return 1 - (2 * ligne[y.length]) / (x.length + y.length)
}

/** Seuils de l'envoi autonome (mêmes valeurs que la fonction preparer-reponse). */
export const SEUIL_NOMBRE = 20
export const SEUIL_TAUX = 0.85
export const ECART_LEGER = 0.15
