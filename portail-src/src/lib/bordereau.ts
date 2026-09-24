import type { CategoriePesee, Magasin, ProfilBordereau, Saisie } from '../types'

/**
 * Profils de bordereau. Le bordereau prouve la remise ; la valeur fiscale
 * vient du relevé de démarque pour tout ce qui a été scanné en caisse, et du
 * poids × coût de revient pour ce qui ne l'a pas été. Chaque enseigne a ses
 * habitudes de scan des pertes : le profil se règle magasin par magasin, et
 * les catégories peuvent être ajoutées, renommées ou supprimées.
 */
export const PROFILS_PRESETS: Record<'tout_scanne' | 'vrac_pese', { libelle: string; description: string; categories: CategoriePesee[] }> = {
  tout_scanne: {
    libelle: 'Tout est scanné en démarque',
    description:
      'Fruits & légumes et pain sont pesés puis scannés avant d’être ensachés : le relevé porte toute la valeur. Les poids du bordereau servent de preuve et de tonnage.',
    categories: [
      { id: 'fl', libelle: 'Fruits & légumes', valorisation: 'releve' },
      { id: 'pain', libelle: 'Pain', valorisation: 'releve' },
      { id: 'autres', libelle: 'Autres', valorisation: 'releve', preciser: true },
    ],
  },
  vrac_pese: {
    libelle: 'Le vrac n’est pas scanné',
    description:
      'Les produits emballés passent en démarque, mais fruits & légumes, pain et vrac partent sans scan : ils sont valorisés au poids, à leur coût de revient au kilo.',
    categories: [
      { id: 'fl', libelle: 'Fruits & légumes', valorisation: 'cout_kg', coutKg: 2.2 },
      { id: 'pain', libelle: 'Pain', valorisation: 'cout_kg', coutKg: 2.5 },
      { id: 'autres', libelle: 'Autres', valorisation: 'cout_kg', coutKg: 3, preciser: true },
    ],
  },
}

/** Le profil d'un magasin — dérivé des anciens réglages (modeFL, coutKgFL) s'il n'en a pas encore. */
export function profilDeMagasin(m: Magasin): ProfilBordereau {
  if (m.profilBordereau && m.profilBordereau.categories.length > 0) return m.profilBordereau
  const fl: CategoriePesee =
    m.modeFL === 'inclus'
      ? { id: 'fl', libelle: 'Fruits & légumes', valorisation: 'releve' }
      : { id: 'fl', libelle: 'Fruits & légumes', valorisation: 'cout_kg', coutKg: m.coutKgFL }
  return { colis: true, categories: [fl, { id: 'pain', libelle: 'Pain', valorisation: 'releve' }, { id: 'autres', libelle: 'Autres', valorisation: 'releve', preciser: true }] }
}

/** Nom du preset qui correspond au profil, pour le pré-cocher dans le formulaire. */
export function presetDuProfil(p: ProfilBordereau): keyof typeof PROFILS_PRESETS | null {
  const toutReleve = p.categories.every((c) => c.valorisation === 'releve')
  if (toutReleve) return 'tout_scanne'
  const toutCout = p.categories.every((c) => c.valorisation === 'cout_kg')
  return toutCout ? 'vrac_pese' : null
}

/** Valeur (€, coût de revient) des catégories pesées valorisées au kilo. */
export function coutPesee(poids: Record<string, number>, profil: ProfilBordereau): number {
  return profil.categories.reduce((t, c) => (c.valorisation === 'cout_kg' ? t + (poids[c.id] ?? 0) * (c.coutKg ?? 0) : t), 0)
}

export function poidsTotal(poids: Record<string, number>): number {
  return Object.values(poids).reduce((t, v) => t + (v || 0), 0)
}

/** Les poids d'une ligne, anciennes lignes comprises (kgFL seul). */
export function poidsDeSaisie(s: Saisie): Record<string, number> {
  if (s.poids) return s.poids
  return s.kgFL > 0 ? { fl: s.kgFL } : {}
}

/** « 12,5 kg F&L · 3 kg pain » — pour les listes et le registre. */
export function libellePoids(s: Saisie, profil?: ProfilBordereau): string {
  const poids = poidsDeSaisie(s)
  const noms: Record<string, string> = { fl: 'F&L', pain: 'pain', autres: 'autres' }
  for (const c of profil?.categories ?? []) noms[c.id] = c.id === 'fl' ? 'F&L' : c.libelle.toLowerCase()
  const parts = Object.entries(poids)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg ${noms[k] ?? k}`)
  if (s.precisionPoids) parts.push(`(${s.precisionPoids})`)
  return parts.join(' · ')
}

/** Catégorie « fruits & légumes » d'un profil : celle qui alimente kgFL/flInclus (compatibilité). */
export function categorieFL(profil: ProfilBordereau): CategoriePesee | undefined {
  return profil.categories.find((c) => c.id === 'fl')
}
