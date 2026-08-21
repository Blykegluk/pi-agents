import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState, Magasin } from '../types'
import { RESEAUX_COLLECTEURS, recommanderFrequence } from '../lib/annuaire'
import { pdfAfficheTri, pdfBordereau } from '../lib/pdf'
import { IconMagasins } from '../components/Icons'
import { creerDemande, mesDemandes, type Demande } from '../lib/cloud'
import { LIBELLES_STATUT } from '../components/Aide'
import { fmtNum } from '../lib/format'

/**
 * Mise en place de la collecte — l'accompagnement pas à pas : estimation des
 * invendus, définition du besoin, demande de mise en relation traitée par
 * l'équipe Mana (ou contact direct via l'annuaire), calendrier, tri, pesée.
 */

const ETAPES = [
  { id: 'gisement', titre: 'Estimer vos invendus' },
  { id: 'collecteurs', titre: 'Définir votre besoin et trouver votre association' },
  { id: 'calendrier', titre: 'Caler le calendrier de passage' },
  { id: 'tri', titre: 'Former l’équipe au tri' },
  { id: 'pesee', titre: 'Organiser la pesée et les bordereaux' },
  { id: 'premiere', titre: 'Réussir la première collecte' },
] as const

const FREQUENCES = ['Quotidienne', '2 à 3 fois par semaine', 'Hebdomadaire'] as const
const PLAGES = ['Matin (7 h – 10 h)', 'Midi (11 h – 14 h)', 'Fin de journée (17 h – 20 h)'] as const

