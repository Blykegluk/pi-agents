/**
 * Compte & synchronisation multi-appareils (Supabase).
 * Un document d'état par utilisateur dans `mana_etats`, protégé par RLS :
 * chaque compte ne lit et n'écrit que sa propre ligne. Stratégie hors-ligne
 * d'abord : le localStorage reste la source immédiate, le cloud est le point
 * de synchronisation (le plus récent gagne).
 */
import { createClient, type Session } from '@supabase/supabase-js'
import type { AppState } from '../types'
import { interpreterEtat } from './storage'

const SUPABASE_URL = 'https://wygptxqkptuabdefonhe.supabase.co'
// Clé publiable : ne donne accès qu'à ce que la RLS autorise.
const SUPABASE_KEY = 'sb_publishable_ahjauuQdr9cMN8QRR0toWg_kzKeVWWF'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export interface EtatDistant {
  etat: AppState
  majLe: string
}

// ---------- Accès partagés (magasin ou assistante) ----------

export interface Acces {
  id: string
  proprietaire: string
  email: string
  /** Magasin autorisé ; null = tous les magasins du propriétaire (assistante). */
  magasin_id: string | null
  libelle: string | null
  cree_le: string
}

/**
 * Compte dont on manipule les données : le sien, ou celui du propriétaire
 * quand on est connecté avec un accès partagé. Fixé par l'application dès la
 * connexion, avant toute lecture ; tous les appels cloud passent par ici.
 */
let compteDelegue: string | null = null
export function definirCompteDelegue(proprietaire: string | null) {
  compteDelegue = proprietaire
}
export function compteId(session: Session): string {
  return compteDelegue ?? session.user.id
}

/** L'accès partagé reçu par le compte connecté, s'il y en a un. */
export async function monAcces(): Promise<Acces | null> {
  const { data, error } = await supabase.from('mana_acces').select('*').order('cree_le', { ascending: true }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Acces | null) ?? null
}

/** Accès que ce compte a donnés (propriétaire). */
export async function listerAcces(proprietaire: string): Promise<Acces[]> {
  const { data, error } = await supabase.from('mana_acces').select('*').eq('proprietaire', proprietaire).order('cree_le', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Acces[]
}

export async function ajouterAcces(proprietaire: string, email: string, magasinId: string | null, libelle: string): Promise<Acces> {
  const { data, error } = await supabase
    .from('mana_acces')
    .insert({ proprietaire, email: email.trim().toLowerCase(), magasin_id: magasinId, libelle: libelle.trim() || null })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Cette adresse a déjà un accès — supprimez-le d’abord pour le modifier.')
    throw new Error(error.message)
  }
  return data as Acces
}

