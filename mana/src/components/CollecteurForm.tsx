import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Collecteur, Justificatif } from '../types'
import { FREQUENCES, PLAGES } from '../lib/annuaire'
import { televerserDocumentAssociation } from '../lib/cloud'
import { uid } from '../lib/storage'
import { Pieces } from './Pieces'

export const COLLECTEUR_VIDE: Collecteur = { nom: '', contact: '', telephone: '', email: '', frequence: '', frequenceAutre: '', plage: '', plageAutre: '', jours: '' }

export const LIBELLES_ELIGIBILITE: Record<NonNullable<Collecteur['eligibilite']>, { texte: string; classe: string; aide: string }> = {
  inconnue: { texte: 'éligibilité non vérifiée', classe: 'badge alerte', aide: 'Aucune pièce réunie : le reçu fiscal de fin d’année repose sur la seule parole de l’association.' },
  a_verifier: { texte: 'pièces réunies, à confirmer', classe: 'badge', aide: 'Statuts et récépissé en main. Demandez-lui le rescrit mécénat (article L. 80 C du LPF) pour sécuriser le reçu.' },
  rescrit: { texte: 'rescrit positif', classe: 'badge vert', aide: 'L’administration a confirmé par écrit que l’association peut délivrer des reçus fiscaux. C’est la situation la plus sûre.' },
  reseau_national: { texte: 'réseau national', classe: 'badge vert', aide: 'Banque Alimentaire, Restos du Cœur, Secours populaire, Croix-Rouge… : éligibilité notoire, pas de rescrit à demander.' },
}

const TYPES_DOCUMENT = ['Statuts', 'Récépissé de déclaration (préfecture)', 'Rescrit mécénat', 'Convention de don', 'Habilitation aide alimentaire', 'Autre']

/**
 * Fiche d'une association collectrice — un seul formulaire, utilisé à la
 * création du magasin comme dans l'assistant de collecte, pour que les
 * coordonnées saisies une fois n'aient jamais à être ressaisies.
 * Seul le nom est obligatoire : le reste se complète au fil des échanges.
 *
 * Le bloc « Éligibilité » n'est pas décoratif : le reçu fiscal de fin d'année
 * n'a de valeur que si l'association est d'intérêt général au sens de
 * l'article 238 bis. Les pièces s'archivent ici (compte connecté).
 */
