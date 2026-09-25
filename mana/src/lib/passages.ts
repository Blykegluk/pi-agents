/**
 * Calendrier des passages d'une association dans un magasin.
 *
 * À partir de ce que le magasin a déclaré (rythme, jours, créneau) et des
 * bordereaux enregistrés, on reconstitue quels passages étaient attendus et
 * lesquels ont eu lieu. C'est le socle de la surveillance automatique : un
 * passage attendu sans bordereau 24 h après la fin du créneau est « manqué ».
 *
 * Module pur, sans DOM : il tourne à l'identique dans le navigateur et dans la
 * fonction Supabase `surveiller-collectes` (copie déposée par
 * `scripts/preparer-surveillance.sh`).
 */
import type { Collecteur, Magasin, ReponsePassage, Saisie } from '../types.ts'

/** Délai après la fin du créneau avant de déclarer un passage manqué (validé : 24 h). */
export const TOLERANCE_HEURES = 24
/** Quand le magasin dit « bordereau à saisir », on lui laisse ce délai avant de recompter le passage comme manqué. */
export const DELAI_SAISIE_ANNONCEE_HEURES = 72
/** Jours ISO : 1 = lundi … 7 = dimanche. */
export const NOMS_JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
const ABREVIATIONS = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const
/** Jours retenus quand le magasin dit « quotidienne » sans préciser : du lundi au samedi. */
export const JOURS_OUVRES = [1, 2, 3, 4, 5, 6]

export interface Rythme {
  /** Jours ISO de passage, quand on les connaît. */
  jours: number[] | null
  /**
   * Sinon, un nombre de passages attendus par période de `periodeSemaines` semaines
   * (ex. « 2 à 3 fois par semaine » → 2 par semaine ; « tous les 15 jours » → 1 par 2 semaines).
   */
  parPeriode: number | null
  periodeSemaines: number
  /** D'où vient l'interprétation : jours déclarés, rythme choisi, valeur par défaut, ou rien d'exploitable. */
  source: 'jours' | 'frequence' | 'defaut' | 'inconnu'
  /** Ce que Mana a compris, en clair — affiché au magasin pour qu'il corrige si besoin. */
  libelle: string
}

export type StatutPassage = 'fait' | 'manque' | 'en_attente' | 'a_venir' | 'declare_semaine'

export interface PassageAttendu {
  /** Jour attendu (AAAA-MM-JJ) ; pour un rythme « au compte », dernier jour de la période. */
  date: string
  collecteur: string
  statut: StatutPassage
  /** Bordereau rattaché (statut « fait »). */
  saisieId?: string
  /** Bordereau daté de la veille ou du lendemain, accepté avec tolérance. */
  decale?: boolean
  /** Rythme au compte : ce qui était attendu et ce qui a été fait sur la période. */
  periode?: { du: string; au: string; attendus: number; faits: number }
  /** Ce que le magasin a répondu pour ce passage, s'il l'a fait. */
  reponse?: ReponsePassage['reponse']
}

export interface SerieManquee {
  collecteur: string
  /** Passages manqués d'affilée, en partant du plus récent (0 si le dernier passage évalué a eu lieu). */
  manques: number
  /** Dates des passages manqués de la série. */
  dates: string[]
  /** Parmi eux, ceux que le magasin a confirmés (« pas venu »). */
  confirmes: number
  /** Dernier bordereau de cette association (AAAA-MM-JJ), s'il y en a un. */
  dernierFait: string | null
  rythme: Rythme
}

export interface Calendrier {
  magasinId: string
  du: string
  au: string
  passages: PassageAttendu[]
  /** Tous les bordereaux de la fenêtre, par jour, y compris hors des jours attendus. */
  bordereauxParJour: Record<string, Saisie[]>
  /** Semaines couvertes par une saisie hebdomadaire sans jour (anciens comptes). */
  semainesDeclarees: string[]
  series: SerieManquee[]
}

// ---------- Interprétation du rythme déclaré ----------

