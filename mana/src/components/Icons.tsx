/** Icônes SVG maison (traits 24×24) — direction « Comptoir ». */

const base = {
  width: 21,
  height: 21,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconSimulateur() {
  return (
    <svg {...base}>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <line x1="8.5" y1="6.5" x2="15.5" y2="6.5" />
      <circle cx="8.8" cy="11.5" r="0.4" />
      <circle cx="12" cy="11.5" r="0.4" />
      <circle cx="15.2" cy="11.5" r="0.4" />
      <circle cx="8.8" cy="15.5" r="0.4" />
      <circle cx="12" cy="15.5" r="0.4" />
      <circle cx="15.2" cy="15.5" r="0.4" />
    </svg>
  )
}

export function IconMagasins() {
  return (
    <svg {...base}>
      <path d="M3.5 9.5 L5 4 h14 l1.5 5.5" />
      <path d="M5 9.5 v10.5 h14 V9.5" />
      <path d="M10 20 v-6 h4 v6" />
    </svg>
  )
}

export function IconSaisie() {
  return (
    <svg {...base}>
      <path d="M4 17.5 L15 6.5 l2.5 2.5 L6.5 20 H4 Z" />
      <path d="M13 8.5 l2.5 2.5" />
    </svg>
  )
}

export function IconTableau() {
  return (
    <svg {...base}>
      <path d="M4 17 A 9 9 0 1 1 20 17" />
      <line x1="12" y1="15" x2="16.5" y2="10.5" />
    </svg>
  )
}

export function IconRegistre() {
  return (
    <svg {...base}>
      <path d="M3 6.5 h6 l2 2.5 h10 v10 H3 Z" />
    </svg>
  )
}

export function IconReglages() {
  return (
    <svg {...base} width={20} height={20} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5 v3 M12 18.5 v3 M2.5 12 h3 M18.5 12 h3 M5.3 5.3 l2.1 2.1 M16.6 16.6 l2.1 2.1 M18.7 5.3 l-2.1 2.1 M7.4 16.6 l-2.1 2.1" />
    </svg>
  )
}

/** Logo épi de blé — la marque Mana. */
export function LogoMana({ taille = 26, couleur = '#234F3E' }: { taille?: number; couleur?: string }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 56 56" aria-hidden>
      <g fill="none" stroke={couleur} strokeWidth={4} strokeLinecap="round">
        <path d="M28 50 V22" />
        <path d="M28 36 C19 34 15 27 15 19 C24 21 28 27 28 36" />
        <path d="M28 36 C37 34 41 27 41 19 C32 21 28 27 28 36" />
      </g>
      <circle cx="28" cy="12" r="5" fill="#D9A441" />
    </svg>
  )
}
