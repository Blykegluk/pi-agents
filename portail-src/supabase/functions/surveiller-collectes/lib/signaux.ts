/**
 * Moteur de signaux : ce qui mérite l'attention de Mana ou du magasin, calculé
 * à partir de l'état d'un compte. Règles fixes, validées avec Mana :
 *  – un passage attendu sans bordereau 24 h après son créneau est manqué ;
 *  – 1 passage manqué : information au magasin ; 2 : relance de l'association ;
 *    3 d'affilée : alerte à Mana, qui propose une solution de remplacement ;
 *  – relevé de démarque du mois précédent absent après le 10 ;
 *  – plafond de dons de la société à 80 %, puis atteint ;
 *  – contrat Mana non signé alors que des dons sont enregistrés ;
 *  – mise en place de la collecte inachevée deux semaines après la création.
 *
 * Module pur, sans DOM, partagé avec la fonction Supabase `surveiller-collectes`.
 */
import type { AppState, Magasin, Saisie, Societe } from '../types.ts'
import { baseDeLaSaisie, plafondAnnuel } from './calc.ts'
import { parseWeekId, mondayOfWeek } from './iso.ts'
import { calendrierPassages, decalerJour, estBordereau, fenetreSemaines, jourParis, rythmeCollecteur, type Rythme, type SerieManquee } from './passages.ts'

export type NiveauSignal = 'info' | 'attention' | 'alerte'

export type TypeSignal =
  | 'passages_manques'
  | 'rythme_inconnu'
  | 'silence'
  | 'releve_en_retard'
  | 'plafond_proche'
  | 'plafond_atteint'
  | 'contrat_non_signe'
  | 'mise_en_place_incomplete'

export interface SignalCalcule {
  /** Clé stable : un même signal est mis à jour d'une nuit à l'autre, pas dupliqué. */
  cle: string
  type: TypeSignal
  niveau: NiveauSignal
  societeId?: string
  magasinId?: string
  collecteur?: string
  titre: string
  detail: Record<string, unknown>
}

/** Passages manqués d'affilée à partir duquel Mana est alerté (validé : 3). */
export const SEUIL_ALERTE_PASSAGES = 3
/** Passages manqués d'affilée à partir duquel un fil de suivi s'ouvre avec le magasin (relance de l'association). */
export const SEUIL_DOSSIER = 2
/** Jours sans bordereau avant signal, quand le rythme n'est pas exploitable (validé : 7). */
export const SILENCE_JOURS = 7
/** Part du plafond à partir de laquelle on prévient (80 %). */
export const PLAFOND_ATTENTION = 0.8
/** Jour du mois à partir duquel le relevé du mois précédent est attendu. */
export const JOUR_RELEVE = 10
/** Semaines examinées pour les séries de passages. */
export const SEMAINES_EXAMINEES = 8
/** Délai avant de signaler une mise en place inachevée (jours). */
export const DELAI_MISE_EN_PLACE = 14

const ETAPES_MISE_EN_PLACE = ['gisement', 'collecteurs', 'tri', 'pesee', 'premiere']

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function fmtJour(j: string): string {
  const [y, m, d] = j.split('-').map(Number)
  return `${d} ${MOIS[m - 1]}${y !== new Date().getUTCFullYear() ? ' ' + y : ''}`
}

function niveauPassages(manques: number): NiveauSignal {
  if (manques >= SEUIL_ALERTE_PASSAGES) return 'alerte'
  if (manques >= 2) return 'attention'
  return 'info'
}

function signalPassages(m: Magasin, s: SerieManquee): SignalCalcule {
  const n = s.manques
  return {
    cle: `passages_manques:${m.id}:${s.collecteur.trim().toLowerCase()}`,
    type: 'passages_manques',
    niveau: niveauPassages(n),
    magasinId: m.id,
    societeId: m.societeId,
    collecteur: s.collecteur,
    titre:
      n === 1
        ? `Passage du ${fmtJour(s.dates[0])} sans bordereau · ${s.collecteur}`
        : `${n} passages sans bordereau d'affilée${s.confirmes ? ` (${s.confirmes} confirmé${s.confirmes > 1 ? 's' : ''} par le magasin)` : ''} · ${s.collecteur}`,
    detail: {
      manques: n,
      confirmes: s.confirmes,
      dates: s.dates,
      dernierBordereau: s.dernierFait,
      rythme: s.rythme.libelle,
      sourceRythme: s.rythme.source,
      etape: n >= SEUIL_ALERTE_PASSAGES ? 'remplacement' : n === 2 ? 'relance_association' : 'verifier_magasin',
    },
  }
}

