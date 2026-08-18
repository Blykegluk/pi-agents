import type { AppState, Magasin, Societe } from '../types'

const KEY = 'mana-state-v1'

interface EtatV1 {
  schema: 1
  magasins: (Magasin & { societe: string; siren?: string; caHT: number; margePct: number; successFeePct: number })[]
  saisies: AppState['saisies']
}

/** Migration schéma 1 → 2 : la société devient une entité (plafond, facturation, vérification du CA). */
function migrerV1(v1: EtatV1): AppState {
  const societes: Societe[] = []
  const magasins: Magasin[] = []
  for (const m of v1.magasins) {
    let societe = societes.find((s) => s.raisonSociale === m.societe)
    if (!societe) {
      societe = {
        id: `soc-${societes.length + 1}-${m.id}`,
        raisonSociale: m.societe,
        siren: m.siren ?? '',
        caHT: m.caHT,
        margePct: m.margePct,
        successFeePct: m.successFeePct ?? 25,
        verification: { apiStatut: 'non_verifie' },
        creeLe: m.creeLe,
      }
      societes.push(societe)
    } else {
      societe.caHT += m.caHT
    }
    magasins.push({
      id: m.id,
      societeId: societe.id,
      nom: m.nom,
      enseigne: m.enseigne,
      coutKgFL: m.coutKgFL,
      collecteurs: m.collecteurs,
      creeLe: m.creeLe,
      versionsParametres: m.versionsParametres,
    })
  }
  return {
    schema: 2,
    societes,
    magasins,
    saisies: v1.saisies.map((s) => ({ ...s, type: s.type ?? 'don' })),
    factures: [],
    clotures: [],
  }
}

function estV2(parsed: unknown): parsed is AppState {
  const p = parsed as Partial<AppState>
  return (
    p?.schema === 2 &&
    Array.isArray(p.societes) &&
    Array.isArray(p.magasins) &&
    Array.isArray(p.saisies) &&
    Array.isArray(p.factures) &&
    Array.isArray(p.clotures)
  )
}

function interpreter(parsed: unknown): AppState | null {
  if (estV2(parsed)) return parsed
  const p = parsed as { schema?: number; magasins?: unknown; saisies?: unknown }
  if (p?.schema === 1 && Array.isArray(p.magasins) && Array.isArray(p.saisies)) {
    return migrerV1(p as EtatV1)
  }
  return null
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return interpreter(JSON.parse(raw))
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

export function etatVide(): AppState {
  return { schema: 2, societes: [], magasins: [], saisies: [], factures: [], clotures: [] }
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
        const etat = interpreter(JSON.parse(String(reader.result)))
        if (!etat) {
          reject(new Error('Ce fichier n’est pas un export Mana valide.'))
          return
        }
        resolve(etat)
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
