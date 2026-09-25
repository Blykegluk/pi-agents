import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Collecteur, Magasin, ReponsePassage, Saisie, Societe } from '../types'
import { FREQUENCES, PLAGES, resumePassages } from '../lib/annuaire'
import { compteId, creerDemande, derniersMessages, mesDemandes, type Demande, type Message } from '../lib/cloud'
import { fmtNum } from '../lib/format'
import { COLLECTEUR_VIDE, CollecteurForm, LIBELLES_ELIGIBILITE } from './CollecteurForm'
import { CalendrierPassages } from './CalendrierPassages'

const MOTIFS = [
  'L’association ne vient plus',
  'Passages irréguliers',
  'Elle reprend trop peu',
  'Relation difficile',
  'Il m’en faut une de plus',
  'Autre',
]

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const fmtLe = (iso: string) => `${Number(iso.slice(8, 10))} ${MOIS[Number(iso.slice(5, 7)) - 1]}`

export type DerniersMessages = Record<string, { auteur: Message['auteur']; le: string }>

/** Les demandes du compte et l'auteur du dernier message de chacune, rechargeables après un envoi. */
export function useDemandes(session: Session | null) {
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [derniers, setDerniers] = useState<DerniersMessages>({})
  const recharger = useCallback(async () => {
    if (!session) {
      setDemandes([])
      setDerniers({})
      return
    }
    const ds = await mesDemandes().catch(() => [] as Demande[])
    setDemandes(ds)
    setDerniers(await derniersMessages(ds.filter((d) => d.statut !== 'traitee').map((d) => d.id)).catch(() => ({})))
  }, [session])
  useEffect(() => {
    void recharger()
  }, [recharger])
  return { demandes, derniers, recharger }
}

type Formulaire = { type: 'modifier'; index: number } | { type: 'ajout' } | { type: 'probleme' } | { type: 'recherche' } | null

/**
 * Les associations d'un magasin, à gérer sur place : qui passe et quand, le calendrier des passages,
 * où en sont les demandes à Mana, et trois actions (signaler un problème, ajouter, faire chercher).
 */
