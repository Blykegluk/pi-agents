import { useMemo, useState } from 'react'
import type { Magasin, ReponsePassage, Saisie } from '../types'
import { calendrierPassages, jourParis, type PassageAttendu, type StatutPassage } from '../lib/passages'

const ENTETE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS_LONGS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const pad2 = (n: number) => String(n).padStart(2, '0')

function fmtCourt(j: string): string {
  const [, m, d] = j.split('-').map(Number)
  return `${d} ${MOIS_COURT[m - 1]}`
}
function fmtLong(j: string): string {
  const [y, m, d] = j.split('-').map(Number)
  const jour = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7
  return `${JOURS_LONGS[jour]} ${d} ${MOIS_COURT[m - 1]}`
}
function moisDecale(mois: string, delta: number): string {
  const [y, m] = mois.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

const LIBELLE_STATUT: Record<StatutPassage, string> = {
  fait: 'bordereau enregistré',
  manque: 'passage manqué',
  en_attente: 'bordereau à saisir',
  a_venir: 'passage prévu',
  declare_semaine: 'semaine déclarée globalement',
}

const LIBELLE_REPONSE: Record<ReponsePassage['reponse'], string> = {
  venu_sans_don: 'venue, rien à donner',
  pas_venu: 'pas venue (confirmé)',
  bordereau_a_saisir: 'venue, bordereau à saisir',
  ferme: 'magasin fermé',
}

/** Ordre de gravité : la pastille d'un jour montre le pire de ses passages. */
const GRAVITE: Record<StatutPassage, number> = { manque: 0, en_attente: 1, a_venir: 2, declare_semaine: 3, fait: 4 }

type Reponse = ReponsePassage['reponse']

/**
 * Le mois des passages d'un magasin, au format du calendrier de Saisie : une case par jour,
 * une pastille de couleur. Vert : bordereau ; rouge : passage manqué ; ambre : bordereau à saisir ;
 * contour : passage prévu. Un jour rouge ou ambre se clique pour dire ce qui s'est passé.
 * Même calcul que la surveillance nocturne.
 */
export function CalendrierPassages({
  magasin,
  saisies,
  reponses = [],
  onReponse,
}: {
  magasin: Magasin
  saisies: Saisie[]
  reponses?: ReponsePassage[]
  onReponse?: (r: Omit<ReponsePassage, 'id' | 'le' | 'par'>) => void
}) {
  const aujourdHui = jourParis(new Date())
  const [mois, setMois] = useState(aujourdHui.slice(0, 7))
  const [ouvert, setOuvert] = useState<{ date: string; collecteur: string } | null>(null)
  const [annee, m] = mois.split('-').map(Number)
  const nbJours = new Date(Date.UTC(annee, m, 0)).getUTCDate()
  const du = `${mois}-01`
  const au = `${mois}-${pad2(nbJours)}`
  const cal = useMemo(() => calendrierPassages(magasin, saisies, { du, au, reponses }), [magasin, saisies, reponses, du, au])
  if (magasin.collecteurs.length === 0) return null

  const parJour = new Map<string, PassageAttendu[]>()
  for (const p of cal.passages) parJour.set(p.date, [...(parJour.get(p.date) ?? []), p])
  const fermes = new Set(reponses.filter((r) => r.magasinId === magasin.id && r.reponse === 'ferme').map((r) => r.date))
  const reponseDe = (date: string, collecteur: string) => reponses.find((r) => r.magasinId === magasin.id && r.date === date && r.collecteur === collecteur)

  const decalage = (new Date(Date.UTC(annee, m - 1, 1)).getUTCDay() + 6) % 7
  const cases: (string | null)[] = [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => `${mois}-${pad2(i + 1)}`)]
  while (cases.length % 7) cases.push(null)
  const titre = new Date(Date.UTC(annee, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  /** La pastille du jour et, s'il y a lieu, le passage sur lequel le magasin peut répondre. */
  function etatJour(j: string): { point: string | null; titre: string; cliquable: PassageAttendu | null } {
    const ps = [...(parJour.get(j) ?? [])].sort((a, b) => GRAVITE[a.statut] - GRAVITE[b.statut])
    const extra = cal.bordereauxParJour[j]?.length ?? 0
    const p = ps[0]
    const reponse = p?.reponse ? ` · ${LIBELLE_REPONSE[p.reponse]}` : ''
    if (p?.statut === 'manque') return { point: p.reponse === 'pas_venu' ? 'manque confirme' : 'manque', titre: `${fmtLong(j)} · ${LIBELLE_STATUT.manque}${reponse}`, cliquable: p }
    if (p?.statut === 'en_attente') return { point: 'attente', titre: `${fmtLong(j)} · ${LIBELLE_STATUT.en_attente}${reponse}`, cliquable: p }
    if (p?.statut === 'a_venir') return { point: 'prevu', titre: `${fmtLong(j)} · ${LIBELLE_STATUT.a_venir}`, cliquable: null }
    if (p?.statut === 'declare_semaine') return { point: 'declare', titre: `${fmtLong(j)} · ${LIBELLE_STATUT.declare_semaine}`, cliquable: null }
    if (p?.statut === 'fait') {
      if (p.reponse === 'venu_sans_don') return { point: 'sansdon', titre: `${fmtLong(j)} · ${LIBELLE_REPONSE.venu_sans_don}`, cliquable: p }
      return { point: '', titre: `${fmtLong(j)} · ${LIBELLE_STATUT.fait}${p.decale ? ' (à un jour près)' : ''}`, cliquable: null }
    }
    if (extra > 0) return { point: 'hors', titre: `${fmtLong(j)} · bordereau hors des jours prévus`, cliquable: null }
    if (fermes.has(j)) return { point: null, titre: `${fmtLong(j)} · magasin fermé`, cliquable: null }
    return { point: null, titre: fmtLong(j), cliquable: null }
  }

  function repondre(reponse: Reponse) {
    if (!ouvert || !onReponse) return
    onReponse({ magasinId: magasin.id, collecteur: ouvert.collecteur, date: ouvert.date, reponse })
    setOuvert(null)
  }
  const ouvertReponse = ouvert ? reponseDe(ouvert.date, ouvert.collecteur) : undefined

  return (
    <div className="calendrier calendrier-passages">
      {cal.series.map((s) => (
        <p className="muted cal-resume" key={s.collecteur}>
          {cal.series.length > 1 && <strong>{s.collecteur} · </strong>}
          {s.rythme.libelle.charAt(0).toUpperCase() + s.rythme.libelle.slice(1)}
          {s.rythme.source === 'inconnu' ? ' · précisez les jours de passage pour activer le suivi' : s.manques > 0 ? ` · ${s.manques} passage${s.manques > 1 ? 's' : ''} manqué${s.manques > 1 ? 's' : ''} d’affilée` : ''}
        </p>
      ))}
      <div className="semaine-nav" style={{ marginBottom: 6 }}>
        <button className="btn btn-ghost" onClick={() => { setMois(moisDecale(mois, -1)); setOuvert(null) }} aria-label="Mois précédent">‹</button>
        <div className="titre" style={{ textTransform: 'capitalize' }}>{titre}</div>
        <button className="btn btn-ghost" onClick={() => { setMois(moisDecale(mois, 1)); setOuvert(null) }} aria-label="Mois suivant">›</button>
      </div>
      <div className="cal-grille">
        {ENTETE.map((e, i) => (
          <div key={i} className="cal-entete">{e}</div>
        ))}
        {cases.map((j, i) => {
          if (!j) return <div key={`v${i}`} className="cal-case vide" />
          const { point, titre: t, cliquable } = etatJour(j)
          const actif = ouvert?.date === j
          const classes = ['cal-case', actif ? 'actif' : '', j === aujourdHui ? 'auj' : '', j > aujourdHui ? 'futur' : '', cliquable && onReponse ? '' : 'fixe'].filter(Boolean).join(' ')
          const contenu = (
            <>
              <span className="cal-num">{Number(j.slice(8, 10))}</span>
              {point !== null && <span className={`cal-point ${point}`} />}
            </>
          )
          return cliquable && onReponse ? (
            <button key={j} type="button" className={classes} title={t} aria-label={t} onClick={() => setOuvert(actif ? null : { date: j, collecteur: cliquable.collecteur })}>
              {contenu}
            </button>
          ) : (
            <div key={j} className={classes} title={t}>
              {contenu}
            </div>
          )
        })}
      </div>
      {ouvert && onReponse && (
        <div className="cal-reponse">
          <div>
            <strong>{fmtLong(ouvert.date)}</strong>
            <span className="muted"> · {ouvert.collecteur} · {ouvertReponse ? LIBELLE_REPONSE[ouvertReponse.reponse] : 'compté comme manqué'}</span>
          </div>
          <div className="row-actions" style={{ marginTop: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => repondre('bordereau_a_saisir')}>Venue, bordereau à saisir</button>
            <button className="btn btn-ghost btn-sm" onClick={() => repondre('venu_sans_don')}>Venue, rien à donner</button>
            <button className="btn btn-ghost btn-sm" onClick={() => repondre('pas_venu')}>Pas venue</button>
            <button className="btn btn-ghost btn-sm" onClick={() => repondre('ferme')}>Magasin fermé</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOuvert(null)}>Annuler</button>
          </div>
        </div>
      )}
      <div className="cal-legende">
        <span><i className="cal-point" /> bordereau</span>
        <span><i className="cal-point manque" /> manqué</span>
        <span><i className="cal-point attente" /> à saisir</span>
        <span><i className="cal-point prevu" /> prévu</span>
        {onReponse && <span>cliquez un jour rouge pour corriger</span>}
      </div>
      {cal.series.every((s) => s.dernierFait) && cal.series.length === 1 && (
        <p className="muted cal-resume" style={{ marginTop: 6 }}>Dernier bordereau le {fmtCourt(cal.series[0].dernierFait!)}</p>
      )}
    </div>
  )
}
