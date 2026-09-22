/**
 * Signature électronique simple du contrat de service Mana.
 *
 * Le portail envoie l'identité du signataire et l'empreinte du texte accepté ;
 * la fonction y ajoute ce que le navigateur ne peut pas attester lui-même —
 * l'adresse IP et l'agent utilisateur vus par le serveur, l'horodatage — et
 * insère la ligne de preuve sous l'identité du compte connecté (RLS).
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const enTetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: enTetes })
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405, headers: enTetes })

  const autorisation = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorisation } },
  })
  const { data: auth, error: erreurAuth } = await supabase.auth.getUser()
  if (erreurAuth || !auth.user) return Response.json({ erreur: 'Connexion requise.' }, { status: 401, headers: enTetes })

  let corps: { societeId?: string; raisonSociale?: string; siren?: string; version?: string; empreinte?: string; nomSignataire?: string }
  try {
    corps = await req.json()
  } catch {
    return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: enTetes })
  }
  const manquant = ['societeId', 'raisonSociale', 'siren', 'version', 'empreinte', 'nomSignataire'].find((k) => !(corps as Record<string, unknown>)[k])
  if (manquant) return Response.json({ erreur: `Champ manquant : ${manquant}.` }, { status: 400, headers: enTetes })
  if (!/^[0-9a-f]{64}$/.test(corps.empreinte!)) return Response.json({ erreur: 'Empreinte invalide.' }, { status: 400, headers: enTetes })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null
  const { data, error } = await supabase
    .from('mana_contrats')
    .insert({
      user_id: auth.user.id,
      societe_id: corps.societeId,
      raison_sociale: corps.raisonSociale,
      siren: corps.siren,
      version: corps.version,
      empreinte: corps.empreinte,
      nom_signataire: String(corps.nomSignataire).trim().slice(0, 120),
      email: auth.user.email ?? '',
      adresse_ip: ip,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    })
    .select('id, signe_le, email, adresse_ip, version')
    .single()
  if (error) return Response.json({ erreur: `Signature impossible : ${error.message}` }, { status: 500, headers: enTetes })
  return Response.json({ contrat: data }, { headers: enTetes })
})
