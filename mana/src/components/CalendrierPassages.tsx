import { useMemo } from 'react'
import type { Magasin, Saisie } from '../types'
import { calendrierPassages, decalerJour, fenetreSemaines, jourParis, type PassageAttendu, type StatutPassage } from '../lib/passages'

const ENTETE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function fmtCourt(j: string): string {
  const [, m, d] = j.split('-').map(Number)
  return `${d} ${MOIS_COURT[m - 1]}`
}

const LIBELLE_STATUT: Record<StatutPassage, string> = {
  fait: 'bordereau enregistré',
  manque: 'passage attendu, pas de bordereau',
  en_attente: 'passage attendu, bordereau à saisir (moins de 24 h)',
  a_venir: 'passage prévu',
  declare_semaine: 'semaine déclarée globalement',
}

/**
 * Les huit dernières semaines de passages d'un magasin : ce que Mana attendait
 * d'après le rythme déclaré, et ce que les bordereaux montrent. Même calcul que
 * la surveillance nocturne, affiché au magasin pour qu'il voie ce que Mana voit.
 */
export function CalendrierPassages({ magasin, saisies, semaines = 8 }: { magasin: Magasin; saisies: Saisie[]; semaines?: number }) {
  const cal = useMemo(() => calendrierPassages(magasin, saisies, fenetreSemaines(semaines)), [magasin, saisies, semaines])
  if (magasin.collecteurs.length === 0) return null
  const aujourdHui = jourParis(new Date())

  const parJour = new Map<string, PassageAttendu[]>()
  const parPeriode = new Map<string, PassageAttendu[]>()
  for (const p of cal.passages) {
    const cible = p.periode ? parPeriode : parJour
    const cle = p.periode ? p.periode.du : p.date
    cible.set(cle, [...(cible.get(cle) ?? []), p])
  }
  // Les semaines d'avant le premier bordereau n'ont rien à montrer : on commence à la première semaine vivante.
  const semaineVivante = (lundi: string) =>
    Array.from({ length: 7 }, (_, i) => decalerJour(lundi, i)).some((j) => parJour.has(j) || cal.bordereauxParJour[j]) || parPeriode.has(lundi)
  const lundis: string[] = []
  for (let l = cal.du; l <= cal.au; l = decalerJour(l, 7)) if (lundis.length > 0 || semaineVivante(l)) lundis.push(l)

  function classeJour(j: string): { classe: string; titre: string } {
    const ps = parJour.get(j) ?? []
    const extra = cal.bordereauxParJour[j]?.length ?? 0
    const libelle = (s: StatutPassage) => `${fmtCourt(j)} · ${LIBELLE_STATUT[s]}`
    if (ps.some((p) => p.statut === 'manque')) return { classe: 'manque', titre: libelle('manque') }
    if (ps.some((p) => p.statut === 'en_attente')) return { classe: 'en_attente', titre: libelle('en_attente') }
    if (ps.some((p) => p.statut === 'fait')) return { classe: ps.every((p) => p.decale) ? 'fait decale' : 'fait', titre: libelle('fait') + (ps.some((p) => p.decale) ? ' (à un jour près)' : '') }
    if (ps.some((p) => p.statut === 'declare_semaine')) return { classe: 'declare', titre: libelle('declare_semaine') }
    if (extra > 0) return { classe: 'fait hors', titre: `${fmtCourt(j)} · bordereau enregistré hors des jours prévus` }
    if (ps.some((p) => p.statut === 'a_venir')) return { classe: 'a_venir', titre: libelle('a_venir') }
    return { classe: 'vide', titre: `${fmtCourt(j)} · aucun passage prévu` }
  }

  return (
    <div className="calendrier-passages">
      {cal.series.map((s) => (
        <p className="muted" key={s.collecteur} style={{ margin: '4px 0' }}>
          <strong style={{ color: 'inherit' }}>{s.collecteur}</strong> · Mana comprend : {s.rythme.libelle}.{' '}
          {s.rythme.source === 'inconnu'
            ? 'Précisez les jours et le créneau pour que Mana surveille les passages.'
            : s.manques > 0
              ? `${s.manques} passage${s.manques > 1 ? 's' : ''} sans bordereau d'affilée (${s.dates.slice(-3).map(fmtCourt).join(', ')}).`
              : s.dernierFait
                ? `Dernier bordereau le ${fmtCourt(s.dernierFait)}.`
                : 'Aucun bordereau sur les huit dernières semaines.'}
        </p>
      ))}
      <div className="cal-grille" role="img" aria-label="Calendrier des passages des huit dernières semaines">
        <span />
        {ENTETE.map((e, i) => (
          <span className="cal-entete" key={i}>{e}</span>
        ))}
        <span />
        {lundis.map((lundi) => {
          const periodes = parPeriode.get(lundi) ?? []
          return [
            <span className="cal-semaine" key={`${lundi}-s`}>{fmtCourt(lundi)}</span>,
            ...Array.from({ length: 7 }, (_, i) => {
              const j = decalerJour(lundi, i)
              const { classe, titre } = classeJour(j)
              return <span className={`cal-case ${classe}${j === aujourdHui ? ' aujourdhui' : ''}`} title={titre} key={j} />
            }),
            <span className="cal-compte" key={`${lundi}-c`}>
              {periodes.map((p) => (
                <span className={`cal-pastille ${p.statut}`} key={p.collecteur} title={`${p.collecteur} · ${p.periode!.faits}/${p.periode!.attendus} passage(s) sur la période`}>
                  {p.periode!.faits}/{p.periode!.attendus}
                </span>
              ))}
            </span>,
          ]
        })}
      </div>
      <div className="cal-legende">
        <span className="fait">bordereau</span>
        <span className="manque">passage sans bordereau</span>
        <span className="en_attente">à saisir</span>
        <span className="a_venir">prévu</span>
      </div>
    </div>
  )
}
