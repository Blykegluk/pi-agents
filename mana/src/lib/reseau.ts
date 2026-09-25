/**
 * Santé du réseau : pour chaque magasin, où en est la collecte cette semaine,
 * la série de passages sans bordereau, le dernier bordereau, le relevé du mois
 * précédent et les signaux en cours. Même moteur que la surveillance nocturne
 * (passages.ts, signaux.ts), calculé localement : l'écran est juste même hors ligne.
 */
import type { AppState, Magasin, Societe } from '../types.ts'
import { baseDeLaSaisie } from './calc.ts'
import { mondayOfWeek } from './iso.ts'
import { calendrierPassages, decalerJour, estBordereau, fenetreSemaines, jourParis, lundiDe, type Rythme } from './passages.ts'
import { calculerSignaux, moisAttendu, releveCouvre, SEMAINES_EXAMINEES, type SignalCalcule } from './signaux.ts'

export interface SanteMagasin {
  magasin: Magasin
  societe?: Societe
  rythmes: { collecteur: string; libelle: string; source: Rythme['source'] }[]
  /** Semaine ISO en cours : passages attendus et ce qu'il en est. */
  semaine: { attendus: number; faits: number; enAttente: number; manques: number; aVenir: number }
  /** Passages sans bordereau d'affilée, la plus longue série parmi les associations. */
  serie: { collecteur: string; manques: number; confirmes: number; dates: string[] } | null
  dernierBordereau: string | null
  /** Relevé de démarque du mois précédent (attendu à partir du 10). */
  releve: { mois: string | null; etat: 'ok' | 'manquant' | 'sans_objet' }
  /** Base (coût de revient) des saisies du mois en cours. */
  baseMois: number
  signaux: SignalCalcule[]
  /** Collecte démarrée : au moins un bordereau. */
  enCollecte: boolean
}

export interface SanteReseau {
  magasins: SanteMagasin[]
  totaux: {
    magasins: number
    enCollecte: number
    passagesSemaine: { faits: number; attendus: number }
    enAlerte: number
    aSuivre: number
    relevesManquants: number
    signaux: number
  }
}

const ORDRE: Record<SignalCalcule['niveau'], number> = { alerte: 0, attention: 1, info: 2 }

