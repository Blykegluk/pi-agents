import type { Justificatif } from '../types'
import { uid } from './storage'

/** Taille maximale d'une pièce jointe (localStorage oblige). */
export const TAILLE_MAX_PJ = 1.5 * 1024 * 1024

export async function lireFichiers(files: FileList | null): Promise<Justificatif[]> {
  if (!files) return []
  const resultat: Justificatif[] = []
  for (const f of Array.from(files)) {
    if (f.size > TAILLE_MAX_PJ) {
      alert(`« ${f.name} » dépasse 1,5 Mo — compressez la photo ou le PDF avant de le joindre.`)
      continue
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('lecture impossible'))
      r.readAsDataURL(f)
    })
    resultat.push({ id: uid(), nom: f.name, type: f.type, taille: f.size, dataUrl })
  }
  return resultat
}

/**
 * Compresse une photo de bordereau avant envoi : 1 600 px sur le grand côté,
 * JPEG qualité 0,72. Un bordereau A4 photographié passe ainsi de 3-5 Mo à
 * ~200 Ko — assez net pour être relu, assez léger pour l'envoi et l'archivage.
 */
export async function compresserPhoto(
  fichier: File,
  maxPx = 1600,
  qualite = 0.72,
): Promise<{ blob: Blob; base64: string; typeMime: string }> {
  const bitmap = await createImageBitmap(fichier)
  const echelle = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const largeur = Math.round(bitmap.width * echelle)
  const hauteur = Math.round(bitmap.height * echelle)
  const canvas = document.createElement('canvas')
  canvas.width = largeur
  canvas.height = hauteur
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Compression impossible sur cet appareil.')
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', qualite))
  if (!blob) throw new Error('Compression impossible sur cet appareil.')
  const dataUrl = canvas.toDataURL('image/jpeg', qualite)
  return { blob, base64: dataUrl.split(',')[1], typeMime: 'image/jpeg' }
}
