import { useMemo, useState } from 'react'
import type { Magasin, ReponsePassage, Saisie } from '../types'
import { calendrierPassages, decalerJour, fenetreSemaines, jourParis, type PassageAttendu, type StatutPassage } from '../lib/passages'

const ENTETE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS_LONGS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

function fmtCourt(j: string): string {
  const [, m, d] = j.split('-').map(Number)
  return `${d} ${MOIS_COURT[m - 1]}`
}
function fmtLong(j: string): string {
  const [y, m, d] = j.split('-').map(Number)
  const jour = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7
  return `${JOURS_LONGS[jour]} ${d} ${MOIS_COURT[m - 1]}`
}

const LIBELLE_STATUT: Record<StatutPassage, string> = {
  fait: 'bordereau enregistré',
  manque: 'passage manqué (pas de bordereau)',
  en_attente: 'passage attendu, bordereau à saisir',
  a_venir: 'passage prévu',
  declare_semaine: 'semaine déclarée globalement',
}

const LIBELLE_REPONSE: Record<ReponsePassage['reponse'], string> = {
  venu_sans_don: 'venue, rien à donner ce jour-là',
  pas_venu: 'pas venue (confirmé par le magasin)',
  bordereau_a_saisir: 'venue, bordereau à saisir',
  ferme: 'magasin fermé',
}

type Reponse = ReponsePassage['reponse']

/**
 * Les huit dernières semaines de passages d'un magasin : ce que Mana attendait
 * d'après le rythme déclaré, et ce que les bordereaux montrent. Même calcul que
 * la surveillance nocturne. Une case rouge se clique : le magasin dit ce qui
 * s'est passé, et le moteur en tient compte dès la nuit suivante.
 */
