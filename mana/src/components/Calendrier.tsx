import type { Saisie } from '../types'
import { semainesDuMois, joursEntre } from '../lib/releves'
import { mondayOfWeek } from '../lib/iso'

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const pad2 = (n: number) => String(n).padStart(2, '0')

/** Jours couverts par les relevés (période libre, mois, ou semaine ISO). */
export function joursCouvertsParReleves(releves: Saisie[]): Set<string> {
  const out = new Set<string>()
  for (const r of releves) {
    if (r.releveDu && r.releveAu) for (const j of joursEntre(r.releveDu, r.releveAu)) out.add(j)
    else if (r.releveMois) for (const s of semainesDuMois(r.releveMois)) ajouterSemaine(out, s)
    else ajouterSemaine(out, r.semaine)
  }
  return out
}

function ajouterSemaine(out: Set<string>, semaine: string) {
  const lundi = mondayOfWeek(semaine)
  for (let i = 0; i < 7; i++) {
    const d = new Date(lundi)
    d.setUTCDate(lundi.getUTCDate() + i)
    out.add(d.toISOString().slice(0, 10))
  }
}

/**
 * Calendrier du mois : un coup d'œil pour savoir quels jours ont un bordereau
 * (point vert, nombre si plusieurs) et quels jours sont couverts par un relevé
 * de démarque (fond sable). Un jour avec bordereau sans relevé — preuve sans
 * valeur — est signalé, comme un jour couvert par un relevé sans bordereau.
 */
export function Calendrier({
  mois,
  bordereaux,
  releves,
  jourActif,
  onChoisirJour,
  onChangerMois,
}: {
  mois: string
  bordereaux: Saisie[]
  releves: Saisie[]
  jourActif: string
  onChoisirJour: (jour: string) => void
  onChangerMois: (delta: number) => void
}) {
  const [annee, m] = mois.split('-').map(Number)
  const premier = new Date(Date.UTC(annee, m - 1, 1))
  const nbJours = new Date(Date.UTC(annee, m, 0)).getUTCDate()
  const decalage = (premier.getUTCDay() + 6) % 7 // lundi = 0
  const couverts = joursCouvertsParReleves(releves)
  const parJour = new Map<string, Saisie[]>()
  for (const b of bordereaux) if (b.jour) parJour.set(b.jour, [...(parJour.get(b.jour) ?? []), b])
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const titre = premier.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const cases: (string | null)[] = [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => `${mois}-${pad2(i + 1)}`)]
  while (cases.length % 7) cases.push(null)

  const sansValeur = [...parJour.keys()].filter((j) => !couverts.has(j)).length
  const sansPreuve = [...couverts].filter((j) => j.startsWith(mois) && !parJour.has(j) && j <= aujourdhui).length

  return (
    <div className="calendrier">
      <div className="semaine-nav" style={{ marginBottom: 6 }}>
        <button className="btn btn-ghost" onClick={() => onChangerMois(-1)} aria-label="Mois précédent">‹</button>
        <div className="titre" style={{ textTransform: 'capitalize' }}>{titre}</div>
        <button className="btn btn-ghost" onClick={() => onChangerMois(1)} aria-label="Mois suivant">›</button>
      </div>
      <div className="cal-grille">
        {JOURS.map((j, i) => (
          <div key={i} className="cal-entete">{j}</div>
        ))}
        {cases.map((jour, i) => {
          if (!jour) return <div key={`v${i}`} className="cal-case vide" />
          const nb = parJour.get(jour)?.length ?? 0
          const couvert = couverts.has(jour)
          const classes = ['cal-case', couvert ? 'couvert' : '', jour === jourActif ? 'actif' : '', jour === aujourdhui ? 'auj' : '', jour > aujourdhui ? 'futur' : ''].filter(Boolean).join(' ')
          return (
            <button key={jour} type="button" className={classes} onClick={() => onChoisirJour(jour)} title={`${jour}${nb ? ` · ${nb} bordereau${nb > 1 ? 'x' : ''}` : ''}${couvert ? ' · relevé' : ''}`}>
              <span className="cal-num">{Number(jour.slice(8, 10))}</span>
              {nb > 0 && <span className="cal-point">{nb > 1 ? nb : ''}</span>}
            </button>
          )
        })}
      </div>
      <div className="cal-legende">
        <span><i className="cal-point" /> bordereau</span>
        <span><i className="cal-fond" /> relevé de démarque</span>
        {sansValeur > 0 && <span className="cal-alerte">{sansValeur} jour{sansValeur > 1 ? 's' : ''} avec bordereau sans relevé</span>}
        {sansPreuve > 0 && <span className="cal-alerte">{sansPreuve} jour{sansPreuve > 1 ? 's' : ''} sous relevé sans bordereau</span>}
      </div>
    </div>
  )
}
