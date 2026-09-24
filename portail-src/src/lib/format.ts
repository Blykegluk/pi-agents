/** Formatage français des nombres et montants. */

const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtEUR(n: number, decimales: 0 | 2 = 0): string {
  return (decimales === 0 ? eur0 : eur2).format(n)
}

export function fmtNum(n: number, decimales = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales }).format(n)
}

export function fmtPct(n: number, decimales = 1): string {
  return `${fmtNum(n, decimales)} %`
}

export function fmtKg(n: number, decimales = 0): string {
  return `${fmtNum(n, decimales)} kg`
}

/** Les polices PDF standard ne connaissent pas les espaces fines insécables d'Intl. */
export function pdfSafe(s: string): string {
  // Espaces insécables → espace ; tirets et coches hors du sous-ensemble de police → équivalents ASCII
  return s
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\u2011/g, '-')
    .replace(/[✓✔]/g, 'OK')
    .replace(/[✗✘]/g, 'X')
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function fmtDateHeure(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const UNITES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
]
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

/** 0 à 99. */
function sousCent(n: number): string {
  if (n < 20) return UNITES[n]
  const d = Math.floor(n / 10)
  const u = n % 10
  // 70-79 et 90-99 se construisent sur soixante / quatre-vingt + 10..19
  if (d === 7 || d === 9) {
    if (d === 7 && u === 1) return 'soixante et onze'
    return `${DIZAINES[d]}-${UNITES[10 + u]}`
  }
  if (u === 0) return d === 8 ? 'quatre-vingts' : DIZAINES[d]
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`
  return `${DIZAINES[d]}-${UNITES[u]}`
}

/**
 * 0 à 999. `avantMille` supprime le « s » final de « quatre-vingts » et
 * « cents » : vingt et cent restent invariables devant mille.
 */
function sousMille(n: number, avantMille = false): string {
  if (n < 100) {
    const mot = sousCent(n)
    return avantMille ? mot.replace(/ts$/, 't') : mot
  }
  const c = Math.floor(n / 100)
  const r = n % 100
  let mot = c === 1 ? 'cent' : `${UNITES[c]} cent`
  if (c > 1 && r === 0 && !avantMille) mot += 's'
  return r === 0 ? mot : `${mot} ${sousCent(r)}`
}

/** Nombre entier en toutes lettres, jusqu'à 999 999 999. */
export function entierEnLettres(n: number): string {
  if (n === 0) return 'zéro'
  const millions = Math.floor(n / 1_000_000)
  const milliers = Math.floor((n % 1_000_000) / 1000)
  const reste = n % 1000
  const bouts: string[] = []
  if (millions > 0) bouts.push(`${millions === 1 ? 'un' : sousMille(millions)} million${millions > 1 ? 's' : ''}`)
  if (milliers > 0) bouts.push(milliers === 1 ? 'mille' : `${sousMille(milliers, true)} mille`)
  if (reste > 0) bouts.push(sousMille(reste))
  return bouts.join(' ')
}

/**
 * Montant en toutes lettres — mention obligatoire du reçu fiscal de mécénat
 * (formulaire 2041-MEC-SD). Ex. 12 437,25 € → « douze mille quatre cent
 * trente-sept euros et vingt-cinq centimes ».
 */
export function montantEnLettres(montant: number): string {
  const centimes = Math.round(Math.abs(montant) * 100)
  const euros = Math.floor(centimes / 100)
  const cts = centimes % 100
  const lettres = entierEnLettres(euros)
  // « un million d'euros », pas « un million euros »
  const partieEuros = /millions?$/.test(lettres) ? `${lettres} d’euros` : `${lettres} euro${euros > 1 ? 's' : ''}`
  if (cts === 0) return partieEuros
  return `${partieEuros} et ${entierEnLettres(cts)} centime${cts > 1 ? 's' : ''}`
}
