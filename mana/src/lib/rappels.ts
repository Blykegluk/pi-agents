/**
 * Rappels au responsable de magasin, calculés chaque matin par la surveillance :
 *  – le passage d'hier n'a pas encore de bordereau (et le magasin n'a rien dit) ;
 *  – le relevé de démarque du mois précédent n'est pas enregistré (à partir du 10).
 * Chaque rappel porte une clé stable : la fonction nocturne ne l'envoie qu'une fois.
 * Module pur, partagé avec `surveiller-collectes`. Ton : bref, cordial, actionnable.
 */
import type { AppState, Magasin } from '../types.ts'
import { calendrierPassages, decalerJour, estBordereau, jourParis } from './passages.ts'
import { moisAttendu, releveCouvre } from './signaux.ts'

export interface Rappel {
  cle: string
  type: 'bordereau' | 'releve'
  magasinId: string
  texte: string
}

export interface RappelsMagasin {
  magasin: Magasin
  rappels: Rappel[]
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

function fmtJour(j: string): string {
  const [y, m, d] = j.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7
  return `${JOURS[js]} ${d === 1 ? '1er' : d} ${MOIS[m - 1]}`
}

/** Les rappels du jour, magasin par magasin (sans tenir compte de ce qui a déjà été envoyé). */
export function rappelsDuJour(etat: AppState, maintenant = new Date()): RappelsMagasin[] {
  const aujourdHui = jourParis(maintenant)
  const hier = decalerJour(aujourdHui, -1)
  const mois = moisAttendu(maintenant)
  const out: RappelsMagasin[] = []

  for (const m of etat.magasins) {
    if (m.collecteurs.length === 0) continue
    const saisies = etat.saisies.filter((s) => s.magasinId === m.id)
    const bordereaux = saisies.filter(estBordereau)
    if (bordereaux.length === 0) continue // la collecte n'a pas démarré : rien à rappeler
    const rappels: Rappel[] = []

    // 1) Le passage d'hier sans bordereau, tant que le magasin n'a pas répondu.
    const cal = calendrierPassages(m, saisies, { du: decalerJour(hier, -1), au: hier, maintenant, reponses: etat.reponsesPassages })
    for (const p of cal.passages) {
      if (p.periode || p.date !== hier || p.reponse) continue
      if (p.statut !== 'en_attente' && p.statut !== 'manque') continue
      rappels.push({
        cle: `bordereau:${m.id}:${hier}:${p.collecteur.trim().toLowerCase()}`,
        type: 'bordereau',
        magasinId: m.id,
        texte:
          `Pas de bordereau pour le passage de ${p.collecteur} d’hier (${fmtJour(hier)}). ` +
          `Si l’association est venue, saisissez-le dans Saisie. Sinon, rien à faire : sans bordereau, Mana compte le passage comme manqué et relance l’association.`,
      })
    }

    // 2) Le relevé de démarque du mois précédent, à partir du 10, s'il y a eu des passages ce mois-là.
    const releves = saisies.filter((s) => s.origine === 'releve')
    if (mois && releves.length > 0 && bordereaux.some((b) => b.jour!.startsWith(mois)) && !releves.some((s) => releveCouvre(s, mois))) {
      const [y, mm] = mois.split('-').map(Number)
      rappels.push({
        cle: `releve:${m.id}:${mois}`,
        type: 'releve',
        magasinId: m.id,
        texte:
          `Le relevé de démarque de ${MOIS[mm - 1]} ${y} n’est pas encore enregistré. ` +
          `Sans lui, les bordereaux du mois n’ont pas de valeur et le reçu fiscal reste bloqué : exportez le relevé du back-office et déposez-le dans Saisie, carte « Relevé de démarque ».`,
      })
    }

    if (rappels.length) out.push({ magasin: m, rappels })
  }
  return out
}

/** Le message posté dans le fil « Rappels » du magasin : un seul par jour, tous les rappels dedans. */
export function messageRappels(rappels: Rappel[]): string {
  const corps = rappels.length === 1 ? rappels[0].texte : rappels.map((r) => `• ${r.texte}`).join('\n')
  return `Bonjour,\n\n${corps}\n\nMerci, et bonne journée.\nL’équipe Mana`
}

export function sujetRappels(m: Magasin): string {
  return `Rappels — ${m.nom}`
}
