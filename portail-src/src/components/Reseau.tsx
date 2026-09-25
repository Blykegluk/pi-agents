import { useMemo } from 'react'
import type { AppState } from '../types'
import { santeReseau, type SanteMagasin } from '../lib/reseau'
import { LIBELLES_NIVEAU } from '../lib/signaux'
import { fmtEUR } from '../lib/format'

const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const fmtJ = (j: string) => `${Number(j.slice(8, 10))} ${MOIS_COURT[Number(j.slice(5, 7)) - 1]}`
const fmtMois = (m: string) => MOIS_LONG[Number(m.slice(5, 7)) - 1]

function Semaine({ s }: { s: SanteMagasin['semaine'] }) {
  if (s.attendus === 0) return <span className="muted">—</span>
  return (
    <span title={`${s.faits} fait(s), ${s.manques} manqué(s), ${s.enAttente} à saisir, ${s.aVenir} à venir`}>
      <strong>{s.faits}</strong>/{s.attendus}
      {s.manques > 0 && <span className="badge alerte" style={{ marginLeft: 6 }}>{s.manques} manqué{s.manques > 1 ? 's' : ''}</span>}
      {s.enAttente > 0 && <span className="badge" style={{ marginLeft: 6 }}>{s.enAttente} à saisir</span>}
    </span>
  )
}

/**
 * Santé du réseau : un magasin par ligne, les plus fragiles d'abord. Même calcul
 * que la surveillance nocturne. `compact` : sans les tuiles, pour la console.
 */
export function Reseau({ state, compact = false, onOuvrirMagasin }: { state: AppState; compact?: boolean; onOuvrirMagasin?: (magasinId: string) => void }) {
  const sante = useMemo(() => santeReseau(state), [state])
  if (sante.magasins.length === 0) return null
  const t = sante.totaux

  return (
    <div className={`card reseau${compact ? ' compact' : ''}`}>
      {!compact && (
        <>
          <h3>Réseau — santé des collectes</h3>
          <p className="muted" style={{ margin: '2px 0 10px' }}>Cette semaine, magasin par magasin. Ceux à surveiller en tête.</p>
          <div className="impact reseau-tuiles">
            <div className="tuile">
              <strong>{t.enCollecte}<span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>/{t.magasins}</span></strong>
              <span>magasin{t.magasins > 1 ? 's' : ''} en collecte</span>
            </div>
            <div className="tuile">
              <strong>{t.passagesSemaine.faits}<span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>/{t.passagesSemaine.attendus}</span></strong>
              <span>passages cette semaine</span>
            </div>
            <div className="tuile">
              <strong style={{ color: t.enAlerte ? 'var(--rouge)' : undefined }}>{t.enAlerte}</strong>
              <span>en alerte{t.aSuivre ? ` · ${t.aSuivre} à suivre` : ''}</span>
            </div>
            <div className="tuile">
              <strong style={{ color: t.relevesManquants ? 'var(--ambre-texte)' : undefined }}>{t.relevesManquants}</strong>
              <span>relevé{t.relevesManquants > 1 ? 's' : ''} manquant{t.relevesManquants > 1 ? 's' : ''}</span>
            </div>
          </div>
        </>
      )}
      <div className="table-scroll">
        <table className="reseau-table">
          <thead>
            <tr>
              <th>Magasin</th>
              <th>Cette semaine</th>
              <th>Sans bordereau d’affilée</th>
              <th>Dernier bordereau</th>
              <th>Relevé mois précédent</th>
              <th>Base du mois</th>
              <th>Signaux</th>
            </tr>
          </thead>
          <tbody>
            {sante.magasins.map((s) => {
              const pire = s.signaux[0]
              return (
                <tr key={s.magasin.id} className={pire ? `niveau-${pire.niveau}` : ''}>
                  <td>
                    {onOuvrirMagasin ? (
                      <button type="button" className="lien" onClick={() => onOuvrirMagasin(s.magasin.id)}>{s.magasin.nom}</button>
                    ) : (
                      <strong>{s.magasin.nom}</strong>
                    )}
                    {s.societe && sante.magasins.some((x) => x.societe?.id !== s.societe?.id) && <small className="muted"> · {s.societe.raisonSociale}</small>}
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {s.rythmes.length ? s.rythmes.map((r) => `${r.collecteur} · ${r.libelle}`).join(' ; ') : 'aucune association'}
                    </div>
                  </td>
                  <td>{s.enCollecte ? <Semaine s={s.semaine} /> : <span className="muted">collecte non démarrée</span>}</td>
                  <td>
                    {s.serie ? (
                      <span className={s.serie.manques >= 3 ? 'badge alerte' : 'badge'} title={s.serie.dates.map(fmtJ).join(', ')}>
                        {s.serie.manques}{s.serie.confirmes ? ` (${s.serie.confirmes} confirmé${s.serie.confirmes > 1 ? 's' : ''})` : ''} · {s.serie.collecteur}
                      </span>
                    ) : (
                      <span className="muted">aucun</span>
                    )}
                  </td>
                  <td>{s.dernierBordereau ? fmtJ(s.dernierBordereau) : <span className="muted">—</span>}</td>
                  <td>
                    {s.releve.etat === 'ok' && s.releve.mois && <span className="badge vert">{fmtMois(s.releve.mois)} reçu</span>}
                    {s.releve.etat === 'manquant' && s.releve.mois && <span className="badge alerte">{fmtMois(s.releve.mois)} manquant</span>}
                    {s.releve.etat === 'sans_objet' && <span className="muted">—</span>}
                  </td>
                  <td>{s.baseMois > 0 ? fmtEUR(s.baseMois) : <span className="muted">—</span>}</td>
                  <td>
                    {s.signaux.length === 0 ? (
                      <span className="badge vert">rien à signaler</span>
                    ) : (
                      s.signaux.slice(0, 3).map((sg) => (
                        <div key={sg.cle} style={{ marginBottom: 3 }}>
                          <span className={LIBELLES_NIVEAU[sg.niveau].classe} style={{ marginRight: 6 }}>{LIBELLES_NIVEAU[sg.niveau].texte}</span>
                          <small>{sg.titre.replace(` · ${s.magasin.nom}`, '').replace(` · ${s.societe?.raisonSociale ?? ''}`, '')}</small>
                        </div>
                      ))
                    )}
                    {s.signaux.length > 3 && <small className="muted">+ {s.signaux.length - 3}</small>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!compact && (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>3 passages manqués d’affilée : Mana prend la main.</p>
      )}
    </div>
  )
}
