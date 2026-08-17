import { fmtEUR } from '../lib/format'

/**
 * Jauge du plafond annuel — l'élément visuel signature (spec §4.4 et §5).
 * Demi-cercle : base cumulée / plafond de la société.
 */
export function Gauge({ valeur, max, sousTitre }: { valeur: number; max: number; sousTitre: string }) {
  const pct = max > 0 ? Math.min(1, valeur / max) : 0
  const LONGUEUR = Math.PI * 80 // rayon 80
  const couleur = pct >= 1 ? '#B4690E' : pct >= 0.75 ? '#D98E1B' : '#1E5B4A'

  return (
    <div className="gauge">
      <svg viewBox="0 0 200 112" role="img" aria-label={`Plafond utilisé à ${Math.round(pct * 100)} %`}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#E7DFD1" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={couleur}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${pct * LONGUEUR} ${LONGUEUR}`}
          style={{ transition: 'stroke-dasharray .8s ease, stroke .8s ease' }}
        />
        <text x="100" y="82" textAnchor="middle" className="gauge-value">
          {Math.round(pct * 100)} %
        </text>
        <text x="100" y="98" textAnchor="middle" className="gauge-sub">
          du plafond
        </text>
      </svg>
      <div className="gauge-legend">
        <span>
          <strong>{fmtEUR(valeur)}</strong> cumulés
        </span>
        <span>
          plafond <strong>{fmtEUR(max)}</strong>
        </span>
      </div>
      <p className="gauge-caption">{sousTitre}</p>
    </div>
  )
}