function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[,;/()+&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numeroJour(token: string): number | null {
  const t = token.replace(/\.$/, '')
  for (let j = 1; j <= 7; j++) {
    if (t === NOMS_JOURS[j] || t === `${NOMS_JOURS[j]}s` || t === ABREVIATIONS[j]) return j
  }
  return null
}

/**
 * Jours de la semaine cités dans un texte libre : « mardi et vendredi matin »,
 * « du lundi au samedi », « tous les jours sauf dimanche », « lun, mer, ven ».
 * Renvoie null si aucun jour n'est reconnaissable.
 */
export function joursDepuisTexte(texte: string | undefined): number[] | null {
  if (!texte) return null
  const n = normaliser(texte)
  if (!n) return null
  const jours = new Set<number>()
  if (/tous les jours|chaque jour|7j\b|7 jours sur 7|quotidien/.test(n)) for (let j = 1; j <= 7; j++) jours.add(j)
  if (/week ?end/.test(n)) {
    jours.add(6)
    jours.add(7)
  }
  const plage = n.match(/\bdu (\w+\.?) au (\w+\.?)/)
  if (plage) {
    const a = numeroJour(plage[1])
    const b = numeroJour(plage[2])
    if (a && b) {
      for (let j = a; ; j = (j % 7) + 1) {
        jours.add(j)
        if (j === b) break
      }
    }
  }
  const sauf = n.split(/\bsauf\b/)
  const cites = sauf[0].split(' ').map(numeroJour).filter((j): j is number => j !== null)
  cites.forEach((j) => jours.add(j))
  if (sauf[1]) {
    const exclus = sauf[1].split(' ').map(numeroJour).filter((j): j is number => j !== null)
    if (jours.size === 0) for (let j = 1; j <= 7; j++) jours.add(j)
    exclus.forEach((j) => jours.delete(j))
  }
  if (jours.size === 0) return null
  return [...jours].sort((a, b) => a - b)
}

/** Nombre de passages par période lisible dans un texte libre (« 3 fois par semaine », « tous les 15 jours », « 1 fois par mois »). */
function comptageDepuisTexte(texte: string | undefined): { parPeriode: number; periodeSemaines: number } | null {
  if (!texte) return null
  const n = normaliser(texte)
  let m = n.match(/(\d+)\s*(?:a|à|ou)?\s*\d*\s*(?:fois|passages?)\s*(?:par|\/)\s*semaine/)
  if (m) return { parPeriode: Number(m[1]), periodeSemaines: 1 }
  m = n.match(/(\d+)\s*(?:a|à|ou)?\s*\d*\s*(?:fois|passages?)\s*(?:par|\/)\s*mois/)
  if (m) return { parPeriode: Number(m[1]), periodeSemaines: 4 }
  if (/quinz|15 jours|deux semaines|2 semaines|bimensuel/.test(n)) return { parPeriode: 1, periodeSemaines: 2 }
  if (/mensuel|par mois|chaque mois|tous les mois/.test(n)) return { parPeriode: 1, periodeSemaines: 4 }
  m = n.match(/tous les (\d+) jours/)
  if (m) {
    const j = Number(m[1])
    if (j >= 7) return { parPeriode: 1, periodeSemaines: Math.max(1, Math.round(j / 7)) }
    return { parPeriode: Math.max(1, Math.round(7 / j)), periodeSemaines: 1 }
  }
  if (/hebdo|par semaine|chaque semaine|toutes les semaines/.test(n)) return { parPeriode: 1, periodeSemaines: 1 }
  return null
}

function libelleJours(jours: number[]): string {
  if (jours.length === 7) return 'tous les jours'
  if (jours.join() === JOURS_OUVRES.join()) return 'du lundi au samedi'
  if (jours.join() === '1,2,3,4,5') return 'du lundi au vendredi'
  return jours.map((j) => NOMS_JOURS[j]).join(', ')
}

/** Ce que Mana comprend du rythme déclaré pour une association. */
export function rythmeCollecteur(c: Pick<Collecteur, 'frequence' | 'frequenceAutre' | 'jours'>): Rythme {
  const jours = joursDepuisTexte(c.jours)
  const frequence = normaliser(c.frequence ?? '')
  const libre = c.frequence === 'Autre' ? c.frequenceAutre : undefined
  const compte = comptageDepuisTexte(libre) ?? comptageDepuisTexte(c.jours)

  if (jours && (!compte || compte.periodeSemaines === 1)) {
    return { jours, parPeriode: null, periodeSemaines: 1, source: 'jours', libelle: libelleJours(jours) }
  }
  if (frequence.startsWith('quotidien')) {
    return { jours: JOURS_OUVRES, parPeriode: null, periodeSemaines: 1, source: 'defaut', libelle: 'tous les jours, du lundi au samedi (jours à préciser)' }
  }
  if (frequence.startsWith('2 a 3') || frequence.startsWith('2 à 3')) {
    return { jours: null, parPeriode: 2, periodeSemaines: 1, source: 'frequence', libelle: 'au moins 2 passages par semaine (jours à préciser)' }
  }
  if (frequence.startsWith('hebdo')) {
    return { jours: null, parPeriode: 1, periodeSemaines: 1, source: 'frequence', libelle: '1 passage par semaine (jour à préciser)' }
  }
  if (compte) {
    const lib =
      compte.periodeSemaines === 1
        ? `${compte.parPeriode} passage${compte.parPeriode > 1 ? 's' : ''} par semaine`
        : `${compte.parPeriode} passage${compte.parPeriode > 1 ? 's' : ''} toutes les ${compte.periodeSemaines} semaines`
    return { jours: null, parPeriode: compte.parPeriode, periodeSemaines: compte.periodeSemaines, source: 'frequence', libelle: lib }
  }
  return { jours: null, parPeriode: null, periodeSemaines: 1, source: 'inconnu', libelle: 'rythme non renseigné' }
}

// ---------- Dates (heure de Paris) ----------

const ISO_JOUR = /^\d{4}-\d{2}-\d{2}$/

/** Jour civil à Paris d'un instant, en AAAA-MM-JJ. */
export function jourParis(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Instant UTC correspondant à `heure` h (heure de Paris) le jour donné. */
export function instantParis(jour: string, heure: number): Date {
  const [y, m, d] = jour.split('-').map(Number)
  const essai = Date.UTC(y, m - 1, d, heure)
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(essai))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? heure)
  let ecart = h - heure
  if (ecart > 12) ecart -= 24
  if (ecart < -12) ecart += 24
  return new Date(essai - ecart * 3_600_000)
}

