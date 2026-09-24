import { useEffect, useState } from 'react'

/** Seuil à partir duquel les onglets passent sur deux colonnes (voir styles.css). */
export const LARGEUR_DEUX_COLONNES = 1100

/**
 * Vrai quand la fenêtre est au moins aussi large que `min` (en px), et se met à jour au
 * redimensionnement. Sert aux onglets dont la mise en page PC réordonne le contenu
 * (Magasins, Bilan, Messages) : en dessous du seuil, le rendu mobile reste strictement le même.
 */
export function useGrandEcran(min = LARGEUR_DEUX_COLONNES): boolean {
  const requete = `(min-width: ${min}px)`
  const [grand, setGrand] = useState(() => typeof window !== 'undefined' && window.matchMedia(requete).matches)
  useEffect(() => {
    const mq = window.matchMedia(requete)
    const maj = () => setGrand(mq.matches)
    maj()
    mq.addEventListener('change', maj)
    return () => mq.removeEventListener('change', maj)
  }, [requete])
  return grand
}