export async function supprimerAcces(id: string): Promise<void> {
  const { error } = await supabase.from('mana_acces').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Seulement l'horodatage : assez pour savoir si le serveur a bougé, sans rapatrier l'état. */
export async function dateEtatDistant(compte: string): Promise<string | null> {
  const { data, error } = await supabase.from('mana_etats').select('updated_at').eq('user_id', compte).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.updated_at ?? null
}

export async function chargerEtatDistant(compte: string): Promise<EtatDistant | null> {
  const { data, error } = await supabase.from('mana_etats').select('data, updated_at').eq('user_id', compte).maybeSingle()
  if (error) throw new Error(`Lecture cloud impossible : ${error.message}`)
  if (!data) return null
  const etat = interpreterEtat(data.data)
  if (!etat) return null
  return { etat, majLe: data.updated_at }
}

/** `email` n'est renseigné que par le propriétaire : un invité ne touche pas à l'identité du compte. */
export async function pousserEtatDistant(userId: string, etat: AppState, email?: string): Promise<string> {
  const updated_at = new Date().toISOString()
  const { error } = await supabase.from('mana_etats').upsert({ user_id: userId, data: etat, updated_at, ...(email ? { email } : {}) })
  if (error) throw new Error(`Synchronisation impossible : ${error.message}`)
  return updated_at
}

// ---------- Demandes (mise en relation collecte, support) & messagerie ----------

export interface Demande {
  id: string
  user_id: string
  email: string | null
  type: 'collecte' | 'support'
  sujet: string
  contenu: Record<string, unknown>
  statut: 'nouvelle' | 'en_cours' | 'traitee'
  created_at: string
  updated_at: string
  /** Dernière ouverture du fil par le client / par Mana — sert aux pastilles. */
  lu_client_le: string | null
  lu_mana_le: string | null
}

export interface Message {
  id: string
  demande_id: string
  auteur: 'client' | 'mana'
  texte: string
  created_at: string
}

export async function creerDemande(
  userId: string,
  email: string,
  type: Demande['type'],
  sujet: string,
  contenu: Record<string, unknown>,
  premierMessage: string,
): Promise<Demande> {
  const { data, error } = await supabase
    .from('mana_demandes')
    .insert({ user_id: userId, email, type, sujet, contenu })
    .select()
    .single()
  if (error) throw new Error(`Envoi impossible : ${error.message}`)
  if (premierMessage.trim()) {
    await supabase.from('mana_messages').insert({ demande_id: data.id, user_id: userId, auteur: 'client', texte: premierMessage.trim() })
  }
  return data as Demande
}

export async function mesDemandes(): Promise<Demande[]> {
  const { data, error } = await supabase.from('mana_demandes').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Demande[]
}

export async function messagesDe(demandeId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('mana_messages')
    .select('id, demande_id, auteur, texte, created_at')
    .eq('demande_id', demandeId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Message[]
}

export async function envoyerMessage(demandeId: string, proprietaireId: string, auteur: 'client' | 'mana', texte: string): Promise<void> {
  const { error } = await supabase
    .from('mana_messages')
    .insert({ demande_id: demandeId, user_id: proprietaireId, auteur, texte: texte.trim() })
  if (error) throw new Error(`Envoi impossible : ${error.message}`)
  // Écrire, c'est avoir lu.
  await marquerLu(demandeId, auteur)
}

/** Marque un fil comme lu de son côté (RPC : le client ne peut toucher que son marqueur). */
export async function marquerLu(demandeId: string, cote: 'client' | 'mana'): Promise<void> {
  await supabase.rpc('mana_marquer_lu', { p_demande: demandeId, p_cote: cote })
}

export interface NonLus {
  total: number
  /** Nombre de messages non lus par identifiant de demande. */
  parDemande: Record<string, number>
}

/**
 * Messages reçus depuis la dernière ouverture du fil, vus du côté demandé.
 * Deux requêtes seulement : les fils visibles (la RLS filtre déjà) et leurs
 * messages ; le comptage se fait ici pour éviter une vue SQL de plus.
 */
export async function compterNonLus(cote: 'client' | 'mana'): Promise<NonLus> {
  const [fils, msgs] = await Promise.all([
    supabase.from('mana_demandes').select('id, lu_client_le, lu_mana_le'),
    supabase.from('mana_messages').select('demande_id, auteur, created_at'),
  ])
  if (fils.error || msgs.error) return { total: 0, parDemande: {} }
  const luLe = new Map<string, number>()
  for (const f of fils.data ?? []) {
    const d = cote === 'client' ? f.lu_client_le : f.lu_mana_le
    luLe.set(f.id, d ? Date.parse(d) : 0)
  }
  const parDemande: Record<string, number> = {}
  let total = 0
  for (const m of msgs.data ?? []) {
    if (m.auteur === cote) continue // ses propres messages ne sont jamais « non lus »
    const seuil = luLe.get(m.demande_id)
    if (seuil === undefined) continue
    if (Date.parse(m.created_at) > seuil) {
      parDemande[m.demande_id] = (parDemande[m.demande_id] ?? 0) + 1
      total++
    }
  }
  return { total, parDemande }
}

// ---------- Console administrateur ----------

export async function estAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('mana_est_admin')
  return !error && data === true
}

export interface ClientAdmin {
  user_id: string
  email: string | null
  updated_at: string
  etat: AppState | null
}

export async function listerClients(): Promise<ClientAdmin[]> {
  const { data, error } = await supabase.from('mana_etats').select('user_id, email, updated_at, data').order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((l) => ({
    user_id: l.user_id,
    email: l.email,
    updated_at: l.updated_at,
    etat: interpreterEtat(l.data),
  }))
}

export async function majStatutDemande(demandeId: string, statut: Demande['statut']): Promise<void> {
  const { error } = await supabase
    .from('mana_demandes')
    .update({ statut, updated_at: new Date().toISOString() })
    .eq('id', demandeId)
  if (error) throw new Error(error.message)
}

export async function connexion(email: string, motDePasse: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
  if (!error) return null
  if (error.message.includes('Invalid login credentials')) return 'E-mail ou mot de passe incorrect.'
  if (error.message.includes('Email not confirmed')) return 'E-mail non confirmé : cliquez sur le lien reçu par mail, puis reconnectez-vous.'
  return error.message
}

export async function inscription(email: string, motDePasse: string): Promise<{ erreur?: string; confirmationRequise?: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password: motDePasse })
  if (error) {
    if (error.message.includes('already registered')) return { erreur: 'Un compte existe déjà avec cet e-mail — connectez-vous.' }
    if (error.message.toLowerCase().includes('password')) return { erreur: 'Mot de passe trop court : 6 caractères minimum.' }
    return { erreur: error.message }
  }
  return { confirmationRequise: !data.session }
}

