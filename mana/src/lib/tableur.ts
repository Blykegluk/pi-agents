/**
 * Un export de back-office arrive souvent en Excel ou en CSV, pas en photo.
 * On le transforme en texte tabulaire (une feuille après l'autre, en CSV)
 * pour que la lecture automatique le lise comme un document. Le parseur est
 * chargé à la demande : il ne pèse rien tant qu'on n'en a pas besoin.
 */

const EXTENSIONS_TABLEUR = ['.xlsx', '.xlsm', '.xls', '.csv', '.tsv', '.ods', '.numbers']
const TYPES_TABLEUR = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
  'text/tab-separated-values',
]

/** Limite de texte envoyé à la lecture : un export mensuel tient largement, un grand livre non. */
const MAX_CARACTERES = 200_000

export function estUnTableur(f: File): boolean {
  const nom = f.name.toLowerCase()
  return TYPES_TABLEUR.includes(f.type) || EXTENSIONS_TABLEUR.some((ext) => nom.endsWith(ext))
}

/** Le contenu du fichier, feuille par feuille, en CSV lisible (séparateur ;). */
export async function tableurEnTexte(f: File): Promise<string> {
  const XLSX = await import('xlsx')
  const donnees = await f.arrayBuffer()
  const classeur = XLSX.read(donnees, { type: 'array', cellDates: true, raw: false })
  const morceaux: string[] = []
  for (const nom of classeur.SheetNames) {
    const feuille = classeur.Sheets[nom]
    if (!feuille) continue
    const csv = XLSX.utils.sheet_to_csv(feuille, { FS: ';', blankrows: false, dateNF: 'yyyy-mm-dd' })
    if (!csv.trim()) continue
    morceaux.push(`=== Feuille : ${nom} ===\n${csv}`)
  }
  if (morceaux.length === 0) throw new Error('Ce tableur est vide ou illisible.')
  let texte = morceaux.join('\n\n')
  if (texte.length > MAX_CARACTERES) {
    texte = texte.slice(0, MAX_CARACTERES) + '\n[… fichier tronqué : ne gardez que la période et le motif « don » dans votre export]'
  }
  return texte
}

/**
 * Ce qu'on peut tirer d'un export sans aucune lecture automatique : la somme
 * des lignes produit, la ligne de total si le fichier en a une, ce que disent
 * les en-têtes (prix de vente / d'achat, HT / TTC) et, à défaut de colonne
 * de dates, la période écrite dans le nom du fichier.
 */
export interface AnalyseTableur {
  /** Somme des lignes produit de la colonne de montant, en valeur absolue (les exports comptent la démarque en négatif). */
  sommeLignes?: number
  nbLignes: number
  /** Total inscrit dans le fichier (ligne où seule la colonne de montant est remplie). */
  totalFichier?: number
  colonneMontant?: string
  nature?: 'pv' | 'pa'
  unite?: 'ht' | 'ttc'
  du?: string
  au?: string
  /** D'où viennent les dates : une colonne du fichier ou son nom. */
  sourceDates?: 'colonne' | 'nom'
}

const arrondi = (n: number) => Math.round(n * 100) / 100
const nombre = (cellule: string): number | undefined => {
  const t = cellule.replace(/\s| /g, '').replace(/€/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined
  return Number(t)
}

const MOIS: Record<string, number> = { janv: 1, jan: 1, fev: 2, fév: 2, mars: 3, mar: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, août: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12, déc: 12 }
const pad = (n: number) => String(n).padStart(2, '0')

/** Dates lisibles dans un texte libre (nom de fichier) : « 14 sept - 20 sept », « 14/09/2026 », « 2026-09-14 ». */
export function datesDansTexte(texte: string, anneeParDefaut = new Date().getFullYear()): string[] {
  const dates: string[] = []
  const t = texte.toLowerCase()
  for (const m of t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) dates.push(`${m[1]}-${m[2]}-${m[3]}`)
  for (const m of t.matchAll(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/g)) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    dates.push(`${a}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`)
  }
  for (const m of t.matchAll(/(\d{1,2})(?:er)?[ _-]*(janv|jan|fév|fev|mars|mar|avr|mai|juin|juil|août|aout|sept|sep|oct|nov|déc|dec)[a-zé]*\.?(?:[ _-]*(\d{4}))?/g)) {
    const mois = MOIS[m[2]]
    if (mois) dates.push(`${m[3] ? Number(m[3]) : anneeParDefaut}-${pad(mois)}-${pad(Number(m[1]))}`)
  }
  return dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number(d.slice(5, 7)) <= 12 && Number(d.slice(8)) <= 31).sort()
}

export function analyserTableur(texte: string, nomFichier = ''): AnalyseTableur {
  const resultat: AnalyseTableur = { nbLignes: 0 }
  const lignes = texte.split('\n').filter((l) => l.trim() && !l.startsWith('=== Feuille'))
  if (lignes.length === 0) return resultat
  const enTetes = lignes[0].split(';').map((c) => c.trim())
  const norme = enTetes.map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const toutLesEnTetes = norme.join(' | ')

  // Nature et unité, uniquement si les en-têtes l'écrivent
  if (/prix\s*(de\s*)?vente|\bpv\b|valeur\s*(de\s*)?vente|\bca\b/.test(toutLesEnTetes)) resultat.nature = 'pv'
  else if (/prix\s*(d')?\s*achat|\bpa\b|prmp|cout|valeur\s*(d')?\s*achat/.test(toutLesEnTetes)) resultat.nature = 'pa'
  if (/\bttc\b|toutes\s*taxes/.test(toutLesEnTetes)) resultat.unite = 'ttc'
  else if (/\bht\b|hors\s*taxes?/.test(toutLesEnTetes)) resultat.unite = 'ht'

  // Colonne de montant : la dernière dont l'en-tête parle de montant / total / valeur
  let iMontant = -1
  norme.forEach((h, i) => { if (/montant|total|valeur|\bmt\b/.test(h)) iMontant = i })
  if (iMontant === -1) return resultat
  resultat.colonneMontant = enTetes[iMontant]
  const iDate = norme.findIndex((h) => /\bdate\b|jour/.test(h))

  let somme = 0
  const dates: string[] = []
  for (const ligne of lignes.slice(1)) {
    const cellules = ligne.split(';')
    const v = nombre(cellules[iMontant] ?? '')
    if (v === undefined) continue
    const autres = cellules.filter((c, i) => i !== iMontant && c.trim() !== '')
    if (autres.length === 0) {
      resultat.totalFichier = arrondi(Math.abs(v))
      continue
    }
    somme += v
    resultat.nbLignes++
    if (iDate >= 0) dates.push(...datesDansTexte(cellules[iDate] ?? ''))
  }
  if (resultat.nbLignes > 0) resultat.sommeLignes = arrondi(Math.abs(somme))

  const periode = dates.length > 0 ? dates.sort() : datesDansTexte(nomFichier)
  if (periode.length > 0) {
    resultat.du = periode[0]
    resultat.au = periode[periode.length - 1]
    resultat.sourceDates = dates.length > 0 ? 'colonne' : 'nom'
  }
  return resultat
}

/** Texte → base64 UTF-8, comme le reste des documents envoyés à la lecture. */
export function texteEnBase64(texte: string): string {
  const octets = new TextEncoder().encode(texte)
  let binaire = ''
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(binaire)
}