export function Collecte({
  state,
  session,
  onSaveMagasin,
  onAllerSaisie,
  onConnexion,
  onOuvrirAide,
}: {
  state: AppState
  session: Session | null
  onSaveMagasin: (m: Magasin) => void
  onAllerSaisie: () => void
  onConnexion: () => void
  onOuvrirAide: () => void
}) {
  const [magasinId, setMagasinId] = useState(state.magasins[0]?.id ?? '')
  const magasin = state.magasins.find((m) => m.id === magasinId) ?? state.magasins[0]
  const societe = state.societes.find((s) => s.id === magasin?.societeId)
  const [invendusSaisis, setInvendusSaisis] = useState('')
  const [nouveau, setNouveau] = useState({ nom: '', contact: '', jours: '' })

  // Demande de mise en relation
  const [frequence, setFrequence] = useState<string>('')
  const [plage, setPlage] = useState<string>('')
  const [ville, setVille] = useState('')
  const [precision, setPrecision] = useState('')
  const [demandesCollecte, setDemandesCollecte] = useState<Demande[]>([])
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [messageDemande, setMessageDemande] = useState('')

  useEffect(() => {
    if (session) {
      mesDemandes()
        .then((ds) => setDemandesCollecte(ds.filter((d) => d.type === 'collecte')))
        .catch(() => {})
    } else {
      setDemandesCollecte([])
    }
  }, [session])

  if (!magasin || !societe) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconMagasins />
        </span>
        Créez d’abord votre société et votre magasin dans l’onglet « Magasins » — l’assistant vous prend ensuite en main
        pour mettre la collecte en place, étape par étape.
      </div>
    )
  }

  const mp = magasin.miseEnPlace ?? { faites: [] }
  const kgJour = mp.gisementKgJour ?? (Number(invendusSaisis) || 0)
  const reco = kgJour > 0 ? recommanderFrequence(kgJour) : null
  const demandeDuMagasin = demandesCollecte.find((d) => d.contenu?.magasin === magasin.nom)

  const kgParPassage = (f: string) =>
    f === 'Quotidienne' ? kgJour : f === 'Hebdomadaire' ? kgJour * 7 : kgJour * 2.5

  const estFaite = (id: string) => {
    if (id === 'calendrier') return magasin.collecteurs.length > 0 || mp.faites.includes(id)
    if (id === 'collecteurs') return Boolean(demandeDuMagasin) || mp.faites.includes(id)
    return mp.faites.includes(id)
  }
  const nbFaites = ETAPES.filter((e) => estFaite(e.id)).length
  const toutFait = nbFaites === ETAPES.length

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

  function ajouterCollecteur() {
    if (!magasin || !nouveau.nom.trim()) return
    onSaveMagasin({ ...magasin, collecteurs: [...magasin.collecteurs, { ...nouveau, nom: nouveau.nom.trim() }] })
    setNouveau({ nom: '', contact: '', jours: '' })
  }

  async function envoyerDemande() {
    if (!session || !magasin || !frequence || !plage || !ville.trim() || kgJour <= 0) return
    setEnvoiEnCours(true)
    setMessageDemande('')
    try {
      await creerDemande(
        session.user.id,
        session.user.email ?? '',
        'collecte',
        `Mise en relation — ${magasin.nom} (${ville.trim()})`,
        {
          magasin: magasin.nom,
          societe: societe?.raisonSociale ?? '',
          ville: ville.trim(),
          invendus_estimes: `${fmtNum(kgJour, 1)} kg/jour`,
          frequence_souhaitee: frequence,
          plage_horaire: plage,
          volume_par_passage: `≈ ${fmtNum(kgParPassage(frequence))} kg`,
        },
        precision,
      )
      setDemandesCollecte((await mesDemandes()).filter((d) => d.type === 'collecte'))
      setMessageDemande('Demande envoyée ! L’équipe Mana revient vers vous avec la ou les associations adaptées — suivez les échanges dans Aide & contact (bouton ? en haut).')
    } catch (e) {
      setMessageDemande((e as Error).message)
    }
    setEnvoiEnCours(false)
  }

  function CaseEtape({ id }: { id: string }) {
    const faite = estFaite(id)
    return (
      <button className={`btn btn-sm ${faite ? 'btn-primary' : 'btn-ghost'}`} onClick={() => basculer(id)} style={{ flex: 'none' }}>
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
            Pas encore de collecte en place ? Suivez les étapes dans l’ordre : on vous accompagne jusqu’à la première
            collecte réussie.
          </p>
        )}
      </div>

      {/* Étape 1 — estimer les invendus */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>1. Estimer vos invendus</h3>
          <CaseEtape id="gisement" />
        </div>
        <p className="muted">
          Pendant 2 ou 3 jours, regardez ce qui part à la poubelle alors que c’est encore consommable. Repère simple :
          une cagette de fruits &amp; légumes pleine ≈ 8 à 10 kg ; un bac de produits frais ≈ 5 kg.
        </p>
        <label className="field" style={{ marginBottom: 8 }}>
          <span>Invendus donnables, en moyenne</span>
          <div className="range-row">
            <div className="suffixe" style={{ flex: 1 }}>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={invendusSaisis || (mp.gisementKgJour ?? '')}
                onChange={(e) => setInvendusSaisis(e.target.value)}
                placeholder="Ex. 12"
              />
              <em>kg/jour</em>
            </div>
            <button className="btn btn-primary btn-sm" onClick={enregistrerInvendus}>
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

      {/* Étape 2 — besoin + mise en relation */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>2. Définir votre besoin et trouver votre association</h3>
          <CaseEtape id="collecteurs" />
        </div>

        {demandeDuMagasin ? (
          <div className="info-banner vert">
            <strong>Demande de mise en relation {LIBELLES_STATUT[demandeDuMagasin.statut].texte}.</strong>{' '}
            L’équipe Mana s’occupe de vous trouver la ou les associations adaptées ({String(demandeDuMagasin.contenu.frequence_souhaitee ?? '')},{' '}
            {String(demandeDuMagasin.contenu.plage_horaire ?? '').toLowerCase()}).{' '}
            <button className="amt" onClick={onOuvrirAide}>Suivre les échanges</button>
          </div>
        ) : (
          <div>
            <p className="muted">
              Dites-nous ce qu’il vous faut : <strong>l’équipe Mana vous met en relation</strong> avec la ou les
              associations adaptées de votre secteur (deux associations combinées si vous voulez des passages
              quotidiens) et vous suit jusqu’à la première collecte.
            </p>
            <label className="field">
              <span>Fréquence de ramassage souhaitée</span>
              <div className="chips" style={{ marginBottom: 0 }}>
                {FREQUENCES.map((f) => (
                  <button key={f} type="button" className={`chip ${frequence === f ? 'active' : ''}`} onClick={() => setFrequence(f)}>
                    {f}
                  </button>
                ))}
              </div>
              {frequence && kgJour > 0 && (
                <span className="aide">Soit environ {fmtNum(kgParPassage(frequence))} kg à chaque passage.</span>
              )}
            </label>
            <label className="field">
              <span>Plage horaire de ramassage</span>
              <div className="chips" style={{ marginBottom: 0 }}>
                {PLAGES.map((p) => (
                  <button key={p} type="button" className={`chip ${plage === p ? 'active' : ''}`} onClick={() => setPlage(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </label>
            <label className="field">
              <span>Ville / code postal du magasin</span>
              <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ex. Villeurbanne 69100" />
            </label>
            <label className="field">
              <span>Précisions (facultatif)</span>
              <textarea rows={2} value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Ex. beaucoup de frais, accès quai de livraison, fermé le lundi…" />
            </label>
            {kgJour <= 0 && <p className="muted" style={{ color: 'var(--ambre-texte)' }}>Complétez d’abord l’étape 1 (estimation des invendus).</p>}
            {session ? (
              <button
                className="btn btn-ambre btn-block"
                onClick={envoyerDemande}
                disabled={envoiEnCours || !frequence || !plage || !ville.trim() || kgJour <= 0}
                style={{ opacity: frequence && plage && ville.trim() && kgJour > 0 ? 1 : 0.5 }}
              >
                Envoyer ma demande de mise en relation
              </button>
            ) : (
              <div className="info-banner">
                Connectez-vous pour envoyer votre demande de mise en relation (et retrouver vos données partout).{' '}
                <button className="btn btn-primary btn-sm" style={{ marginTop: 8, display: 'flex' }} onClick={onConnexion}>
                  Se connecter / créer un compte
                </button>
              </div>
            )}
            {messageDemande && <p className="muted" style={{ marginTop: 8, color: 'var(--vert)' }}>{messageDemande}</p>}
          </div>
        )}

        <details style={{ marginTop: 12 }}>
          <summary style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--encre-2)' }}>
            Préférez contacter directement une association ? L’annuaire des réseaux
          </summary>
          <p className="muted" style={{ margin: '8px 0' }}>
            Vous gardez votre relation directe — aucune exclusivité. Confirmez toujours le rythme réel avec l’antenne locale.
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
        </details>
      </div>

      {/* Étape 3 — calendrier */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <h3>3. Caler le calendrier de passage</h3>
          {magasin.collecteurs.length > 0 ? (
            <span className="verif-badge">✓ {magasin.collecteurs.length} collecteur{magasin.collecteurs.length > 1 ? 's' : ''}</span>
          ) : (
            <CaseEtape id="calendrier" />
          )}
        </div>
        <p className="muted">
          Une fois la mise en relation faite, enregistrez chaque association et ses jours de passage — ils s’affichent
          sur la fiche du magasin et dans l’état annuel (reçus fiscaux attendus).
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
          Les produits emballés sont valorisés par leur montant de démarque — rien à peser, on compte juste les colis
          remis (bacs, cartons ou sacs). Seuls les fruits &amp; légumes partent au poids : pesez chaque cagette ou sac
          sur la balance du rayon (ou un pèse-personne), déduisez la tare (~1 kg pour une cagette bois, négligeable
          pour un sac), notez le total sur le bordereau. Le collecteur contrôle et signe à chaque passage — prenez le
          bordereau en photo et joignez-le à la saisie de la semaine.
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
        Objectif : moins de 10 % de produits refusés par le collecteur. Au-delà, resserrez le tri (étape 4) — et
        enregistrez les refus en correction dans la saisie.
      </footer>
    </div>
  )
}
