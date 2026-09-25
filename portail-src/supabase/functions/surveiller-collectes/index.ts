/**
 * Surveillance nocturne des collectes — moteur de signaux Mana.
 *
 * Relit l'état de chaque compte (mana_etats), calcule les signaux avec le même
 * module que le site (lib/signaux.ts : passages manqués 24 h après le créneau,
 * 3 d'affilée = alerte, relevé en retard, plafond, contrat…) et tient la table
 * mana_signaux à jour : un signal vivant par clé, mis à jour chaque nuit, résolu
 * de lui-même quand la cause disparaît (bordereau saisi, contrat signé…).
 *
 * Ne modifie jamais les données des clients : lecture seule sur mana_etats.
 *
 * Déclencheurs : la tâche pg_cron « mana-surveiller-collectes » (clé de service)
 * ou un administrateur Mana depuis la console (« Lancer maintenant »).
 * Les modules de lib/ et types.ts sont des copies de src/ (scripts/preparer-surveillance.sh).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { calculerSignaux, type NiveauSignal, type SignalCalcule } from './lib/signaux.ts'
import { contenuSuivi, estEscalade, meriteUnFil, messageCloture, messageEscalade, messageOuverture, sujetSuivi } from './lib/suivi.ts'
import type { AppState } from './types.ts'

const enTetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RANG: Record<NiveauSignal, number> = { info: 0, attention: 1, alerte: 2 }

interface LigneSignal {
  id: string
  cle: string
  niveau: NiveauSignal
  statut: 'ouvert' | 'traite' | 'ignore' | 'resolu'
  demande_id: string | null
  detail: Record<string, unknown>
}

interface Compte {
  userId: string
  email: string | null
  etat: AppState
}

/** Ouvre le fil de suivi avec le magasin (demande « suivi » + premier message Mana) et l'accroche au signal. */
async function ouvrirFil(sb: SupabaseClient, compte: Compte, signalId: string, s: SignalCalcule, maintenant: string): Promise<string> {
  const { data: d, error } = await sb
    .from('mana_demandes')
    .insert({ user_id: compte.userId, email: compte.email, type: 'suivi', sujet: sujetSuivi(compte.etat, s), contenu: contenuSuivi(compte.etat, s), statut: 'en_cours', lu_mana_le: maintenant })
    .select('id')
    .single()
  if (error) throw new Error(`fil de suivi : ${error.message}`)
  const { error: eMsg } = await sb.from('mana_messages').insert({ demande_id: d.id, user_id: compte.userId, auteur: 'mana', texte: messageOuverture(s) })
  if (eMsg) throw new Error(`message d'ouverture : ${eMsg.message}`)
  await sb.from('mana_signaux').update({ demande_id: d.id }).eq('id', signalId)
  return d.id
}

async function ecrireDansFil(sb: SupabaseClient, compte: Compte, demandeId: string, texte: string, statut?: 'en_cours' | 'traitee') {
  const { error } = await sb.from('mana_messages').insert({ demande_id: demandeId, user_id: compte.userId, auteur: 'mana', texte })
  if (error) throw new Error(`message de suivi : ${error.message}`)
  const maj: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (statut) maj.statut = statut
  await sb.from('mana_demandes').update(maj).eq('id', demandeId)
}

/** Rôle porté par un JWT (payload en base64url), sans en vérifier la signature : la passerelle l'a fait. */
function roleDuJeton(jeton: string): string | null {
  try {
    const partie = jeton.split('.')[1]
    if (!partie) return null
    const b64 = partie.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(partie.length / 4) * 4, '=')
    const charge = JSON.parse(atob(b64)) as { role?: string }
    return charge.role ?? null
  } catch {
    return null
  }
}

/** État lisible : schéma 2 avec ses tableaux ; les états illisibles sont ignorés (et comptés). */
function interpreter(data: unknown): AppState | null {
  const p = data as Partial<AppState> | null
  if (!p || p.schema !== 2) return null
  return {
    schema: 2,
    societes: Array.isArray(p.societes) ? p.societes : [],
    magasins: Array.isArray(p.magasins) ? p.magasins : [],
    saisies: Array.isArray(p.saisies) ? p.saisies : [],
    factures: Array.isArray(p.factures) ? p.factures : [],
    clotures: Array.isArray(p.clotures) ? p.clotures : [],
    reponsesPassages: Array.isArray(p.reponsesPassages) ? p.reponsesPassages : [],
  }
}

