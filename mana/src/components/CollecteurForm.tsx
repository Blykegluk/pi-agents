import type { Collecteur } from '../types'
import { FREQUENCES } from '../lib/annuaire'

export const COLLECTEUR_VIDE: Collecteur = { nom: '', contact: '', telephone: '', email: '', frequence: '', frequenceAutre: '', jours: '' }

/**
 * Fiche d'une association collectrice — un seul formulaire, utilisé à la
 * création du magasin comme dans l'assistant de collecte, pour que les
 * coordonnées saisies une fois n'aient jamais à être ressaisies.
 * Seul le nom est obligatoire : le reste se complète au fil des échanges.
 */
export function CollecteurForm({
  valeur,
  onChange,
  onSupprimer,
}: {
  valeur: Collecteur
  onChange: (c: Collecteur) => void
  onSupprimer?: () => void
}) {
  const maj = (champ: keyof Collecteur, v: string) => onChange({ ...valeur, [champ]: v })

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
      </div>

      <label className="field">
        <span>E-mail (facultatif)</span>
        <input type="email" inputMode="email" value={valeur.email ?? ''} onChange={(e) => maj('email', e.target.value)} placeholder="Ex. contact@association.org" />
      </label>

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
          <input
            type="text"
            style={{ marginTop: 8 }}
            value={valeur.frequenceAutre ?? ''}
            onChange={(e) => maj('frequenceAutre', e.target.value)}
            placeholder="Ex. tous les 15 jours, ou à la demande"
          />
        )}
      </label>

      <label className="field" style={{ marginBottom: onSupprimer ? 8 : 0 }}>
        <span>Jours et heures de passage (facultatif)</span>
        <input type="text" value={valeur.jours} onChange={(e) => maj('jours', e.target.value)} placeholder="Ex. du lundi au samedi, 11 h – 13 h" />
      </label>

      {onSupprimer && (
        <button className="btn btn-danger btn-sm" onClick={onSupprimer}>
          Retirer cette association
        </button>
      )}
    </div>
  )
}