/** Dernier mois civil échu (Paris), 'AAAA-MM', si l'on est après le JOUR_RELEVE. */
function moisAttendu(maintenant: Date): string | null {
  const jour = jourParis(maintenant)
  const [y, m, d] = jour.split('-').map(Number)
  if (d < JOUR_RELEVE) return null
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  return `${prev.y}-${String(prev.m).padStart(2, '0')}`
}

/** Le relevé couvre-t-il ce mois ? (mois déclaré, période libre, ou semaine dont le jeudi tombe dans le mois) */
function releveCouvre(s: Saisie, mois: string): boolean {
  if (s.releveMois) return s.releveMois === mois
  if (s.releveDu && s.releveAu) return s.releveDu.slice(0, 7) <= mois && s.releveAu.slice(0, 7) >= mois
  const lundi = mondayOfWeek(s.semaine)
  lundi.setUTCDate(lundi.getUTCDate() + 3)
  return lundi.toISOString().slice(0, 7) === mois
}

function signauxSociete(etat: AppState, so: Societe, maintenant: Date): SignalCalcule[] {
  const out: SignalCalcule[] = []
  const exercice = Number(jourParis(maintenant).slice(0, 4))
  const ids = new Set(etat.magasins.filter((m) => m.societeId === so.id).map((m) => m.id))
  const saisies = etat.saisies.filter((s) => ids.has(s.magasinId) && parseWeekId(s.semaine).year === exercice)
  const base = saisies.reduce((t, s) => t + baseDeLaSaisie(s), 0)
  const plafond = plafondAnnuel(so.caHT)
  const part = plafond > 0 ? base / plafond : 0

  if (part >= 1 - 1e-9) {
    out.push({
      cle: `plafond_atteint:${so.id}:${exercice}`,
      type: 'plafond_atteint',
      niveau: 'info',
      societeId: so.id,
      titre: `Plafond de dons ${exercice} atteint · ${so.raisonSociale}`,
      detail: { base: Math.round(base), plafond: Math.round(plafond), part: Math.round(part * 100), exercice, note: 'Les dons suivants restent reportables cinq ans ; la commission Mana ne porte que sur la réduction obtenue.' },
    })
  } else if (part >= PLAFOND_ATTENTION) {
    out.push({
      cle: `plafond_proche:${so.id}:${exercice}`,
      type: 'plafond_proche',
      niveau: 'attention',
      societeId: so.id,
      titre: `Plafond de dons ${exercice} à ${Math.round(part * 100)} % · ${so.raisonSociale}`,
      detail: { base: Math.round(base), plafond: Math.round(plafond), part: Math.round(part * 100), exercice, reste: Math.round(plafond - base) },
    })
  }

  if (!so.contrat && etat.saisies.some((s) => ids.has(s.magasinId))) {
    out.push({
      cle: `contrat_non_signe:${so.id}`,
      type: 'contrat_non_signe',
      niveau: 'attention',
      societeId: so.id,
      titre: `Contrat Mana non signé · ${so.raisonSociale}`,
      detail: { saisies: etat.saisies.filter((s) => ids.has(s.magasinId)).length },
    })
  }
  return out
}