export function AssociationsMagasin({
  magasin,
  societe,
  session,
  saisies,
  reponses,
  demandes,
  derniers,
  onReponse,
  onSaveMagasin,
  onDemandeEnvoyee,
  onConnexion,
  onOuvrirMessages,
  formulaireInitial = null,
  sansCalendrier = false,
}: {
  magasin: Magasin
  societe: Societe | undefined
  session: Session | null
  saisies: Saisie[]
  reponses: ReponsePassage[]
  demandes: Demande[]
  derniers: DerniersMessages
  onReponse?: (r: Omit<ReponsePassage, 'id' | 'le' | 'par'>) => void
  onSaveMagasin: (m: Magasin) => void
  onDemandeEnvoyee: () => Promise<void> | void
  onConnexion: () => void
  onOuvrirMessages: () => void
  /** Ouvre directement un formulaire (ex. l'ajout quand le magasin n'a encore aucune association). */
  formulaireInitial?: Formulaire
  sansCalendrier?: boolean
}) {
  const [formulaire, setFormulaire] = useState<Formulaire>(formulaireInitial ?? (magasin.collecteurs.length === 0 ? { type: 'ajout' } : null))
  const [brouillon, setBrouillon] = useState<Collecteur>({ ...COLLECTEUR_VIDE })
  const [assoConcernee, setAssoConcernee] = useState(magasin.collecteurs.length === 1 ? magasin.collecteurs[0].nom : '')
  const [motif, setMotif] = useState('')
  const [precision, setPrecision] = useState('')
  const [frequence, setFrequence] = useState('')
  const [plage, setPlage] = useState('')
  const [ville, setVille] = useState(magasin.adresse ?? societe?.verification.adresseSiege?.commune ?? '')
  const [kgJour, setKgJour] = useState(magasin.miseEnPlace?.gisementKgJour ? String(magasin.miseEnPlace.gisementKgJour) : '')
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState('')
  const brouillonValide = brouillon.nom.trim() !== '' && /^\S+@\S+\.\S+$/.test((brouillon.email ?? '').trim())

  useEffect(() => {
    if (formulaireInitial) ouvrir(formulaireInitial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaireInitial])

  function ouvrir(f: Formulaire) {
    setMessage('')
    if (f && (f.type === 'probleme' || f.type === 'recherche') && !session) {
      onConnexion()
      return
    }
    if (f?.type === 'modifier') setBrouillon({ ...COLLECTEUR_VIDE, ...magasin.collecteurs[f.index] })
    if (f?.type === 'ajout') setBrouillon({ ...COLLECTEUR_VIDE })
    setFormulaire(f)
  }

  // Ce qui est en cours avec Mana pour ce magasin, et si Mana a déjà répondu.
  const ouvertes = demandes.filter((d) => d.statut !== 'traitee' && d.contenu?.magasin === magasin.nom && !d.contenu?.rappels)
  const rechercheOuverte = ouvertes.some((d) => d.type === 'collecte')

  function enregistrerAssociation() {
    const c = { ...brouillon, nom: brouillon.nom.trim() }
    const collecteurs =
      formulaire?.type === 'modifier' ? magasin.collecteurs.map((x, j) => (j === formulaire.index ? c : x)) : [...magasin.collecteurs, c]
    onSaveMagasin({ ...magasin, collecteurs })
    setFormulaire(null)
  }

  async function envoyer(type: 'association' | 'collecte') {
    if (!session) return
    setEnvoi(true)
    setMessage('')
    try {
      const adresse = magasin.adresse ?? (societe?.verification.adresseSiege ? `${societe.verification.adresseSiege.voie}, ${societe.verification.adresseSiege.codePostal} ${societe.verification.adresseSiege.commune} (siège)` : '')
      if (type === 'association') {
        const asso = assoConcernee || (magasin.collecteurs.length === 1 ? magasin.collecteurs[0].nom : '')
        const fiche = magasin.collecteurs.find((c) => c.nom === asso)
        await creerDemande(compteId(session), session.user.email ?? '', 'association', `${motif} — ${magasin.nom}${asso ? ` (${asso})` : ''}`, {
          magasin: magasin.nom,
          societe: societe?.raisonSociale ?? '',
          adresse_magasin: adresse,
          association_concernee: asso || 'aucune en particulier',
          association_email: fiche?.email ?? '',
          association_contact: [fiche?.contact, fiche?.telephone].filter(Boolean).join(' · '),
          rythme_convenu: fiche ? resumePassages(fiche) : '',
          motif,
          associations_en_place: magasin.collecteurs.map((c) => c.nom).join(', ') || 'aucune',
        }, precision.trim() || motif)
      } else {
        const kg = Number(kgJour) || 0
        if (kg > 0 && kg !== magasin.miseEnPlace?.gisementKgJour) {
          const faites = magasin.miseEnPlace?.faites ?? []
          onSaveMagasin({ ...magasin, miseEnPlace: { faites: faites.includes('gisement') ? faites : [...faites, 'gisement'], gisementKgJour: kg } })
        }
        await creerDemande(compteId(session), session.user.email ?? '', 'collecte', `Mise en relation — ${magasin.nom} (${ville.trim()})`, {
          magasin: magasin.nom,
          societe: societe?.raisonSociale ?? '',
          ville: ville.trim(),
          adresse_magasin: adresse,
          invendus_estimes: kg > 0 ? `${fmtNum(kg, 1)} kg/jour` : 'non estimés',
          frequence_souhaitee: frequence,
          plage_horaire: plage,
        }, precision.trim())
      }
      await onDemandeEnvoyee()
      setFormulaire(null)
      setMotif('')
      setPrecision('')
      setMessage('Envoyé. Mana vous répond dans Messages.')
    } catch (e) {
      setMessage((e as Error).message)
    }
    setEnvoi(false)
  }

  return (
    <div className="asso-magasin">
      {ouvertes.map((d) => {
        const mana = derniers[d.id]?.auteur === 'mana' || derniers[d.id]?.auteur === 'association'
        const quoi = d.type === 'collecte' ? 'Recherche d’association' : d.type === 'suivi' ? 'Suivi des passages' : String(d.contenu.motif ?? d.sujet)
        return (
          <div className={`asso-statut${mana ? ' repondu' : ''}`} key={d.id}>
            <span>
              <strong>{quoi}</strong>
              {mana ? ` · Mana vous a répondu le ${fmtLe(derniers[d.id].le)}` : d.type === 'suivi' ? ' · Mana relance l’association' : ` · envoyé le ${fmtLe(d.created_at)}, Mana s’en occupe`}
            </span>
            <button className="lien" onClick={onOuvrirMessages}>{mana ? 'Lire' : 'Voir'}</button>
          </div>
        )
      })}

      {magasin.collecteurs.map((c, i) =>
        formulaire?.type === 'modifier' && formulaire.index === i ? (
          <div className="asso-form" key={i}>
            <CollecteurForm valeur={brouillon} onChange={setBrouillon} session={session} magasin={magasin} societe={societe} />
            <div className="row-actions" style={{ marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" disabled={!brouillonValide} onClick={enregistrerAssociation}>Enregistrer</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setFormulaire(null)}>Annuler</button>
            </div>
          </div>
        ) : (
          <div className="asso-ligne" key={i}>
            <div className="infos">
              <strong>{c.nom}</strong>
              <small>{[resumePassages(c), c.contact, c.telephone].filter(Boolean).join(' · ') || 'coordonnées à compléter'}</small>
            </div>
            <span className={LIBELLES_ELIGIBILITE[c.eligibilite ?? 'inconnue'].classe} title={LIBELLES_ELIGIBILITE[c.eligibilite ?? 'inconnue'].aide}>
              {LIBELLES_ELIGIBILITE[c.eligibilite ?? 'inconnue'].texte}
            </span>
            <span className="asso-ligne-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => ouvrir({ type: 'modifier', index: i })}>Modifier</button>
              <button
                className="btn btn-danger btn-sm"
                title={`Retirer ${c.nom}`}
                onClick={() => {
                  if (confirm(`Retirer « ${c.nom} » de ce magasin ?`)) onSaveMagasin({ ...magasin, collecteurs: magasin.collecteurs.filter((_, j) => j !== i) })
                }}
              >
                ✕
              </button>
            </span>
          </div>
        ),
      )}
      {magasin.collecteurs.length === 0 && !formulaire && <p className="muted" style={{ margin: '4px 0 0' }}>Aucune association pour l’instant.</p>}

      {!sansCalendrier && magasin.collecteurs.length > 0 && <CalendrierPassages magasin={magasin} saisies={saisies} reponses={reponses} onReponse={onReponse} />}

      {formulaire?.type === 'ajout' && (
        <div className="asso-form">
          <h4>Nouvelle association</h4>
          <CollecteurForm valeur={brouillon} onChange={setBrouillon} session={session} magasin={magasin} societe={societe} />
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" disabled={!brouillonValide} onClick={enregistrerAssociation}>Enregistrer</button>
            {magasin.collecteurs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setFormulaire(null)}>Annuler</button>}
            {magasin.collecteurs.length === 0 && !rechercheOuverte && (
              <button className="btn btn-ghost btn-sm" onClick={() => ouvrir({ type: 'recherche' })}>Je n’en ai pas : Mana m’en trouve une</button>
            )}
          </div>
        </div>
      )}

      {formulaire?.type === 'probleme' && (
        <div className="asso-form">
          <h4>Que se passe-t-il ?</h4>
          {magasin.collecteurs.length > 1 && (
            <div className="chips" style={{ marginBottom: 8 }}>
              {magasin.collecteurs.map((c) => (
                <button key={c.nom} type="button" className={`chip ${assoConcernee === c.nom ? 'active' : ''}`} onClick={() => setAssoConcernee(c.nom)}>{c.nom}</button>
              ))}
            </div>
          )}
          <div className="chips" style={{ marginBottom: 8 }}>
            {MOTIFS.map((m) => (
              <button key={m} type="button" className={`chip ${motif === m ? 'active' : ''}`} onClick={() => setMotif(m)}>{m}</button>
            ))}
          </div>
          <textarea rows={2} value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Un détail utile ? (facultatif)" />
          <div className="row-actions" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!motif || envoi} onClick={() => void envoyer('association')}>{envoi ? 'Envoi…' : 'Envoyer à Mana'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFormulaire(null)}>Annuler</button>
          </div>
        </div>
      )}

      {formulaire?.type === 'recherche' && (
        <div className="asso-form">
          <h4>Mana vous trouve une association</h4>
          <div className="colonnes-2">
            <label className="field">
              <span>Passages souhaités</span>
              <div className="chips" style={{ marginBottom: 0 }}>
                {FREQUENCES.filter((f) => f !== 'Autre').map((f) => (
                  <button key={f} type="button" className={`chip ${frequence === f ? 'active' : ''}`} onClick={() => setFrequence(f)}>{f}</button>
                ))}
              </div>
            </label>
            <label className="field">
              <span>Créneau</span>
              <div className="chips" style={{ marginBottom: 0 }}>
                {PLAGES.filter((p) => p !== 'Autre').map((p) => (
                  <button key={p} type="button" className={`chip ${plage === p ? 'active' : ''}`} onClick={() => setPlage(p)}>{p}</button>
                ))}
              </div>
            </label>
            <label className="field">
              <span>Ville ou code postal</span>
              <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ex. Suresnes 92150" />
            </label>
            <label className="field">
              <span>Invendus donnables (kg par jour, environ)</span>
              <input type="number" inputMode="decimal" min={0} value={kgJour} onChange={(e) => setKgJour(e.target.value)} placeholder="Ex. 12" />
            </label>
          </div>
          <textarea rows={2} value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Un détail utile ? Beaucoup de frais, fermé le lundi… (facultatif)" />
          <div className="row-actions" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!frequence || !plage || !ville.trim() || envoi} onClick={() => void envoyer('collecte')}>{envoi ? 'Envoi…' : 'Envoyer à Mana'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFormulaire(magasin.collecteurs.length === 0 ? { type: 'ajout' } : null)}>Annuler</button>
          </div>
        </div>
      )}

      {message && <p className="muted" style={{ margin: '8px 0 0', color: message.startsWith('Envoyé') ? 'var(--vert)' : 'var(--rouge)' }}>{message}</p>}

      {!formulaire && (
        <div className="row-actions" style={{ marginTop: 10 }}>
          {magasin.collecteurs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => ouvrir({ type: 'probleme' })}>⚠ Signaler un problème</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => ouvrir({ type: 'ajout' })}>+ Ajouter une association</button>
          {!rechercheOuverte && magasin.collecteurs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => ouvrir({ type: 'recherche' })}>Mana m’en trouve une autre</button>}
        </div>
      )}
    </div>
  )
}
