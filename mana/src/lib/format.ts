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
  return s.replace(/[  ]/g, ' ').replace(/‑/g, '-')
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function fmtDateHeure(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
