import { useEffect, useState } from 'react'
import type { Justificatif } from '../types'
import { supprimerFichierBordereau, urlsBordereaux } from '../lib/cloud'

/**
 * Galerie des pièces jointes d'une ligne : vignettes cliquables (ouverture en
 * grand dans un nouvel onglet), suppression qui retire aussi le fichier du
 * bucket. Les pièces locales (hors connexion) s'affichent depuis leur dataUrl.
 */
export function Pieces({
  justificatifs,
  onChange,
  compact = false,
}: {
  justificatifs: Justificatif[]
  onChange?: (liste: Justificatif[]) => void
  compact?: boolean
}) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const chemins = justificatifs.map((j) => j.chemin).filter((c): c is string => Boolean(c))
  const cle = chemins.join('|')

  useEffect(() => {
    if (chemins.length === 0) return
    urlsBordereaux(chemins).then(setUrls).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  if (justificatifs.length === 0) return null

  async function supprimer(j: Justificatif) {
    if (!onChange) return
    if (!confirm(`Supprimer « ${j.nom} » ? Le fichier archivé sera effacé.`)) return
    if (j.chemin) await supprimerFichierBordereau(j.chemin).catch(() => {})
    onChange(justificatifs.filter((x) => x.id !== j.id))
  }

  return (
    <div className={`pieces ${compact ? 'compact' : ''}`}>
      {justificatifs.map((j) => {
        const src = j.dataUrl ?? (j.chemin ? urls[j.chemin] : undefined)
        const estImage = j.type.startsWith('image/')
        return (
          <figure className="piece" key={j.id}>
            <a href={src} target="_blank" rel="noopener" title="Ouvrir en grand" className="piece-cadre">
              {estImage && src ? <img src={src} alt={j.nom} loading="lazy" /> : <span className="piece-doc">{j.type.includes('pdf') ? 'PDF' : '…'}</span>}
            </a>
            <figcaption>
              <span>{j.nom}</span>
              {onChange && (
                <button type="button" className="piece-suppr" aria-label={`Supprimer ${j.nom}`} onClick={() => void supprimer(j)}>
                  ✕
                </button>
              )}
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}
