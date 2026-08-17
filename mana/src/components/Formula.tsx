import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Transparence : tout montant affiché est cliquable et révèle sa formule
 * (spec §5 — « transparence = confiance = argument de vente »).
 */
export interface FormulaInfo {
  titre: string
  lignes: string[]
}

const FormulaCtx = createContext<(info: FormulaInfo) => void>(() => {})

export function FormulaProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<FormulaInfo | null>(null)
  return (
    <FormulaCtx.Provider value={setInfo}>
      {children}
      {info && (
        <div className="sheet-backdrop" onClick={() => setInfo(null)}>
          <div className="sheet" role="dialog" aria-label={info.titre} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3>{info.titre}</h3>
            <div className="sheet-lines">
              {info.lignes.map((l, i) => (
                <p key={i} className={l.startsWith('=') ? 'sheet-result' : undefined}>
                  {l}
                </p>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => setInfo(null)}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </FormulaCtx.Provider>
  )
}

export function Amount({
  children,
  titre,
  lignes,
  className,
}: {
  children: ReactNode
  titre: string
  lignes: string[]
  className?: string
}) {
  const show = useContext(FormulaCtx)
  return (
    <button
      type="button"
      className={`amt ${className ?? ''}`}
      title="Voir la formule"
      onClick={() => show({ titre, lignes })}
    >
      {children}
    </button>
  )
}