async function synchroniser(sb: SupabaseClient, compte: Compte, calcules: SignalCalcule[], maintenant: string) {
  const { data: vivants, error } = await sb.from('mana_signaux').select('id, cle, niveau, statut, demande_id, detail').eq('user_id', compte.userId).is('resolu_le', null)
  if (error) throw new Error(error.message)
  const parCle = new Map<string, LigneSignal>((vivants ?? []).map((v) => [v.cle, v as LigneSignal]))
  let nouveaux = 0
  let resolus = 0
  let fils = 0

  for (const s of calcules) {
    const existant = parCle.get(s.cle)
    // Le dossier retient jusqu'où le magasin a été prévenu, pour ne pas le redire chaque nuit.
    const etapePrevenue = (existant?.detail?.etapePrevenue as string | undefined) ?? undefined
    const colonnes = {
      type: s.type,
      niveau: s.niveau,
      societe_id: s.societeId ?? null,
      magasin_id: s.magasinId ?? null,
      collecteur: s.collecteur ?? null,
      titre: s.titre,
      detail: { ...s.detail, ...(etapePrevenue ? { etapePrevenue } : {}) },
      mis_a_jour_le: maintenant,
    }
    let id: string
    let demandeId = existant?.demande_id ?? null
    if (existant) {
      parCle.delete(s.cle)
      // Un signal déjà traité ou ignoré qui s'aggrave repasse « ouvert » : il mérite un nouveau regard.
      const aggrave = RANG[s.niveau] > RANG[existant.niveau]
      const statut = aggrave && existant.statut !== 'ouvert' ? 'ouvert' : existant.statut
      const { error: e } = await sb.from('mana_signaux').update({ ...colonnes, statut }).eq('id', existant.id)
      if (e) throw new Error(e.message)
      id = existant.id
    } else {
      const { data: ins, error: e } = await sb.from('mana_signaux').insert({ user_id: compte.userId, cle: s.cle, ...colonnes, ouvert_le: maintenant }).select('id').single()
      if (e) throw new Error(e.message)
      id = ins.id
      nouveaux++
    }

    // Fil de suivi avec le magasin : ouvert à 2 passages manqués, escaladé à 3.
    if (meriteUnFil(s)) {
      let prevenue = etapePrevenue
      if (!demandeId) {
        demandeId = await ouvrirFil(sb, compte, id, s, maintenant)
        // Ouvert directement au niveau d'alerte : le message d'ouverture dit déjà que Mana prend la main.
        prevenue = estEscalade(s) ? 'escalade' : 'ouverture'
        fils++
      }
      if (estEscalade(s) && prevenue !== 'escalade') {
        await ecrireDansFil(sb, compte, demandeId, messageEscalade(s), 'en_cours')
        prevenue = 'escalade'
      }
      if (prevenue !== etapePrevenue) {
        await sb.from('mana_signaux').update({ detail: { ...s.detail, etapePrevenue: prevenue } }).eq('id', id)
      }
    }
  }
  // Ce qui n'est plus calculé est résolu de lui-même ; le fil, s'il existe, est refermé avec un mot.
  for (const reste of parCle.values()) {
    const { error: e } = await sb.from('mana_signaux').update({ statut: 'resolu', resolu_le: maintenant, mis_a_jour_le: maintenant }).eq('id', reste.id)
    if (e) throw new Error(e.message)
    if (reste.demande_id) await ecrireDansFil(sb, compte, reste.demande_id, messageCloture(), 'traitee')
    resolus++
  }
  return { nouveaux, resolus, fils, ouverts: calcules.length }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: enTetes })
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405, headers: enTetes })

  const url = Deno.env.get('SUPABASE_URL')!
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const autorisation = req.headers.get('Authorization') ?? ''
  const jeton = autorisation.replace(/^Bearer\s+/i, '').trim()

  // La passerelle Supabase a déjà vérifié la signature du JWT (verify_jwt) : un jeton
  // de rôle service_role vient donc bien de pg_cron (clé du coffre) ou de la plateforme.
  let declencheur = 'cron'
  if (jeton !== cleService && roleDuJeton(jeton) !== 'service_role') {
    try {
      const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: autorisation } } })
      const { data: admin } = await client.rpc('mana_est_admin')
      if (!admin) return Response.json({ erreur: 'Réservé aux administrateurs Mana.' }, { status: 403, headers: enTetes })
      const { data: u } = await client.auth.getUser()
      declencheur = `admin:${u?.user?.email ?? '?'}`
    } catch {
      return Response.json({ erreur: 'Vérification du compte impossible.' }, { status: 401, headers: enTetes })
    }
  }

  const sb = createClient(url, cleService)
  const maintenantDate = new Date()
  const maintenant = maintenantDate.toISOString()
  const { data: run, error: eRun } = await sb.from('mana_surveillances').insert({ declencheur }).select('id').single()
  if (eRun) return Response.json({ erreur: eRun.message }, { status: 500, headers: enTetes })

  const { data: etats, error: eEtats } = await sb.from('mana_etats').select('user_id, email, data')
  if (eEtats) return Response.json({ erreur: eEtats.message }, { status: 500, headers: enTetes })

  const erreurs: { compte: string; erreur: string }[] = []
  const comptes: { email: string | null; ouverts: number; nouveaux: number; resolus: number; fils: number; signaux: { niveau: string; titre: string }[] }[] = []
  let totalOuverts = 0
  let totalNouveaux = 0
  let totalResolus = 0

  for (const ligne of etats ?? []) {
    try {
      const etat = interpreter(ligne.data)
      if (!etat) {
        erreurs.push({ compte: ligne.email ?? ligne.user_id, erreur: 'état illisible (schéma inattendu)' })
        continue
      }
      const calcules = calculerSignaux(etat, maintenantDate)
      const r = await synchroniser(sb, { userId: ligne.user_id, email: ligne.email, etat }, calcules, maintenant)
      totalOuverts += r.ouverts
      totalNouveaux += r.nouveaux
      totalResolus += r.resolus
      comptes.push({ email: ligne.email, ...r, signaux: calcules.map((s) => ({ niveau: s.niveau, titre: s.titre })) })
    } catch (e) {
      erreurs.push({ compte: ligne.email ?? ligne.user_id, erreur: (e as Error).message })
    }
  }

  await sb
    .from('mana_surveillances')
    .update({ terminee_le: new Date().toISOString(), comptes: comptes.length, signaux_ouverts: totalOuverts, nouveaux: totalNouveaux, resolus: totalResolus, erreurs })
    .eq('id', run.id)

  return Response.json({ id: run.id, declencheur, comptes, totaux: { ouverts: totalOuverts, nouveaux: totalNouveaux, resolus: totalResolus }, erreurs }, { headers: enTetes })
})
