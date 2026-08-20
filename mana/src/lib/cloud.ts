/**
 * Compte & synchronisation multi-appareils (Supabase).
 * Un document d'état par utilisateur dans `mana_etats`, protégé par RLS :
 * chaque compte ne lit et n'écrit que sa propre ligne. Stratégie hors-ligne
 * d'abord : le localStorage reste la source immédiate, le cloud est le point
 * de synchronisation (le plus récent gagne).
 */
import { createClient } from '@supabase/supabase-js'
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

export async function chargerEtatDistant(): Promise<EtatDistant | null> {
  const { data, error } = await supabase.from('mana_etats').select('data, updated_at').maybeSingle()
  if (error) throw new Error(`Lecture cloud impossible : ${error.message}`)
  if (!data) return null
  const etat = interpreterEtat(data.data)
  if (!etat) return null
  return { etat, majLe: data.updated_at }
}

export async function pousserEtatDistant(userId: string, etat: AppState, email?: string): Promise<string> {
  const updated_at = new Date().toISOString()
  const { error } = await supabase.from('mana_etats').upsert({ user_id: userId, data: etat, updated_at, email: email ?? null })
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