export function CalendrierPassages({
  magasin,
  saisies,
  reponses = [],
  onReponse,
  semaines = 8,
}: {
  magasin: Magasin
  saisies: Saisie[]
  reponses?: ReponsePassage[]
  onReponse?: (r: Omit<ReponsePassage, 'id' | 'le' | 'par'>) => void
  semaines?: number
}) {
  const cal = useMemo(() => calendrierPassages(magasin, saisies, { ...fenetreSemaines(semaines), reponses }), [magasin, saisies, reponses, semaines])
  const [ouvert, setOuvert] = useState<{ date: string; collecteur: string } | null>(null)
  if (magasin.collecteurs.length === 0) return null
  const aujourdHui = jourParis(new Date())

  const parJour = new Map<string, PassageAttendu[]>()
  const parPeriode = new Map<string, PassageAttendu[]>()
  for (const p of cal.passages) {
    const cible = p.periode ? parPeriode : parJour
    const cle = p.periode ? p.periode.du : p.date
    cible.set(cle, [...(cible.get(cle) ?? []), p])
  }
  const reponseDe = (date: string, collecteur: string) => reponses.find((r) => r.magasinId === magasin.id && r.date === date && r.collecteur === collecteur)
  const fermes = new Set(reponses.filter((r) => r.magasinId === magasin.id && r.reponse === 'ferme').map((r) => r.date))

  // Les semaines d'avant le premier bordereau n'ont rien à montrer : on commence à la première semaine vivante.
  const semaineVivante = (lundi: string) =>
    Array.from({ length: 7 }, (_, i) => decalerJour(lundi, i)).some((j) => parJour.has(j) || cal.bordereauxParJour[j] || fermes.has(j)) || parPeriode.has(lundi)
  const lundis: string[] = []
  for (let l = cal.du; l <= cal.au; l = decalerJour(l, 7)) if (lundis.length > 0 || semaineVivante(l)) lundis.push(l)

  function classeJour(j: string): { classe: string; titre: string; cliquable: PassageAttendu | null } {
    const ps = parJour.get(j) ?? []
    const extra = cal.bordereauxParJour[j]?.length ?? 0
    const libelle = (s: StatutPassage) => `${fmtLong(j)} · ${LIBELLE_STATUT[s]}`
    const avecReponse = (base: string, p?: PassageAttendu) => (p?.reponse ? `${base} · ${LIBELLE_REPONSE[p.reponse]}` : base)
    const manque = ps.find((p) => p.statut === 'manque')
    if (manque) return { classe: manque.reponse === 'pas_venu' ? 'manque confirme' : 'manque', titre: avecReponse(libelle('manque'), manque), cliquable: manque }
    const attente = ps.find((p) => p.statut === 'en_attente')
    if (attente) return { classe: 'en_attente', titre: avecReponse(libelle('en_attente'), attente), cliquable: attente }
    const fait = ps.find((p) => p.statut === 'fait')
    if (fait) {
      if (fait.reponse === 'venu_sans_don') return { classe: 'fait sansdon', titre: avecReponse(fmtLong(j), fait), cliquable: fait }
      return { classe: ps.every((p) => p.decale) ? 'fait decale' : 'fait', titre: libelle('fait') + (ps.some((p) => p.decale) ? ' (à un jour près)' : ''), cliquable: null }
    }
    if (ps.some((p) => p.statut === 'declare_semaine')) return { classe: 'declare', titre: libelle('declare_semaine'), cliquable: null }
    if (extra > 0) return { classe: 'fait hors', titre: `${fmtLong(j)} · bordereau enregistré hors des jours prévus`, cliquable: null }
    if (fermes.has(j)) return { classe: 'ferme', titre: `${fmtLong(j)} · magasin fermé`, cliquable: null }
    if (ps.some((p) => p.statut === 'a_venir')) return { classe: 'a_venir', titre: libelle('a_venir'), cliquable: null }
    return { classe: 'vide', titre: `${fmtLong(j)} · aucun passage prévu`, cliquable: null }
  }

  function repondre(reponse: Reponse) {
    if (!ouvert || !onReponse) return
    onReponse({ magasinId: magasin.id, collecteur: ouvert.collecteur, date: ouvert.date, reponse })
    setOuvert(null)
  }

  const ouvertReponse = ouvert ? reponseDe(ouvert.date, ouvert.collecteur) : undefined

  return (
    <div className="calendrier-passages">
      {cal.series.map((s) => (
        <p className="muted" key={s.collecteur} style={{ margin: '4px 0' }}>
          {cal.series.length > 1 && <><strong style={{ color: 'inherit' }}>{s.collecteur}</strong> · </>}
          {s.rythme.libelle.charAt(0).toUpperCase() + s.rythme.libelle.slice(1)} ·{' '}
          {s.rythme.source === 'inconnu'
            ? 'précisez les jours de passage pour activer le suivi.'
            : s.manques > 0
              ? `${s.manques} passage${s.manques > 1 ? 's' : ''} manqué${s.manques > 1 ? 's' : ''} d'affilée`
              : s.dernierFait
                ? `dernier bordereau le ${fmtCourt(s.dernierFait)}`
                : 'aucun bordereau depuis 8 semaines'}
        </p>
      ))}
      <div className={`cal-grille${parPeriode.size > 0 ? ' avec-compte' : ''}`} aria-label="Calendrier des passages des huit dernières semaines">
        {ENTETE.map((e, i) => (
          <span className="cal-entete" key={i}>{e}</span>
        ))}
        {parPeriode.size > 0 && <span />}
        {lundis.map((lundi, li) => {
          const periodes = parPeriode.get(lundi) ?? []
          return [
            ...Array.from({ length: 7 }, (_, i) => {
              const j = decalerJour(lundi, i)
              const { classe, titre, cliquable } = classeJour(j)
              const actif = ouvert?.date === j
              const numero = Number(j.slice(8, 10))
              // Le mois s'affiche sur la toute première case et à chaque 1er du mois.
              const etiquette = li === 0 && i === 0 ? fmtCourt(j) : numero === 1 ? fmtCourt(j) : String(numero)
              const commun = { className: `cal-case ${classe}${j === aujourdHui ? ' aujourdhui' : ''}${actif ? ' actif' : ''}${etiquette.length > 2 ? ' mois' : ''}`, title: titre, key: j }
              return cliquable && onReponse ? (
                <button type="button" {...commun} aria-label={titre} onClick={() => setOuvert(actif ? null : { date: j, collecteur: cliquable.collecteur })}>{etiquette}</button>
              ) : (
                <span {...commun}>{etiquette}</span>
              )
            }),
            ...(parPeriode.size > 0
              ? [
                  <span className="cal-compte" key={`${lundi}-c`}>
                    {periodes.map((p) => (
                      <span className={`cal-pastille ${p.statut}`} key={p.collecteur} title={`${p.collecteur} · ${p.periode!.faits}/${p.periode!.attendus} passage(s) sur la période`}>
                        {p.periode!.faits}/{p.periode!.attendus}
                      </span>
                    ))}
                  </span>,
                ]
              : []),
          ]
        })}
      </div>
      {ouvert && onReponse && (
        <div className="cal-reponse">
          <div>
            <strong>{fmtLong(ouvert.date)} · {ouvert.collecteur}</strong>
            <span className="muted"> · {ouvertReponse ? LIBELLE_REPONSE[ouvertReponse.reponse] : 'compté comme manqué'}</span>
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
        <span className="fait">bordereau</span>
        <span className="manque">passage manqué</span>
        <span className="en_attente">à saisir</span>
        <span className="a_venir">prévu</span>
        {onReponse && <span className="clic">cliquez une case rouge pour corriger</span>}
      </div>
    </div>
  )
}