/** Heure (Paris) à laquelle le créneau de passage se termine : 10 h, 14 h, 20 h, ou lue dans le texte libre. */
export function heureFinCreneau(c: Pick<Collecteur, 'plage' | 'plageAutre'>): number {
  const p = normaliser(c.plage ?? '')
  if (p.startsWith('matin')) return 10
  if (p.startsWith('midi')) return 14
  if (p.startsWith('fin de journee')) return 20
  const libre = normaliser(c.plageAutre ?? '')
  const heures = [...libre.matchAll(/(\d{1,2})\s*h/g)].map((m) => Number(m[1])).filter((h) => h >= 0 && h <= 23)
  if (heures.length) return Math.max(...heures)
  return 21
}

/** Instant à partir duquel un passage attendu ce jour-là, sans bordereau, est déclaré manqué. */
export function limitePassage(c: Pick<Collecteur, 'plage' | 'plageAutre'>, jour: string): Date {
  return new Date(instantParis(jour, heureFinCreneau(c)).getTime() + TOLERANCE_HEURES * 3_600_000)
}

function dateUTC(jour: string): Date {
  const [y, m, d] = jour.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function versJour(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function decalerJour(jour: string, n: number): string {
  const d = dateUTC(jour)
  d.setUTCDate(d.getUTCDate() + n)
  return versJour(d)
}

export function jourISO(jour: string): number {
  return dateUTC(jour).getUTCDay() || 7
}

/** Lundi de la semaine du jour donné. */
export function lundiDe(jour: string): string {
  return decalerJour(jour, 1 - jourISO(jour))
}

/** Identifiant de semaine ISO (AAAA-WNN) d'un jour. */
export function semaineDe(jour: string): string {
  const d = dateUTC(jour)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const debut = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const semaine = Math.ceil(((d.getTime() - debut.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(semaine).padStart(2, '0')}`
}

// ---------- Calendrier ----------

/** Un bordereau : une ligne « don » datée d'un jour précis (ou marquée comme bordereau). */
export function estBordereau(s: Saisie): boolean {
  if (s.type !== 'don') return false
  if (s.origine === 'releve') return false
  return s.origine === 'bordereau' || (!!s.jour && ISO_JOUR.test(s.jour))
}

/** Un bordereau sans association nommée peut être rattaché à n'importe laquelle (un seul collecteur, en général). */
function bordereauPour(s: Saisie, nomCollecteur: string): boolean {
  if (!s.collecteur) return true
  return s.collecteur.trim().toLowerCase() === nomCollecteur.trim().toLowerCase()
}

/**
 * Calendrier des passages d'un magasin entre `du` et `au` (AAAA-MM-JJ inclus),
 * évalué à l'instant `maintenant`. Rien n'est attendu avant le premier bordereau
 * du magasin (toutes dates confondues) : c'est lui qui marque le début de la collecte.
 */
export function calendrierPassages(
  magasin: Pick<Magasin, 'id' | 'collecteurs'>,
  saisies: Saisie[],
  options: { du: string; au: string; maintenant?: Date; reponses?: ReponsePassage[] },
): Calendrier {
  const maintenant = options.maintenant ?? new Date()
  const { du, au } = options
  const reponses = (options.reponses ?? []).filter((r) => r.magasinId === magasin.id)
  const reponsePour = (collecteur: string, date: string) =>
    reponses.find((r) => r.date === date && r.collecteur.trim().toLowerCase() === collecteur.trim().toLowerCase())
  const propres = saisies.filter((s) => s.magasinId === magasin.id)
  const tousBordereaux = propres.filter(estBordereau)
  // La surveillance commence au premier bordereau du magasin : avant, la collecte n'avait pas démarré.
  const debutCollecte = tousBordereaux.reduce<string | null>((min, s) => (min === null || s.jour! < min ? s.jour! : min), null)
  const bordereaux = tousBordereaux.filter((s) => s.jour! >= decalerJour(du, -1) && s.jour! <= decalerJour(au, 1))
  const bordereauxParJour: Record<string, Saisie[]> = {}
  for (const b of bordereaux) {
    if (b.jour! < du || b.jour! > au) continue
    ;(bordereauxParJour[b.jour!] ??= []).push(b)
  }
  const semainesDeclarees = [
    ...new Set(propres.filter((s) => s.type === 'don' && !s.jour && s.origine !== 'releve').map((s) => s.semaine)),
  ].sort()
  const declaree = new Set(semainesDeclarees)

  const passages: PassageAttendu[] = []
  const series: SerieManquee[] = []
  // Un bordereau ne justifie qu'un seul passage, quelle que soit l'association.
  const pris = new Set<string>()

  for (const c of magasin.collecteurs) {
    const rythme = rythmeCollecteur(c)
    const miens = bordereaux.filter((b) => bordereauPour(b, c.nom)).sort((a, b) => a.jour!.localeCompare(b.jour!))
    const dernierFait = miens.length ? miens[miens.length - 1].jour! : null
    const attendus: PassageAttendu[] = []

    if (rythme.jours) {
      // Un passage par jour déclaré.
      for (let j = du; j <= au; j = decalerJour(j, 1)) {
        if (!rythme.jours.includes(jourISO(j))) continue
        if (debutCollecte === null || j < debutCollecte) continue
        const r = reponsePour(c.nom, j)
        // Magasin fermé ce jour-là : aucun passage n'était à attendre.
        if (r?.reponse === 'ferme') continue
        attendus.push({ date: j, collecteur: c.nom, statut: 'a_venir', reponse: r?.reponse })
      }
      // 1) rattachement exact
      for (const p of attendus) {
        const b = miens.find((x) => x.jour === p.date && !pris.has(x.id))
        if (b) {
          pris.add(b.id)
          p.statut = 'fait'
          p.saisieId = b.id
        }
      }
      // 2) tolérance : bordereau de la veille ou du lendemain resté libre
      for (const p of attendus) {
        if (p.statut === 'fait') continue
        const b = miens.find((x) => !pris.has(x.id) && (x.jour === decalerJour(p.date, -1) || x.jour === decalerJour(p.date, 1)))
        if (b) {
          pris.add(b.id)
          p.statut = 'fait'
          p.saisieId = b.id
          p.decale = true
        }
      }
      // 3) le reste : déclaré à la semaine, pas encore échu, ou manqué
      for (const p of attendus) {
        if (p.statut === 'fait') continue
        if (declaree.has(semaineDe(p.date))) {
          p.statut = 'declare_semaine'
          continue
        }
        // La parole du magasin prime sur l'horloge.
        if (p.reponse === 'venu_sans_don') {
          p.statut = 'fait'
          continue
        }
        if (p.reponse === 'pas_venu') {
          p.statut = 'manque'
          continue
        }
        if (p.reponse === 'bordereau_a_saisir') {
          const r = reponsePour(c.nom, p.date)!
          if (maintenant.getTime() < new Date(r.le).getTime() + DELAI_SAISIE_ANNONCEE_HEURES * 3_600_000) {
            p.statut = 'en_attente'
            continue
          }
        }
        const finCreneau = instantParis(p.date, heureFinCreneau(c))
        if (maintenant < finCreneau) p.statut = 'a_venir'
        else if (maintenant < limitePassage(c, p.date)) p.statut = 'en_attente'
        else p.statut = 'manque'
      }
    } else if (rythme.parPeriode) {
      // Rythme au compte : périodes de N semaines alignées sur les semaines ISO, depuis `du`.
      const largeur = rythme.periodeSemaines * 7
      for (let debut = lundiDe(du); debut <= au; debut = decalerJour(debut, largeur)) {
        const fin = decalerJour(debut, largeur - 1)
        if (debutCollecte === null || fin < debutCollecte) continue
        const dedans = miens.filter((x) => x.jour! >= debut && x.jour! <= fin && !pris.has(x.id))
        dedans.forEach((x) => pris.add(x.id))
        const venusSansDon = reponses.filter((r) => r.reponse === 'venu_sans_don' && r.date >= debut && r.date <= fin && r.collecteur.trim().toLowerCase() === c.nom.trim().toLowerCase()).length
        const faits = dedans.length + venusSansDon
        const p: PassageAttendu = {
          date: fin,
          collecteur: c.nom,
          statut: 'a_venir',
          periode: { du: debut, au: fin, attendus: rythme.parPeriode, faits },
        }
        const semaines: string[] = []
        for (let j = debut; j <= fin; j = decalerJour(j, 7)) semaines.push(semaineDe(j))
        if (faits >= rythme.parPeriode) p.statut = 'fait'
        else if (semaines.some((s) => declaree.has(s))) p.statut = 'declare_semaine'
        else if (maintenant < instantParis(fin, heureFinCreneau(c))) p.statut = 'a_venir'
        else if (maintenant < limitePassage(c, fin)) p.statut = 'en_attente'
        else p.statut = 'manque'
        attendus.push(p)
      }
    }

    // Série de passages manqués, en partant du plus récent évalué.
    let manques = 0
    let confirmes = 0
    const dates: string[] = []
    for (const p of attendus) {
      if (p.statut === 'fait' || p.statut === 'declare_semaine') {
        manques = 0
        confirmes = 0
        dates.length = 0
      } else if (p.statut === 'manque') {
        const n = p.periode ? p.periode.attendus - p.periode.faits : 1
        manques += n
        if (p.reponse === 'pas_venu') confirmes++
        dates.push(p.date)
      }
    }
    passages.push(...attendus)
    series.push({ collecteur: c.nom, manques, confirmes, dates, dernierFait, rythme })
  }

  passages.sort((a, b) => a.date.localeCompare(b.date) || a.collecteur.localeCompare(b.collecteur))
  return { magasinId: magasin.id, du, au, passages, bordereauxParJour, semainesDeclarees, series }
}

/** Fenêtre par défaut : les `n` dernières semaines pleines plus la semaine en cours. */
export function fenetreSemaines(n: number, maintenant = new Date()): { du: string; au: string } {
  const aujourdHui = jourParis(maintenant)
  const lundi = lundiDe(aujourdHui)
  return { du: decalerJour(lundi, -7 * (n - 1)), au: decalerJour(lundi, 6) }
}