function signauxMagasin(etat: AppState, m: Magasin, maintenant: Date): SignalCalcule[] {
  const out: SignalCalcule[] = []
  const saisies = etat.saisies.filter((s) => s.magasinId === m.id)
  const bordereaux = saisies.filter(estBordereau).sort((a, b) => a.jour!.localeCompare(b.jour!))
  const aujourdHui = jourParis(maintenant)

  // Mise en place inachevée
  const faites = m.miseEnPlace?.faites ?? []
  const nbFaites = ETAPES_MISE_EN_PLACE.filter((e) => (e === 'collecteurs' ? m.collecteurs.length > 0 || faites.includes(e) : faites.includes(e))).length
  const creeIlYa = (maintenant.getTime() - new Date(m.creeLe).getTime()) / 86_400_000
  if (nbFaites < ETAPES_MISE_EN_PLACE.length && creeIlYa >= DELAI_MISE_EN_PLACE && bordereaux.length === 0) {
    out.push({
      cle: `mise_en_place_incomplete:${m.id}`,
      type: 'mise_en_place_incomplete',
      niveau: 'info',
      magasinId: m.id,
      societeId: m.societeId,
      titre: `Mise en place de la collecte inachevée (${nbFaites}/${ETAPES_MISE_EN_PLACE.length}) · ${m.nom}`,
      detail: { faites: nbFaites, total: ETAPES_MISE_EN_PLACE.length, joursDepuisCreation: Math.floor(creeIlYa), collecteurs: m.collecteurs.length },
    })
  }

  // Passages : uniquement quand la collecte a démarré (au moins un bordereau).
  if (m.collecteurs.length > 0 && bordereaux.length > 0) {
    const fenetre = fenetreSemaines(SEMAINES_EXAMINEES, maintenant)
    const cal = calendrierPassages(m, saisies, { ...fenetre, maintenant, reponses: etat.reponsesPassages })
    const rythmes: Rythme[] = []
    for (const serie of cal.series) {
      rythmes.push(serie.rythme)
      if (serie.rythme.source === 'inconnu') {
        out.push({
          cle: `rythme_inconnu:${m.id}:${serie.collecteur.trim().toLowerCase()}`,
          type: 'rythme_inconnu',
          niveau: 'info',
          magasinId: m.id,
          societeId: m.societeId,
          collecteur: serie.collecteur,
          titre: `Rythme de passage à préciser · ${serie.collecteur}`,
          detail: { note: 'Sans jours ni rythme exploitables, Mana ne peut pas surveiller les passages de cette association.' },
        })
        continue
      }
      if (serie.manques > 0) out.push(signalPassages(m, serie))
    }
    // Silence : aucun bordereau depuis 7 jours, quand aucun rythme n'est exploitable.
    if (rythmes.every((r) => r.source === 'inconnu')) {
      const dernier = bordereaux[bordereaux.length - 1].jour!
      if (dernier <= decalerJour(aujourdHui, -SILENCE_JOURS)) {
        const jours = Math.round((new Date(aujourdHui).getTime() - new Date(dernier).getTime()) / 86_400_000)
        out.push({
          cle: `silence:${m.id}`,
          type: 'silence',
          niveau: 'attention',
          magasinId: m.id,
          societeId: m.societeId,
          titre: `Aucun bordereau depuis ${jours} jours · ${m.nom}`,
          detail: { dernierBordereau: dernier, jours },
        })
      }
    }
  }

  // Relevé de démarque du mois précédent, pour les magasins qui en saisissent.
  // Relevé du mois précédent : attendu seulement si des bordereaux ont eu lieu ce mois-là
  // (une collecte qui démarre en septembre n'a pas de relevé d'août à fournir).
  const releves = saisies.filter((s) => s.origine === 'releve')
  const mois = moisAttendu(maintenant)
  const activiteCeMois = mois ? bordereaux.some((b) => b.jour!.startsWith(mois)) : false
  if (mois && activiteCeMois && releves.length > 0 && !releves.some((s) => releveCouvre(s, mois))) {
    const [y, mm] = mois.split('-').map(Number)
    out.push({
      cle: `releve_en_retard:${m.id}:${mois}`,
      type: 'releve_en_retard',
      niveau: 'attention',
      magasinId: m.id,
      societeId: m.societeId,
      titre: `Relevé de démarque de ${MOIS[mm - 1]} ${y} non saisi · ${m.nom}`,
      detail: { mois, dernierReleve: releves.map((s) => s.horodatage).sort().pop() ?? null },
    })
  }
  return out
}

/** Tous les signaux d'un compte, à l'instant donné. */
export function calculerSignaux(etat: AppState, maintenant = new Date()): SignalCalcule[] {
  const out: SignalCalcule[] = []
  for (const so of etat.societes) out.push(...signauxSociete(etat, so, maintenant))
  for (const m of etat.magasins) out.push(...signauxMagasin(etat, m, maintenant))
  const ordre: Record<NiveauSignal, number> = { alerte: 0, attention: 1, info: 2 }
  return out.sort((a, b) => ordre[a.niveau] - ordre[b.niveau] || a.titre.localeCompare(b.titre))
}

export const LIBELLES_NIVEAU: Record<NiveauSignal, { texte: string; classe: string }> = {
  alerte: { texte: 'Alerte', classe: 'badge alerte' },
  attention: { texte: 'À suivre', classe: 'badge' },
  info: { texte: 'Info', classe: 'badge vert' },
}

/** Ce que Mana fait ou propose pour chaque type de signal (console). */
export const ACTIONS_SIGNAL: Record<TypeSignal, string> = {
  passages_manques: 'Vérifier avec le magasin, relancer l’association, puis proposer un remplacement au 3e passage manqué.',
  rythme_inconnu: 'Demander au magasin les jours et le créneau de passage pour activer la surveillance.',
  silence: 'Demander au magasin si la collecte a lieu et si les bordereaux sont saisis.',
  releve_en_retard: 'Rappeler au magasin d’exporter le relevé de démarque du mois.',
  plafond_proche: 'Prévenir le dirigeant : le plafond approche, les dons suivants seront reportés.',
  plafond_atteint: 'Informer le dirigeant ; les dons continuent, la réduction est reportée sur les exercices suivants.',
  contrat_non_signe: 'Faire signer le contrat Mana avant toute facturation.',
  mise_en_place_incomplete: 'Proposer un appel de 15 minutes pour finir la mise en place.',
}

export { rythmeCollecteur }
