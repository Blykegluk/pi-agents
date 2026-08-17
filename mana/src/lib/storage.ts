import type { AppState } from '../types'

const KEY = 'mana-state-v1'

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.schema !== 1 || !Array.isArray(parsed.magasins) || !Array.isArray(parsed.saisies)) return null
    return parsed as AppState
  } catch {
    return null
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    // Quota localStorage dépassé (justificatifs trop lourds, en général)
    return false
  }
}

export function clearState(): void {
  localStorage.removeItem(KEY)
}

export function exportJSON(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mana-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importJSON(file: File): Promise<AppState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (parsed?.schema !== 1 || !Array.isArray(parsed.magasins) || !Array.isArray(parsed.saisies)) {
          reject(new Error('Ce fichier n’est pas un export Mana valide.'))
          return
        }
        resolve(parsed as AppState)
      } catch {
        reject(new Error('Ce fichier n’est pas un JSON valide.'))
      }
    }
    reader.readAsText(file)
  })
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
