/** Semaines ISO 8601 — identifiant "AAAA-WNN" (ex. "2026-W33"). */

export function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

export function weekId(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function parseWeekId(id: string): { year: number; week: number } {
  const [y, w] = id.split('-W')
  return { year: Number(y), week: Number(w) }
}

export function currentWeekId(): string {
  const { year, week } = isoWeekOf(new Date())
  return weekId(year, week)
}

export function mondayOfWeek(id: string): Date {
  const { year, week } = parseWeekId(id)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const day = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7)
  return monday
}

export function weeksInYear(year: number): number {
  const dec28 = new Date(Date.UTC(year, 11, 28))
  return isoWeekOf(dec28).week
}

export function addWeeks(id: string, n: number): string {
  const monday = mondayOfWeek(id)
  monday.setUTCDate(monday.getUTCDate() + n * 7)
  const { year, week } = isoWeekOf(monday)
  return weekId(year, week)
}

/** "Sem. 33 · 10 – 16 août 2026" */
export function weekLabel(id: string): string {
  const { week } = parseWeekId(id)
  const monday = mondayOfWeek(id)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' }
  const fin = sunday.toLocaleDateString('fr-FR', { ...opts, year: 'numeric' })
  const debut =
    monday.getUTCMonth() === sunday.getUTCMonth()
      ? monday.toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'UTC' })
      : monday.toLocaleDateString('fr-FR', opts)
  return `Sem. ${week} · ${debut} – ${fin}`
}

/** Numéro de semaine pour trier ("2026-W09" < "2026-W33"). */
export function compareWeekIds(a: string, b: string): number {
  return a.localeCompare(b)
}
