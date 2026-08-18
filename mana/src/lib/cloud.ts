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

export async function pousserEtatDistant(userId: string, etat: AppState): Promise<string> {
  const updated_at = new Date().toISOString()
  const { error } = await supabase.from('mana_etats').upsert({ user_id: userId, data: etat, updated_at })
  if (error) throw new Error(`Synchronisation impossible : ${error.message}`)
  return updated_at
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
