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

/** Texte → base64 UTF-8, comme le reste des documents envoyés à la lecture. */
export function texteEnBase64(texte: string): string {
  const octets = new TextEncoder().encode(texte)
  let binaire = ''
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(binaire)
}