export function CollecteurForm({
  valeur,
  onChange,
  onSupprimer,
  session,
}: {
  valeur: Collecteur
  onChange: (c: Collecteur) => void
  onSupprimer?: () => void
  session?: Session | null
}) {
  const maj = (champ: keyof Collecteur, v: string) => onChange({ ...valeur, [champ]: v })
  const [typeDoc, setTypeDoc] = useState(TYPES_DOCUMENT[0])
  const [envoi, setEnvoi] = useState(false)
  const eligibilite = valeur.eligibilite ?? 'inconnue'

  async function ajouterDocuments(files: FileList | null) {
    if (!files || !session) return
    setEnvoi(true)
    const nouveaux: Justificatif[] = []
    for (const f of Array.from(files)) {
      try {
        const chemin = await televerserDocumentAssociation(session.user.id, f, f.name)
        nouveaux.push({ id: uid(), nom: `${typeDoc} — ${f.name}`, type: f.type, taille: f.size, chemin })
      } catch {
        /* le fichier suivant tente sa chance */
      }
    }
    setEnvoi(false)
    if (nouveaux.length) onChange({ ...valeur, documents: [...(valeur.documents ?? []), ...nouveaux], eligibilite: valeur.eligibilite ?? 'a_verifier' })
  }

  return (
    <div className="collecteur-form">
      <label className="field">
        <span>Nom de l’association *</span>
        <input type="text" value={valeur.nom} onChange={(e) => maj('nom', e.target.value)} placeholder="Ex. Les Restos du Cœur — Paris" />
      </label>

      <div className="colonnes-2">
        <label className="field">
          <span>Référent (facultatif)</span>
          <input type="text" value={valeur.contact} onChange={(e) => maj('contact', e.target.value)} placeholder="Ex. M. Dubreuil" />
        </label>
        <label className="field">
          <span>Téléphone (facultatif)</span>
          <input type="tel" inputMode="tel" value={valeur.telephone ?? ''} onChange={(e) => maj('telephone', e.target.value)} placeholder="Ex. 01 45 22 18 40" />
        </label>
        <label className="field">
          <span>E-mail (facultatif)</span>
          <input type="email" inputMode="email" value={valeur.email ?? ''} onChange={(e) => maj('email', e.target.value)} placeholder="Ex. contact@association.org" />
        </label>
        <label className="field">
          <span>N° RNA ou SIREN (facultatif — repris sur le reçu fiscal)</span>
          <input type="text" value={valeur.rna ?? valeur.siren ?? ''} onChange={(e) => onChange({ ...valeur, rna: e.target.value.trim().toUpperCase().startsWith('W') ? e.target.value.trim() : '', siren: /^\d/.test(e.target.value.trim()) ? e.target.value.trim() : '' })} placeholder="Ex. W931030100 ou 995298452" />
        </label>
      </div>

      <label className="field">
        <span>Fréquence de passage</span>
        <div className="chips" style={{ marginBottom: 0 }}>
          {FREQUENCES.map((f) => (
            <button key={f} type="button" className={`chip ${valeur.frequence === f ? 'active' : ''}`} onClick={() => maj('frequence', valeur.frequence === f ? '' : f)}>
              {f === 'Autre' ? 'Autre (préciser)' : f}
            </button>
          ))}
        </div>
        {valeur.frequence === 'Autre' && (
          <input type="text" style={{ marginTop: 8 }} value={valeur.frequenceAutre ?? ''} onChange={(e) => maj('frequenceAutre', e.target.value)} placeholder="Ex. tous les 15 jours, ou à la demande" />
        )}
      </label>

      <label className="field">
        <span>Créneau de passage</span>
        <div className="chips" style={{ marginBottom: 0 }}>
          {PLAGES.map((p) => (
            <button key={p} type="button" className={`chip ${valeur.plage === p ? 'active' : ''}`} onClick={() => maj('plage', valeur.plage === p ? '' : p)}>
              {p === 'Autre' ? 'Autre (préciser)' : p}
            </button>
          ))}
        </div>
        {valeur.plage === 'Autre' && (
          <input type="text" style={{ marginTop: 8 }} value={valeur.plageAutre ?? ''} onChange={(e) => maj('plageAutre', e.target.value)} placeholder="Ex. entre 14 h et 15 h, ou à la fermeture" />
        )}
      </label>

      <label className="field">
        <span>Jours de passage (facultatif)</span>
        <input type="text" value={valeur.jours} onChange={(e) => maj('jours', e.target.value)} placeholder="Ex. du lundi au samedi, sauf jours fériés" />
      </label>

      {/* ---- Éligibilité au reçu fiscal & documents ---- */}
      <div style={{ background: 'var(--sable)', borderRadius: 10, padding: '12px 14px', marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Éligibilité au reçu fiscal (article 238 bis)</strong>
          <span className={LIBELLES_ELIGIBILITE[eligibilite].classe}>{LIBELLES_ELIGIBILITE[eligibilite].texte}</span>
        </div>
        <p className="muted" style={{ margin: '6px 0 8px', fontSize: 13 }}>
          Le reçu de fin d’année ne vaut que si l’association est d’intérêt général : gestion désintéressée, activité
          non lucrative, public ouvert. Réunissez ses pièces ici — c’est ce qu’on vous demandera en cas de contrôle.
        </p>
        <div className="chips" style={{ marginBottom: 8 }}>
          {(Object.keys(LIBELLES_ELIGIBILITE) as NonNullable<Collecteur['eligibilite']>[]).map((k) => (
            <button key={k} type="button" className={`chip ${eligibilite === k ? 'active' : ''}`} onClick={() => onChange({ ...valeur, eligibilite: k })}>
              {LIBELLES_ELIGIBILITE[k].texte}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>{LIBELLES_ELIGIBILITE[eligibilite].aide}</p>

        {session ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={typeDoc} onChange={(e) => setTypeDoc(e.target.value)} style={{ flex: 1, minWidth: 180, padding: 8 }}>
              {TYPES_DOCUMENT.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              {envoi ? 'Envoi…' : '+ Joindre'}
              <input type="file" accept="image/*,application/pdf" multiple disabled={envoi} onChange={(e) => { void ajouterDocuments(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
            </label>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Connectez-vous pour joindre les documents de l’association.</p>
        )}
        {(valeur.documents?.length ?? 0) > 0 && (
          <Pieces justificatifs={valeur.documents ?? []} onChange={(liste) => onChange({ ...valeur, documents: liste })} compact />
        )}
      </div>

      {onSupprimer && (
        <button className="btn btn-danger btn-sm" style={{ marginTop: 10 }} onClick={onSupprimer}>
          Retirer cette association
        </button>
      )}
    </div>
  )
}
