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