export async function connexionGoogle(): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  })
  if (!error) return null // le navigateur part vers Google
  if (error.message.toLowerCase().includes('provider') || error.message.toLowerCase().includes('not enabled')) {
    return 'Connexion Google pas encore activée — utilisez e-mail + mot de passe en attendant.'
  }
  return error.message
}

export async function deconnexion(): Promise<void> {
  await supabase.auth.signOut()
}

// ---------- Bordereaux scannés : archivage et lecture automatique ----------

const BUCKET_BORDEREAUX = 'mana-bordereaux'

/**
 * Archive la photo du bordereau dans le bucket privé, sous l'arborescence du
 * compte (la RLS interdit tout autre dossier). Les photos ne peuvent pas rester
 * dans le localStorage : avec un enlèvement par jour, cela ferait des centaines
 * de mégaoctets par an.
 */
export async function televerserBordereau(userId: string, blob: Blob, nom: string): Promise<string> {
  const chemin = `${userId}/${new Date().getFullYear()}/${crypto.randomUUID()}-${nom}`
  const { error } = await supabase.storage.from(BUCKET_BORDEREAUX).upload(chemin, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
  })
  if (error) throw new Error(`Archivage du bordereau impossible : ${error.message}`)
  return chemin
}

/** Liens temporaires (1 h) pour toute une liste de bordereaux — une seule requête. */
export async function urlsBordereaux(chemins: string[]): Promise<Record<string, string>> {
  if (chemins.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET_BORDEREAUX).createSignedUrls(chemins, 3600)
  if (error || !data) return {}
  const out: Record<string, string> = {}
  for (const d of data) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}

/** Retire le fichier du bucket quand la pièce est supprimée — pas d'orphelin. */
export async function supprimerFichierBordereau(chemin: string): Promise<void> {
  await supabase.storage.from(BUCKET_BORDEREAUX).remove([chemin])
}

/** Lien temporaire (1 h) pour rouvrir un bordereau archivé. */
export async function urlBordereau(chemin: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET_BORDEREAUX).createSignedUrl(chemin, 3600)
  return error ? null : data.signedUrl
}

export interface LectureBordereau {
  estUnBordereau: boolean
  date: string
  association: string
  nomCollecteur: string
  nbColis: number
  kgFL: number
  kgPain: number
  kgAutres: number
  autresPrecision: string
  refus: string
  signe: boolean
  confiance: 'haute' | 'moyenne' | 'basse'
  doutes: string[]
}

/**
 * Lecture du bordereau par la fonction serveur `lire-bordereau`. La clé d'API
 * vit côté Supabase : rien de sensible ne transite par le navigateur. Le
 * résultat est une PROPOSITION, que la saisie fait valider au magasin.
 */
export async function lireBordereau(
  base64: string,
  typeMime: string,
  contexte: { magasin?: string; associations?: string[]; jour?: string; aujourdhui?: string },
): Promise<LectureBordereau> {
  const { data, error } = await supabase.functions.invoke<{ lecture?: LectureBordereau; erreur?: string }>(
    'lire-bordereau',
    { body: { image: base64, typeMime, contexte } },
  )
  if (error) {
    // Les erreurs métier arrivent avec un statut non-2xx : on récupère le message.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detail?.erreur ?? error.message)
  }
  if (!data?.lecture) throw new Error(data?.erreur ?? 'Lecture impossible.')
  return data.lecture
}

