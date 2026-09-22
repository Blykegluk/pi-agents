import type { Collecteur, Saisie } from '../types'
import { semainesDuMois, joursEntre } from '../lib/releves'
import { mondayOfWeek } from '../lib/iso'

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const NOMS_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const pad2 = (n: number) => String(n).padStart(2, '0')

/** Jour de semaine ISO (0 = lundi … 6 = dimanche) d'une date AAAA-MM-JJ. */
const jourSemaine = (jour: string) => (new Date(jour + 'T00:00:00Z').getUTCDay() + 6) % 7

/**
 * Jours de la semaine où un passage est prévu, d'après les fiches des
 * associations (« du lundi au samedi », « 7j/7 », « mardi et vendredi »…).
 * Retourne null quand on ne sait pas : on compte alors tous les jours.
 */
export function joursDePassage(collecteurs: Collecteur[]): Set<number> | null {
  const out = new Set<number>()
  let connu = false
  for (const c of collecteurs) {
    const texte = (c.jours ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (/7\s*j|tous les jours|chaque jour|quotidien/.test(texte)) {
      for (let i = 0; i < 7; i++) out.add(i)
      connu = true
      continue
    }
    const trouves = NOMS_JOURS.map((n, i) => (texte.includes(n) ? i : -1)).filter((i) => i >= 0)
    const plage = texte.match(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*(?:au|a|-|–|→|jusqu'au)\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/)
    if (plage) {
      const a = NOMS_JOURS.indexOf(plage[1])
      const b = NOMS_JOURS.indexOf(plage[2])
      for (let i = a; i !== (b + 1) % 7; i = (i + 1) % 7) out.add(i)
      connu = true
    } else if (trouves.length > 0) {
      for (const i of trouves) out.add(i)
      connu = true
    } else if (c.frequence === 'Quotidienne') {
      for (let i = 0; i < 6; i++) out.add(i) // du lundi au samedi, faute de précision
      connu = true
    }
  }
  return connu ? out : null
}

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
  collecteurs = [],
}: {
  mois: string
  bordereaux: Saisie[]
  releves: Saisie[]
  jourActif: string
  onChoisirJour: (jour: string) => void
  onChangerMois: (delta: number) => void
  collecteurs?: Collecteur[]
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

  // Jours attendus : ceux où une association passe (si on le sait), déjà écoulés, dans le mois affiché.
  const passages = joursDePassage(collecteurs)
  const attendu = (j: string) => j.startsWith(mois) && j <= aujourdhui && (!passages || passages.has(jourSemaine(j)))
  const joursSansValeur = [...parJour.keys()].filter((j) => j.startsWith(mois) && !couverts.has(j)).sort()
  const joursSansPreuve = [...couverts].filter((j) => attendu(j) && !parJour.has(j)).sort()
  const sansValeur = joursSansValeur.length
  const sansPreuve = joursSansPreuve.length
  const joursPasses = passages ? [...passages].sort().map((i) => NOMS_JOURS[i]) : null
  const libelleCourt = (j: string) => new Date(j + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
  /** Le relevé qui couvre un jour donné, pour dire d'où vient la valeur déclarée. */
  const releveDuJour = (j: string) => releves.find((r) => joursCouvertsParReleves([r]).has(j))
  const periodeReleve = (r: Saisie | undefined) => {
    if (!r) return 'un relevé'
    if (r.releveDu && r.releveAu) return `le relevé du ${libelleCourt(r.releveDu)} au ${libelleCourt(r.releveAu)}`
    if (r.releveMois) return `le relevé du mois ${r.releveMois}`
    return `le relevé de la ${r.semaine}`
  }
  const Jours = ({ liste }: { liste: string[] }) => (
    <span className="cal-jours">
      {liste.map((j) => (
        <button key={j} type="button" className="cal-jour-lien" onClick={() => onChoisirJour(j)} title={`Ouvrir le ${libelleCourt(j)}`}>
          {libelleCourt(j)}
        </button>
      ))}
    </span>
  )

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
        <span><i className="cal-point" /> bordereau signé enregistré ce jour (la preuve du passage)</span>
        <span><i className="cal-fond" /> jour couvert par un relevé de démarque (la valeur déclarée)</span>
      </div>
      {(sansValeur > 0 || sansPreuve > 0) && (
        <div className="cal-alertes">
          {sansPreuve > 0 && (
            <p>
              <strong>{sansPreuve} jour{sansPreuve > 1 ? 's' : ''} sans bordereau signé alors que {periodeReleve(releveDuJour(joursSansPreuve[0]))} y déclare une valeur.</strong>{' '}
              Le relevé donne le montant des dons de ces jours, mais aucun bordereau (la preuve que l’association est passée) n’y est enregistré :{' '}
              <Jours liste={joursSansPreuve} />
              Cliquez un jour pour y ajouter son bordereau. Si l’association n’est pas passée ce jour-là, il n’y a rien à faire.
              {joursPasses && <> Seuls les jours de passage prévus sont comptés ({joursPasses.join(', ')}).</>}
            </p>
          )}
          {sansValeur > 0 && (
            <p>
              <strong>{sansValeur} jour{sansValeur > 1 ? 's' : ''} avec bordereau signé sans relevé de démarque.</strong>{' '}
              Le passage est prouvé mais sa valeur n’est pas encore déclarée : <Jours liste={joursSansValeur} />
              Enregistrez le relevé de la période dans la carte « Relevé de démarque » ci-dessous.
            </p>
          )}
        </div>
      )}
      {sansValeur === 0 && sansPreuve === 0 && (parJour.size > 0 || couverts.size > 0) && (
        <p className="muted cal-ok">Preuves et valeurs se recoupent sur ce mois : rien à signaler.</p>
      )}
    </div>
  )
}
