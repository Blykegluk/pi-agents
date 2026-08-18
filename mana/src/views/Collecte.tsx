import { useState } from 'react'
import type { AppState, Magasin } from '../types'
import { RESEAUX_COLLECTEURS, recommanderFrequence } from '../lib/annuaire'
import { pdfAfficheTri, pdfBordereau } from '../lib/pdf'
import { IconMagasins } from '../components/Icons'

/**
 * Mise en place de la collecte — l'accompagnement pas à pas pour un magasin
 * qui n'a encore rien en place : gisement, choix des associations, calendrier,
 * tri, pesée, première collecte. (Spec §4.7 : liste indicative en dur, pas de
 * matching automatique — le magasin garde sa relation directe avec son collecteur.)
 */

const ETAPES = [
  { id: 'gisement', titre: 'Estimer votre gisement' },
  { id: 'collecteurs', titre: 'Choisir votre ou vos associations' },
  { id: 'calendrier', titre: 'Caler le calendrier de passage' },
  { id: 'tri', titre: 'Former l’équipe au tri' },
  { id: 'pesee', titre: 'Organiser la pesée et les bordereaux' },
  { id: 'premiere', titre: 'Réussir la première collecte' },
] as const

export function Collecte({
  state,
  onSaveMagasin,
  onAllerSaisie,
}: {
  state: AppState
  onSaveMagasin: (m: Magasin) => void
  onAllerSaisie: () => void
}) {
  const [magasinId, setMagasinId] = useState(state.magasins[0]?.id ?? '')
  const magasin = state.magasins.find((m) => m.id === magasinId) ?? state.magasins[0]
  const societe = state.societes.find((s) => s.id === magasin?.societeId)
  const [gisementSaisi, setGisementSaisi] = useState('')
  const [nouveau, setNouveau] = useState({ nom: '', contact: '', jours: '' })

  if (!magasin || !societe) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconMagasins />
        </span>
        Créez d’abord votre société et votre magasin dans l’onglet « Magasins » — l’assistant de mise en place de la
        collecte vous prend ensuite en main, étape par étape.
      </div>
    )
  }

  const mp = magasin.miseEnPlace ?? { faites: [] }
  const gisement = mp.gisementKgJour ?? (Number(gisementSaisi) || 0)
  const reco = gisement > 0 ? recommanderFrequence(gisement) : null

  const estFaite = (id: string) =>
    id === 'calendrier' ? magasin.collecteurs.length > 0 || mp.faites.includes(id) : mp.faites.includes(id)
  const nbFaites = ETAPES.filter((e) => estFaite(e.id)).length
  const toutFait = nbFaites === ETAPES.length

  function basculer(id: string) {
    if (!magasin) return
    const faites = mp.faites.includes(id) ? mp.faites.filter((f) => f !== id) : [...mp.faites, id]
    onSaveMagasin({ ...magasin, miseEnPlace: { ...mp, faites } })
  }

  function enregistrerGisement() {
    if (!magasin) return
    const kg = Number(gisementSaisi) || 0
    if (kg <= 0) return
    const faites = mp.faites.includes('gisement') ? mp.faites : [...mp.faites, 'gisement']
    onSaveMagasin({ ...magasin, miseEnPlace: { faites, gisementKgJour: kg } })
  }

  function ajouterCollecteur() {
    if (!magasin || !nouveau.nom.trim()) return
    onSaveMagasin({ ...magasin, collecteurs: [...magasin.collecteurs, { ...nouveau, nom: nouveau.nom.trim() }] })
    setNouveau({ nom: '', contact: '', jours: '' })
  }

  function CaseEtape({ id }: { id: string }) {
    const faite = estFaite(id)
    return (
      <button
        className={`btn btn-sm ${faite ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => basculer(id)}
        style={{ flex: 'none' }}
      >
        {faite ? '✓ Fait' : 'Marquer fait'}
      </button>
    )
  }

  return (
    <div>
      <h2>Mettre en place ma collecte</h2>

      {state.magasins.length > 1 && (
        <div className="chips">
          {state.magasins.map((m) => (
            <button key={m.id} className={`chip ${m.id === magasin.id ? 'active' : ''}`} onClick={() => setMagasinId(m.id)}>
              {m.nom}
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{magasin.nom}</h3>
          <span className="muted">{nbFaites}/{ETAPES.length} étapes</span>
        </div>
        <div className="progress">
          <div style={{ width: `${(nbFaites / ETAPES.length) * 100}%` }} />
        </div>
        {toutFait ? (
          <div className="info-banner vert" style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>Votre collecte est en place.</strong> Il ne reste qu’à saisir vos pertes chaque{' '}
            {magasin.frequenceSaisie === 'quotidienne' ? 'jour' : 'semaine'} — Mana s’occupe du reste.
          </div>
        ) : (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Pas encore de collecte en place ? Suivez les étapes dans l’ordre : en une semaine, tout est calé.
          </p>
        )}
      </div>

      {/* Étape 1 — gisement */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>1. Estimer votre gisement</h3>
          <CaseEtape id="gisement" />
        </div>
        <p className="muted">
          Pendant 2 ou 3 jours, regardez ce qui part à la poubelle et qui serait donnable. Repère simple : une cagette
          de fruits &amp; légumes pleine ≈ 8 à 10 kg ; un bac de produits frais ≈ 5 kg.
        </p>
        <label className="field" style={{ marginBottom: 8 }}>
          <span>Volume donnable estimé</span>
          <div className="range-row">
            <div className="suffixe" style={{ flex: 1 }}>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={gisementSaisi || (mp.gisementKgJour ?? '')}
                onChange={(e) => setGisementSaisi(e.target.value)}
                placeholder="Ex. 12"
              />
              <em>kg/jour</em>
            </div>
            <button className="btn btn-primary btn-sm" onClick={enregistrerGisement}>
              Valider
            </button>
          </div>
        </label>
        {reco && (
          <div className="info-banner" style={{ marginBottom: 0 }}>
            <strong>{reco.titre}.</strong> {reco.conseil}
          </div>
        )}
      </div>

      {/* Étape 2 — annuaire */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>2. Choisir votre ou vos associations</h3>
          <CaseEtape id="collecteurs" />
        </div>
        <p className="muted">
          Liste indicative des réseaux qui collectent chez les commerçants — appelez l’antenne locale, expliquez votre
          volume et vos jours souhaités. Vous gardez votre relation directe : aucune exclusivité, aucun intermédiaire.
          Besoin de passages quotidiens que personne n’assure seul ? <strong>Combinez deux associations</strong> — Mana
          rattache tous les bordereaux au même registre.
        </p>
        {RESEAUX_COLLECTEURS.map((r) => (
          <div className="reseau" key={r.nom}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <strong style={{ fontSize: 15 }}>{r.nom}</strong>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>{r.site}</span>
            </div>
            <p className="muted" style={{ margin: '4px 0 6px' }}>{r.profil}</p>
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span><strong>Produits :</strong> {r.produits}</span>
              <span><strong>Rythme :</strong> {r.rythme}</span>
              <span><strong>Contact :</strong> {r.commentContacter}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Étape 3 — calendrier */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>3. Caler le calendrier de passage</h3>
          {magasin.collecteurs.length > 0 ? <span className="verif-badge">✓ {magasin.collecteurs.length} collecteur{magasin.collecteurs.length > 1 ? 's' : ''}</span> : <CaseEtape id="calendrier" />}
        </div>
        <p className="muted">
          Accord trouvé ? Enregistrez chaque association et ses jours de passage — ils s’affichent sur la fiche du
          magasin et dans l’état annuel (reçus fiscaux attendus).
        </p>
        {magasin.collecteurs.map((c, i) => (
          <div className="facture-ligne" key={i}>
            <div className="infos">
              <strong>{c.nom}</strong>
              <small>{c.jours || 'jours à préciser'}{c.contact ? ` · ${c.contact}` : ''}</small>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => onSaveMagasin({ ...magasin, collecteurs: magasin.collecteurs.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input type="text" placeholder="Association (ex. Banque Alimentaire du Rhône)" value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} />
          <input type="text" placeholder="Contact (nom, téléphone)" value={nouveau.contact} onChange={(e) => setNouveau({ ...nouveau, contact: e.target.value })} />
          <input type="text" placeholder="Jours de passage (ex. mardi et vendredi matin)" value={nouveau.jours} onChange={(e) => setNouveau({ ...nouveau, jours: e.target.value })} />
          <button className="btn btn-ghost btn-sm" onClick={ajouterCollecteur} disabled={!nouveau.nom.trim()} style={{ opacity: nouveau.nom.trim() ? 1 : 0.5 }}>
            + Ajouter ce collecteur
          </button>
        </div>
      </div>

      {/* Étape 4 — tri */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>4. Former l’équipe au tri</h3>
          <CaseEtape id="tri" />
        </div>
        <p className="muted">
          Le geste ne change pas : pendant la tournée DLC, le produit donnable part dans le bac « don » au lieu de la
          poubelle, scanné avec un motif de démarque « don » dédié si votre back-office le permet.
        </p>
        <div className="detail-lignes">
          <div className="ligne"><span>DLC demain / après-demain</span><span className="badge vert">donnable — sortir avant la date</span></div>
          <div className="ligne"><span>DDM dépassée (« de préférence avant »)</span><span className="badge vert">donnable</span></div>
          <div className="ligne"><span>F&amp;L moches mais sains, pain de la veille</span><span className="badge vert">donnables</span></div>
          <div className="ligne"><span>DLC dépassée, produit entamé, froid rompu, alcool</span><span className="badge alerte">jamais</span></div>
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => pdfAfficheTri(magasin.nom)}>
          ⬇ Imprimer l’affiche « Le bac don » pour la réserve
        </button>
      </div>

      {/* Étape 5 — pesée */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>5. Organiser la pesée et les bordereaux</h3>
          <CaseEtape id="pesee" />
        </div>
        <p className="muted">
          Les produits emballés sont valorisés par leur montant de démarque — rien à peser. Seuls les fruits &amp;
          légumes partent au poids : pesez la cagette sur la balance du rayon (ou un pèse-personne), déduisez la tare
          (~1 kg par cagette bois), notez le total sur le bordereau. Le collecteur contrôle et signe à chaque passage —
          prenez le bordereau en photo et joignez-le à la saisie de la semaine.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => pdfBordereau(magasin, societe.raisonSociale)}>
          ⬇ Imprimer des bordereaux d’enlèvement vierges
        </button>
      </div>

      {/* Étape 6 — première collecte */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>6. Réussir la première collecte</h3>
          <CaseEtape id="premiere" />
        </div>
        <p className="muted">La veille du premier passage :</p>
        <div className="detail-lignes">
          <div className="ligne"><span>Le bac « don » est en réserve, au froid pour le frais, affiche au mur</span></div>
          <div className="ligne"><span>L’équipe du matin connaît la règle « jamais de DLC dépassée »</span></div>
          <div className="ligne"><span>Bordereaux imprimés à côté du bac, balance repérée pour les F&amp;L</span></div>
          <div className="ligne"><span>Après le passage : montant de démarque « don » + poids F&amp;L + photo du bordereau → saisie dans Mana</span></div>
        </div>
        <button className="btn btn-ambre btn-block" style={{ marginTop: 12 }} onClick={onAllerSaisie}>
          Faire ma première saisie
        </button>
      </div>

      <footer className="legal">
        Objectif du pilote : moins de 10 % de produits refusés par le collecteur. Si les refus dépassent ça, resserrez
        le tri (étape 4) — et enregistrez les refus en correction dans la saisie.
      </footer>
    </div>
  )
}
