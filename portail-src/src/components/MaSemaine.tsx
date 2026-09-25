import { useMemo } from 'react'
import type { AppState } from '../types'
import { aFaire } from '../lib/reseau'

const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function fmtJ(j: string): string {
  const [y, m, d] = j.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7
  return `${JOURS[js]} ${d} ${MOIS_COURT[m - 1]}`
}

/**
 * Le responsable de magasin ouvre Saisie : ce qu'il a à faire aujourd'hui, en
 * trois lignes par magasin. Rien à faire ? La carte le dit et ne s'étale pas.
 */
export function MaSemaine({ state, onAllerAssociations }: { state: AppState; onAllerAssociations: () => void }) {
  const liste = useMemo(() => aFaire(state), [state])
  const actifs = liste.filter((l) => l.magasin.collecteurs.length > 0)
  if (actifs.length === 0) return null
  const rienAFaire = actifs.every((l) => l.aujourdHui.length === 0 && l.aSaisir.length === 0 && l.sansBordereau.length === 0 && !l.releveManquant)

  return (
    <div className="card ma-semaine">
      <h3>Aujourd’hui</h3>
      {rienAFaire ? (
        <p className="muted" style={{ margin: '2px 0 0' }}>Rien à faire aujourd’hui.</p>
      ) : (
        actifs.map((l) => (
          <div key={l.magasin.id} style={{ marginTop: 6 }}>
            {actifs.length > 1 && <strong style={{ fontSize: 13.5 }}>{l.magasin.nom}</strong>}
            <ul className="ma-semaine-liste">
              {l.aujourdHui.map((p, i) => (
                <li key={`a${i}`}>
                  <span className="pastille-jour prevu" /> Passage prévu : <strong>{p.collecteur}</strong>{p.creneau ? `, ${p.creneau.toLowerCase()}` : ''}.
                </li>
              ))}
              {l.aSaisir.length > 0 && (
                <li>
                  <span className="pastille-jour attente" /> Bordereau à saisir : {l.aSaisir.map(fmtJ).join(', ')}
                </li>
              )}
              {l.sansBordereau.map((s) => (
                <li key={s.collecteur}>
                  <span className="pastille-jour manque" /> Passages manqués : {s.dates.slice(-4).map(fmtJ).join(', ')} ({s.collecteur}){' '}
                  <button type="button" className="lien" onClick={onAllerAssociations}>L’association est venue ? Corriger</button>
                </li>
              ))}
              {l.releveManquant && (
                <li>
                  <span className="pastille-jour attente" /> Relevé de démarque de {MOIS_LONG[Number(l.releveManquant.slice(5, 7)) - 1]} à enregistrer (carte « Relevé de démarque » ci-dessous).
                </li>
              )}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