export function santeReseau(etat: AppState, maintenant = new Date()): SanteReseau {
  const signaux = calculerSignaux(etat, maintenant)
  const aujourdHui = jourParis(maintenant)
  const lundi = lundiDe(aujourdHui)
  const dimanche = decalerJour(lundi, 6)
  const moisCourant = aujourdHui.slice(0, 7)
  const moisPrecedent = moisAttendu(maintenant)

  const magasins = etat.magasins.map<SanteMagasin>((m) => {
    const societe = etat.societes.find((s) => s.id === m.societeId)
    const saisies = etat.saisies.filter((s) => s.magasinId === m.id)
    const bordereaux = saisies.filter(estBordereau).sort((a, b) => a.jour!.localeCompare(b.jour!))
    const cal = calendrierPassages(m, saisies, { ...fenetreSemaines(SEMAINES_EXAMINEES, maintenant), maintenant, reponses: etat.reponsesPassages })
    const semaine = { attendus: 0, faits: 0, enAttente: 0, manques: 0, aVenir: 0 }
    for (const p of cal.passages) {
      const dans = p.periode ? p.periode.du === lundi : p.date >= lundi && p.date <= dimanche
      if (!dans) continue
      if (p.periode) {
        semaine.attendus += p.periode.attendus
        semaine.faits += Math.min(p.periode.faits, p.periode.attendus)
        if (p.statut === 'manque') semaine.manques += p.periode.attendus - p.periode.faits
        else if (p.statut === 'en_attente') semaine.enAttente += p.periode.attendus - p.periode.faits
        else if (p.statut === 'a_venir') semaine.aVenir += p.periode.attendus - p.periode.faits
        continue
      }
      semaine.attendus++
      if (p.statut === 'fait' || p.statut === 'declare_semaine') semaine.faits++
      else if (p.statut === 'manque') semaine.manques++
      else if (p.statut === 'en_attente') semaine.enAttente++
      else semaine.aVenir++
    }
    const pire = cal.series.reduce<SanteMagasin['serie']>((acc, s) => (s.manques > (acc?.manques ?? 0) ? { collecteur: s.collecteur, manques: s.manques, confirmes: s.confirmes, dates: s.dates } : acc), null)
    const releves = saisies.filter((s) => s.origine === 'releve')
    let releve: SanteMagasin['releve'] = { mois: moisPrecedent, etat: 'sans_objet' }
    if (moisPrecedent && bordereaux.some((b) => b.jour!.startsWith(moisPrecedent))) {
      releve = { mois: moisPrecedent, etat: releves.some((s) => releveCouvre(s, moisPrecedent)) ? 'ok' : 'manquant' }
    }
    const baseMois = saisies
      .filter((s) => {
        const jeudi = mondayOfWeek(s.semaine)
        jeudi.setUTCDate(jeudi.getUTCDate() + 3)
        return jeudi.toISOString().slice(0, 7) === moisCourant
      })
      .reduce((t, s) => t + baseDeLaSaisie(s), 0)
    const miens = signaux.filter((s) => s.magasinId === m.id || (!s.magasinId && s.societeId === m.societeId)).sort((a, b) => ORDRE[a.niveau] - ORDRE[b.niveau])
    return {
      magasin: m,
      societe,
      rythmes: cal.series.map((s) => ({ collecteur: s.collecteur, libelle: s.rythme.libelle, source: s.rythme.source })),
      semaine,
      serie: pire && pire.manques > 0 ? pire : null,
      dernierBordereau: bordereaux.length ? bordereaux[bordereaux.length - 1].jour! : null,
      releve,
      baseMois,
      signaux: miens,
      enCollecte: bordereaux.length > 0,
    }
  })

  // Les magasins qui vont mal d'abord.
  magasins.sort((a, b) => {
    const na = a.signaux[0] ? ORDRE[a.signaux[0].niveau] : 3
    const nb = b.signaux[0] ? ORDRE[b.signaux[0].niveau] : 3
    return na - nb || (b.serie?.manques ?? 0) - (a.serie?.manques ?? 0) || a.magasin.nom.localeCompare(b.magasin.nom)
  })

  return {
    magasins,
    totaux: {
      magasins: magasins.length,
      enCollecte: magasins.filter((m) => m.enCollecte).length,
      passagesSemaine: {
        faits: magasins.reduce((t, m) => t + m.semaine.faits, 0),
        attendus: magasins.reduce((t, m) => t + m.semaine.attendus, 0),
      },
      enAlerte: magasins.filter((m) => m.signaux.some((s) => s.niveau === 'alerte')).length,
      aSuivre: magasins.filter((m) => !m.signaux.some((s) => s.niveau === 'alerte') && m.signaux.some((s) => s.niveau === 'attention')).length,
      relevesManquants: magasins.filter((m) => m.releve.etat === 'manquant').length,
      signaux: signaux.length,
    },
  }
}

/** Ce qu'un responsable de magasin a à faire aujourd'hui, pour un magasin donné. */
export interface AFaireMagasin {
  magasin: Magasin
  /** Passages prévus aujourd'hui (association, créneau lisible). */
  aujourdHui: { collecteur: string; creneau: string }[]
  /** Passages passés dont le bordereau reste à saisir (moins de 24 h, ou annoncé). */
  aSaisir: string[]
  /** Passages sans bordereau à qualifier (venue sans don, pas venue…). */
  sansBordereau: { collecteur: string; dates: string[] }[]
  releveManquant: string | null
}

export function aFaire(etat: AppState, maintenant = new Date()): AFaireMagasin[] {
  const aujourdHui = jourParis(maintenant)
  const sante = santeReseau(etat, maintenant)
  return sante.magasins.map((s) => {
    const m = s.magasin
    const saisies = etat.saisies.filter((x) => x.magasinId === m.id)
    const cal = calendrierPassages(m, saisies, { du: decalerJour(aujourdHui, -13), au: aujourdHui, maintenant, reponses: etat.reponsesPassages })
    const passesDuJour = cal.passages.filter((p) => !p.periode && p.date === aujourdHui)
    return {
      magasin: m,
      aujourdHui: passesDuJour.map((p) => ({
        collecteur: p.collecteur,
        creneau: (() => {
          const c = m.collecteurs.find((x) => x.nom === p.collecteur)
          return c?.plage === 'Autre' ? c.plageAutre ?? '' : c?.plage ?? ''
        })(),
      })),
      aSaisir: cal.passages.filter((p) => !p.periode && p.statut === 'en_attente').map((p) => p.date),
      sansBordereau: cal.series.filter((x) => x.manques > 0).map((x) => ({ collecteur: x.collecteur, dates: x.dates })),
      releveManquant: s.releve.etat === 'manquant' ? s.releve.mois : null,
    }
  })
}
