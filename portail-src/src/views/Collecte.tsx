import { useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState, Magasin, Societe } from '../types'
import { RESEAUX_COLLECTEURS, recommanderFrequence } from '../lib/annuaire'
import { pdfAfficheTri, pdfBordereau } from '../lib/pdf'
import { IconBalance, IconCagette, IconDrapeau, IconMagasins, IconRelation, IconTri } from '../components/Icons'
import { AssociationsMagasin, useDemandes } from '../components/AssociationsMagasin'
import { denomination } from '../lib/identite'

/**
 * Mise en place de la collecte d'un nouveau magasin, en cinq étapes. Une fois tout en place, on
 * n'y revient plus : les associations se gèrent dans la carte Associations, et le guide de
 * l'équipe (tri, pesée, bordereaux) reste accessible depuis la fiche du magasin.
 */

const ETAPES = [
  { id: 'gisement', titre: 'Estimer vos invendus' },
  { id: 'collecteurs', titre: 'Trouver votre association' },
  { id: 'tri', titre: 'Former l’équipe au tri' },
  { id: 'pesee', titre: 'Organiser la pesée' },
  { id: 'premiere', titre: 'Réussir la première collecte' },
] as const

/** Avancement de la mise en place d'un magasin, pour l'afficher sur sa fiche. */
export function avancementCollecte(m: Magasin): { faites: number; total: number } {
  const faites = m.miseEnPlace?.faites ?? []
  const n = ETAPES.filter((e) => (e.id === 'collecteurs' ? m.collecteurs.length > 0 || faites.includes(e.id) : faites.includes(e.id))).length
  return { faites: n, total: ETAPES.length }
}

const PICTOS: Record<string, ReactNode> = {
  gisement: <IconCagette />,
  collecteurs: <IconRelation />,
  tri: <IconTri />,
  pesee: <IconBalance />,
  premiere: <IconDrapeau />,
}

/** Ce qui se donne et ce qui ne se donne jamais : la règle à afficher en réserve. */
const REGLES_TRI: [string, string, string][] = [
  ['DLC du jour, de demain, d’après-demain', 'donnable', 'badge vert'],
  ['DDM dépassée', 'donnable', 'badge vert'],
  ['F&L abîmés mais sains, pain de la veille', 'donnable', 'badge vert'],
  ['DLC dépassée, entamé, froid rompu, alcool', 'jamais', 'badge alerte'],
]

/** En-tête de la mise en place : titre et avancement. */
export function EnteteCollecte({ magasin, titre }: { magasin: Magasin; titre?: string }) {
  const nbFaites = avancementCollecte(magasin).faites
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{titre ?? magasin.nom}</h3>
        <span className="muted">{nbFaites}/{ETAPES.length}</span>
      </div>
      <div className="progress">
        <div style={{ width: `${(nbFaites / ETAPES.length) * 100}%` }} />
      </div>
      {nbFaites === ETAPES.length && (
        <div className="info-banner vert" style={{ marginTop: 12, marginBottom: 0 }}>
          <strong>Collecte en place.</strong> Il ne reste qu’à saisir les bordereaux.
        </div>
      )}
    </>
  )
}

/**
 * Guide de l'équipe : le tri, la pesée, le passage. Ce qu'on garde sous la main une fois la
 * collecte en place, pour former un nouveau venu.
 */
