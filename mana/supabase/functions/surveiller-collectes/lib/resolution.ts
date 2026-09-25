/**
 * Boucle de résolution d'un fil de suivi : relance de l'association en place, puis
 * remplaçante n° 1, n° 2, n° 3, chacune ayant sept jours pour répondre. La console
 * consigne ce qui a été envoyé dans le contenu du fil ; ce module en déduit, chaque
 * nuit, le signal « sans réponse » qui dit à Mana quoi faire ensuite. Module pur.
 */
import type { AppState } from '../types.ts'
import type { SignalCalcule } from './signaux.ts'

/** Jours laissés à une association pour répondre avant de passer à la suivante (validé : 7). */
export const DELAI_REPONSE_JOURS = 7

export interface Dossier {
  id: string
  contenu: Record<string, unknown>
}

interface Envoi {
  le: string
  a?: string
  nom?: string
  objet?: string
}

function envois(v: unknown): Envoi[] {
  return Array.isArray(v) ? (v as Envoi[]).filter((e) => e && typeof e.le === 'string') : []
}

function joursDepuis(iso: string, maintenant: Date): number {
  return Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 86_400_000)
}

/**
 * Signaux de résolution pour les fils dont le signal de passages est encore actif.
 * `actifs` : les clés des signaux calculés cette nuit (un fil dont la cause a disparu ne relance rien).
 */
export function signauxResolution(etat: AppState, dossiers: Dossier[], actifs: Set<string>, maintenant = new Date()): SignalCalcule[] {
  const out: SignalCalcule[] = []
  for (const d of dossiers) {
    const c = d.contenu
    const cle = typeof c.signal_cle === 'string' ? c.signal_cle : ''
    if (!cle || !actifs.has(cle)) continue
    if (c.retenue) continue // une remplaçante est retenue : la boucle est finie
    const magasinId = cle.split(':')[1]
    const magasin = etat.magasins.find((m) => m.id === magasinId)
    const asso = typeof c.association_concernee === 'string' ? c.association_concernee : 'l’association'
    const propositions = Array.isArray(c.propositions) ? (c.propositions as { nom: string; email?: string }[]) : []
    const relances = envois(c.relances)
    const contacts = envois(c.contacts)
    const reponseAsso = typeof c.reponse_association_le === 'string'

    // 1) L'association en place a été relancée et ne répond pas.
    if (relances.length > 0 && !reponseAsso && contacts.length === 0) {
      const derniere = relances[relances.length - 1]
      const jours = joursDepuis(derniere.le, maintenant)
      if (jours >= DELAI_REPONSE_JOURS) {
        const suivante = propositions[0]
        out.push({
          cle: `relance_sans_reponse:${magasinId}:${asso.trim().toLowerCase()}`,
          type: 'relance_sans_reponse',
          niveau: 'alerte',
          magasinId,
          societeId: magasin?.societeId,
          collecteur: asso,
          titre: `${asso} sans réponse ${jours} jours après la relance · ${magasin?.nom ?? ''}`,
          detail: {
            relanceLe: derniere.le,
            jours,
            demandeId: d.id,
            prochaine: suivante ? `Contacter la remplaçante n° 1 : ${suivante.nom}` : 'Lancer la recherche d’associations de remplacement, puis contacter la première',
            propositions: propositions.length,
          },
        })
      }
    }

    // 2) Une remplaçante a été contactée et ne répond pas : passer à la suivante.
    if (contacts.length > 0) {
      const dernier = contacts[contacts.length - 1]
      if ((dernier as { reponse_le?: string }).reponse_le) continue
      const jours = joursDepuis(dernier.le, maintenant)
      if (jours >= DELAI_REPONSE_JOURS) {
        const n = contacts.length
        const suivante = propositions.filter((p) => !contacts.some((x) => (x.a && x.a === p.email) || (x.nom && x.nom === p.nom)))[0]
        out.push({
          cle: `remplacement_sans_reponse:${magasinId}:${n}`,
          type: 'remplacement_sans_reponse',
          niveau: 'alerte',
          magasinId,
          societeId: magasin?.societeId,
          collecteur: dernier.nom ?? dernier.a,
          titre: `Remplaçante n° ${n} (${dernier.nom ?? dernier.a ?? '?'}) sans réponse ${jours} jours après le contact · ${magasin?.nom ?? ''}`,
          detail: {
            contactLe: dernier.le,
            jours,
            demandeId: d.id,
            prochaine: suivante ? `Contacter la remplaçante n° ${n + 1} : ${suivante.nom}` : 'Plus de proposition disponible : relancer la recherche ou appeler le magasin pour décider',
            propositions: propositions.length,
          },
        })
      }
    }
  }
  return out
}