// ---------- Relevés de démarque : lecture automatique ----------

export interface LectureReleve {
  estUnReleve: boolean
  du: string
  au: string
  montant: number
  unite: 'ht' | 'ttc' | 'inconnu'
  nature: 'prix_vente' | 'prix_achat' | 'inconnu'
  tauxTVA: number
  lignes: { date: string; montant: number }[]
  confiance: 'haute' | 'moyenne' | 'basse'
  doutes: string[]
}

/** Lecture d'un export de démarque (image ou PDF) par la fonction `lire-releve`. Proposition à valider. */
export async function lireReleve(base64: string, typeMime: string, contexte: { magasin?: string; periodeAttendue?: string }): Promise<LectureReleve> {
  const { data, error } = await supabase.functions.invoke<{ lecture?: LectureReleve; erreur?: string }>('lire-releve', {
    body: { fichier: base64, typeMime, contexte },
  })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detail?.erreur ?? error.message)
  }
  if (!data?.lecture) throw new Error(data?.erreur ?? 'Lecture impossible.')
  return data.lecture
}

/** Pièces d'une association → critères factuels lus par Claude (le verdict se calcule côté portail). */
export type AnalyseBrute = Omit<import('../types').AnalyseAssociation, 'le' | 'verdict' | 'actions'>
export async function analyserAssociation(
  documents: { fichier: string; typeMime: string; nom: string }[],
  contexte: { nomAssociation?: string; magasin?: string },
): Promise<AnalyseBrute> {
  const { data, error } = await supabase.functions.invoke<{ analyse?: AnalyseBrute; erreur?: string }>('analyser-association', {
    body: { documents, contexte },
  })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detail?.erreur ?? error.message)
  }
  if (!data?.analyse) throw new Error(data?.erreur ?? 'Analyse impossible.')
  return data.analyse
}

/** Récupère en base64 des pièces déjà archivées (pour les réanalyser avec les nouvelles). */
export async function telechargerPieces(chemins: string[]): Promise<{ chemin: string; base64: string; typeMime: string }[]> {
  const out: { chemin: string; base64: string; typeMime: string }[] = []
  for (const chemin of chemins) {
    const { data, error } = await supabase.storage.from(BUCKET_BORDEREAUX).download(chemin)
    if (error || !data) continue
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
      r.onerror = () => reject(r.error)
      r.readAsDataURL(data)
    })
    out.push({ chemin, base64, typeMime: data.type || 'application/octet-stream' })
  }
  return out
}

/** Archive une pièce d'association (statuts, rescrit…) dans le bucket du compte. */
export async function televerserDocumentAssociation(userId: string, fichier: File | Blob, nom: string): Promise<string> {
  const chemin = `${userId}/associations/${crypto.randomUUID()}-${nom}`
  const { error } = await supabase.storage.from(BUCKET_BORDEREAUX).upload(chemin, fichier, { contentType: (fichier as File).type || 'application/octet-stream', upsert: false })
  if (error) throw new Error(`Archivage impossible : ${error.message}`)
  return chemin
}

// ---------- Contrat de service signé en ligne ----------

export interface ContratDistant {
  id: string
  signe_le: string
  email: string
  adresse_ip: string | null
  version: string
}

/** Signe le contrat : la fonction serveur ajoute IP, agent et horodatage à la preuve. */
export async function signerContrat(corps: { societeId: string; raisonSociale: string; siren: string; version: string; empreinte: string; nomSignataire: string }): Promise<ContratDistant> {
  const { data, error } = await supabase.functions.invoke<{ contrat?: ContratDistant; erreur?: string }>('signer-contrat', { body: corps })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detail?.erreur ?? error.message)
  }
  if (!data?.contrat) throw new Error(data?.erreur ?? 'Signature impossible.')
  return data.contrat
}

/** Les preuves de signature d'une société (la plus récente en premier). */
export async function contratsSignes(societeId: string): Promise<(ContratDistant & { nom_signataire: string; empreinte: string })[]> {
  const { data, error } = await supabase
    .from('mana_contrats')
    .select('id, signe_le, email, adresse_ip, version, nom_signataire, empreinte')
    .eq('societe_id', societeId)
    .order('signe_le', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as (ContratDistant & { nom_signataire: string; empreinte: string })[]
}