export function GuideEquipe({ magasin, societe }: { magasin: Magasin; societe: Societe | undefined }) {
  return (
    <div className="guide-equipe">
      <div>
        <h4>Le tri</h4>
        <div className="detail-lignes">
          {REGLES_TRI.map(([quoi, verdict, classe]) => (
            <div className="ligne" key={quoi}><span>{quoi}</span><span className={classe}>{verdict}</span></div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => pdfAfficheTri(magasin.nom)}>⬇ Affiche « bac don »</button>
      </div>
      <div>
        <h4>La pesée</h4>
        <ul className="guide-liste">
          <li>Emballés : on compte les colis, rien à peser.</li>
          <li>Fruits &amp; légumes : on pèse, moins la tare (≈ 1 kg par cagette bois).</li>
          <li>Le total va sur le bordereau, que l’association signe.</li>
        </ul>
        {societe && <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => pdfBordereau(magasin, denomination(societe))}>⬇ Bordereaux vierges</button>}
      </div>
      <div>
        <h4>À chaque passage</h4>
        <ul className="guide-liste">
          <li>Le bac « don » est prêt, au froid pour le frais.</li>
          <li>Bordereau rempli et signé des deux côtés.</li>
          <li>Photo du bordereau, puis saisie dans Mana.</li>
        </ul>
      </div>
    </div>
  )
}

export function Collecte({
  state,
  session,
  onSaveMagasin,
  onAllerSaisie,
  onConnexion,
  onOuvrirMessages,
  magasinIdFixe,
  sansEntete = false,
}: {
  state: AppState
  session: Session | null
  onSaveMagasin: (m: Magasin) => void
  onAllerSaisie: () => void
  onConnexion: () => void
  onOuvrirAide?: () => void
  onOuvrirMessages: () => void
  /** Intégré dans la fiche d'un magasin : ce magasin, sans titre ni sélecteur. */
  magasinIdFixe?: string
  /** La carte d'en-tête (nom, avancement) est rendue par le parent — voir `EnteteCollecte`. */
  sansEntete?: boolean
}) {
  const [magasinChoisi, setMagasinId] = useState(state.magasins[0]?.id ?? '')
  const magasinId = magasinIdFixe ?? magasinChoisi
  const magasin = state.magasins.find((m) => m.id === magasinId) ?? state.magasins[0]
  const societe = state.societes.find((s) => s.id === magasin?.societeId)
  const [invendusSaisis, setInvendusSaisis] = useState('')
  const { demandes, derniers, recharger } = useDemandes(session)

  if (!magasin || !societe) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconMagasins />
        </span>
        Créez d’abord votre société et votre magasin dans l’onglet Magasins.
      </div>
    )
  }

  const mp = magasin.miseEnPlace ?? { faites: [] }
  const kgJour = mp.gisementKgJour ?? (Number(invendusSaisis) || 0)
  const reco = kgJour > 0 ? recommanderFrequence(kgJour) : null

  // L'étape « association » est acquise dès qu'une association est enregistrée.
  const estFaite = (id: string) => (id === 'collecteurs' ? magasin.collecteurs.length > 0 || mp.faites.includes(id) : mp.faites.includes(id))
  function basculer(id: string) {
    if (!magasin) return
    const faites = mp.faites.includes(id) ? mp.faites.filter((f) => f !== id) : [...mp.faites, id]
    onSaveMagasin({ ...magasin, miseEnPlace: { ...mp, faites } })
  }
  function enregistrerInvendus() {
    if (!magasin) return
    const kg = Number(invendusSaisis) || 0
    if (kg <= 0) return
    const faites = mp.faites.includes('gisement') ? mp.faites : [...mp.faites, 'gisement']
    onSaveMagasin({ ...magasin, miseEnPlace: { faites, gisementKgJour: kg } })
  }

  function TeteEtape({ id, num, action }: { id: (typeof ETAPES)[number]['id']; num: number; action?: ReactNode }) {
    const faite = estFaite(id)
    return (
      <div className="etape-tete">
        <span className="etape-pic">{PICTOS[id]}</span>
        <div className="etape-titres">
          <span className="num">Étape {num}</span>
          <h3>{ETAPES[num - 1].titre}</h3>
        </div>
        {action ?? (
          <button className={`btn btn-sm ${faite ? 'btn-primary' : 'btn-ghost'}`} onClick={() => basculer(id)} style={{ flex: 'none' }}>
            {faite ? '✓ Fait' : 'Marquer fait'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      {!magasinIdFixe && <h2>Mettre en place ma collecte</h2>}
      {!magasinIdFixe && state.magasins.length > 1 && (
        <div className="chips">
          {state.magasins.map((m) => (
            <button key={m.id} className={`chip ${m.id === magasin.id ? 'active' : ''}`} onClick={() => setMagasinId(m.id)}>
              {m.nom}
            </button>
          ))}
        </div>
      )}

      <div className={`etapes ${sansEntete ? 'sans-entete' : ''}`}>
        {!sansEntete && (
          <div className="card">
            <EnteteCollecte magasin={magasin} />
          </div>
        )}

        <div className={`card ${estFaite('gisement') ? 'faite' : ''}`}>
          <TeteEtape id="gisement" num={1} />
          <p className="muted">Ce qui part à la poubelle alors que c’est encore bon. Une cagette de F&amp;L pleine ≈ 8 à 10 kg.</p>
          <div className="range-row">
            <div className="suffixe champ-large">
              <input type="number" inputMode="decimal" min={0} step={1} value={invendusSaisis || (mp.gisementKgJour ?? '')} onChange={(e) => setInvendusSaisis(e.target.value)} placeholder="Ex. 12" />
              <em>kg/jour</em>
            </div>
            <button className="btn btn-primary btn-sm" onClick={enregistrerInvendus}>Valider</button>
          </div>
          {reco && (
            <div className="info-banner" style={{ marginTop: 10, marginBottom: 0 }}>
              <strong>{reco.titre}.</strong> {reco.conseil}
            </div>
          )}
        </div>

        <div className={`card pleine ${estFaite('collecteurs') ? 'faite' : ''}`}>
          <TeteEtape
            id="collecteurs"
            num={2}
            action={magasin.collecteurs.length > 0 ? <span className="verif-badge">✓ {magasin.collecteurs.length} association{magasin.collecteurs.length > 1 ? 's' : ''}</span> : undefined}
          />
          <AssociationsMagasin
            magasin={magasin}
            societe={societe}
            session={session}
            saisies={state.saisies}
            reponses={state.reponsesPassages ?? []}
            demandes={demandes}
            derniers={derniers}
            onSaveMagasin={onSaveMagasin}
            onDemandeEnvoyee={recharger}
            onConnexion={onConnexion}
            onOuvrirMessages={onOuvrirMessages}
            sansCalendrier
          />
          <details style={{ marginTop: 12 }}>
            <summary style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--encre-2)' }}>Chercher vous-même : les grands réseaux</summary>
            <div className="reseaux" style={{ marginTop: 8 }}>
              {RESEAUX_COLLECTEURS.map((r) => (
                <div className="reseau" key={r.nom}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 15 }}>{r.nom}</strong>
                    <span className="muted" style={{ whiteSpace: 'nowrap' }}>{r.site}</span>
                  </div>
                  <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                    <span><strong>Rythme :</strong> {r.rythme}</span>
                    <span><strong>Contact :</strong> {r.commentContacter}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>

        <div className={`card ${estFaite('tri') ? 'faite' : ''}`}>
          <TeteEtape id="tri" num={3} />
          <div className="detail-lignes">
            {REGLES_TRI.map(([quoi, verdict, classe]) => (
              <div className="ligne" key={quoi}><span>{quoi}</span><span className={classe}>{verdict}</span></div>
            ))}
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => pdfAfficheTri(magasin.nom)}>⬇ Affiche « bac don » pour la réserve</button>
        </div>

        <div className={`card ${estFaite('pesee') ? 'faite' : ''}`}>
          <TeteEtape id="pesee" num={4} />
          <ul className="guide-liste">
            <li>Emballés : on compte les colis, rien à peser.</li>
            <li>Fruits &amp; légumes : on pèse, moins la tare (≈ 1 kg par cagette bois).</li>
            <li>Le total va sur le bordereau, que l’association signe.</li>
          </ul>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => pdfBordereau(magasin, denomination(societe))}>⬇ Bordereaux vierges</button>
        </div>

        <div className={`card ${estFaite('premiere') ? 'faite' : ''}`}>
          <TeteEtape id="premiere" num={5} />
          <ul className="guide-liste">
            <li>Bac « don » en réserve, au froid pour le frais.</li>
            <li>L’équipe connaît la règle : jamais de DLC dépassée.</li>
            <li>Bordereaux imprimés, balance repérée.</li>
          </ul>
          <button className="btn btn-ambre btn-block" style={{ marginTop: 12 }} onClick={onAllerSaisie}>Faire ma première saisie</button>
        </div>
      </div>
    </div>
  )
}
