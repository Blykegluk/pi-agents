/**
 * Fil de suivi ouvert par Mana quand une collecte déraille : le contenu du dossier
 * (repris par la console pour préparer relances et recherches) et les messages
 * adressés au magasin. Module pur, partagé avec la fonction `surveiller-collectes`.
 * Ton : cordial et professionnel, jamais accusateur — le magasin est notre client.
 */
import type { AppState, Magasin } from '../types.ts'
import type { SignalCalcule } from './signaux.ts'
import { SEUIL_ALERTE_PASSAGES } from './signaux.ts'

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function fmtJourLong(j: string): string {
  const [, m, d] = j.split('-').map(Number)
  return `${d === 1 ? '1er' : d} ${MOIS[m - 1]}`
}

/** « 21, 22 et 23 septembre » ; « 30 septembre et 1er octobre » quand les mois diffèrent. */
export function listeJours(dates: string[]): string {
  if (dates.length === 0) return ''
  const memeMois = dates.every((d) => d.slice(0, 7) === dates[0].slice(0, 7))
  const l = memeMois ? dates.map((d) => { const n = Number(d.slice(8, 10)); return n === 1 ? '1er' : String(n) }) : dates.map(fmtJourLong)
  const corps = l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`
  return memeMois ? `${corps} ${MOIS[Number(dates[0].slice(5, 7)) - 1]}` : corps
}

function adresseMagasin(etat: AppState, m: Magasin): string {
  if (m.adresse) return m.adresse
  const so = etat.societes.find((x) => x.id === m.societeId)
  const a = so?.verification.adresseSiege
  return a ? `${a.voie}, ${a.codePostal} ${a.commune} (siège)` : ''
}

/** Contenu du fil de suivi : les mêmes clés que les demandes de changement, pour que la console réutilise ses outils. */
export function contenuSuivi(etat: AppState, signal: SignalCalcule): Record<string, unknown> {
  const m = etat.magasins.find((x) => x.id === signal.magasinId)
  if (!m) return { signal_cle: signal.cle }
  const so = etat.societes.find((x) => x.id === m.societeId)
  const fiche = m.collecteurs.find((c) => c.nom.trim().toLowerCase() === (signal.collecteur ?? '').trim().toLowerCase())
  const dates = (signal.detail.dates as string[] | undefined) ?? []
  const rythme = [fiche?.frequence === 'Autre' ? fiche.frequenceAutre : fiche?.frequence, fiche?.plage === 'Autre' ? fiche.plageAutre : fiche?.plage, fiche?.jours]
    .filter(Boolean)
    .join(' · ')
  return {
    magasin: m.nom,
    societe: so?.raisonSociale ?? '',
    adresse_magasin: adresseMagasin(etat, m),
    association_concernee: signal.collecteur ?? 'aucune en particulier',
    association_email: fiche?.email ?? '',
    association_contact: [fiche?.contact, fiche?.telephone].filter(Boolean).join(' · '),
    rythme_convenu: rythme,
    motif: `Passages sans bordereau : ${listeJours(dates)}`,
    associations_en_place: m.collecteurs.map((c) => c.nom).join(', ') || 'aucune',
    signal_cle: signal.cle,
    dates,
    etape: signal.detail.etape,
  }
}

export function sujetSuivi(etat: AppState, signal: SignalCalcule): string {
  const m = etat.magasins.find((x) => x.id === signal.magasinId)
  return `Suivi de collecte — ${m?.nom ?? 'magasin'}${signal.collecteur ? ` (${signal.collecteur})` : ''}`
}

/** Premier message au magasin : on demande, on n'accuse pas. */
export function messageOuverture(signal: SignalCalcule): string {
  const dates = (signal.detail.dates as string[] | undefined) ?? []
  const asso = signal.collecteur ?? 'votre association'
  return (
    `Bonjour,\n\n` +
    `Nous n’avons pas de bordereau pour ${dates.length > 1 ? 'les passages' : 'le passage'} de ${asso} ${dates.length > 1 ? 'des' : 'du'} ${listeJours(dates)}. ` +
    `Trois cas possibles : l’association est venue et le bordereau reste à saisir ; elle est venue mais il n’y avait rien à donner ; elle n’est pas venue.\n\n` +
    `Vous pouvez nous le dire ici, ou en un clic dans Magasins › Associations : les cases rouges du calendrier proposent la réponse. ` +
    (estEscalade(signal)
      ? `De notre côté, nous relançons ${asso} dès aujourd’hui et cherchons en parallèle une association de remplacement près du magasin, pour ne pas perdre les denrées. Continuez à mettre de côté et à peser ce qui est donnable.\n\n`
      : `Si l’association n’est pas venue, nous la relançons de notre côté, vous n’avez rien à faire.\n\n`) +
    `Merci, et bonne journée.\nL’équipe Mana`
  )
}

/** Message quand la série atteint le seuil d'alerte : Mana prend la main. */
export function messageEscalade(signal: SignalCalcule): string {
  const dates = (signal.detail.dates as string[] | undefined) ?? []
  const asso = signal.collecteur ?? 'l’association'
  return (
    `Bonjour,\n\n` +
    `Toujours pas de bordereau après ${dates.length} passages (${listeJours(dates)}). ` +
    `Nous relançons ${asso} aujourd’hui et cherchons en parallèle une association de remplacement près du magasin, pour ne pas perdre les denrées. ` +
    `Continuez à mettre de côté et à peser ce qui est donnable : nous revenons vers vous dès que nous avons une réponse.\n\n` +
    `L’équipe Mana`
  )
}

/** Message de clôture quand la cause a disparu (bordereaux saisis, collecte reprise). */
export function messageCloture(): string {
  return `Bonjour,\n\nLe point est réglé : la collecte est à jour de notre côté, merci. Nous refermons ce suivi ; n’hésitez pas à nous écrire si quelque chose change.\n\nL’équipe Mana`
}

/** Le fil de suivi s'ouvre pour un signal de passages à partir de ce niveau. */
export function meriteUnFil(signal: SignalCalcule): boolean {
  return signal.type === 'passages_manques' && signal.niveau !== 'info'
}

export function estEscalade(signal: SignalCalcule): boolean {
  return signal.type === 'passages_manques' && Number(signal.detail.manques ?? 0) >= SEUIL_ALERTE_PASSAGES
}
