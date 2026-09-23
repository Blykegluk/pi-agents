/**
 * Trouver des associations d'aide alimentaire près d'un magasin — pour la console Mana.
 *
 * Deux temps : Claude cherche sur le web (banques alimentaires, Restos du Cœur,
 * Secours populaire, Secours catholique, Croix-Rouge, épiceries solidaires, CCAS,
 * associations locales habilitées) autour de l'adresse donnée, puis une seconde
 * passe met le résultat au format attendu par le portail. Rien n'est inventé : un
 * champ inconnu reste vide, et chaque fiche dit d'où elle vient.
 *
 * Réservé aux administrateurs Mana (vérifié en base). Clé d'API dans le secret
 * ANTHROPIC_API_KEY ; JWT vérifié par Supabase.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.125.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const enTetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['associations', 'remarque'],
  properties: {
    associations: {
      type: 'array',
      description: 'Associations trouvées, les plus sûres fiscalement et les plus proches en premier. 8 au plus.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nom', 'type', 'adresse', 'telephone', 'email', 'site', 'distance', 'eligibilite', 'collecteMagasin', 'note', 'source'],
        properties: {
          nom: { type: 'string' },
          type: { type: 'string', description: 'Banque Alimentaire, Restos du Cœur, Secours populaire, Secours catholique, Croix-Rouge, épicerie solidaire, CCAS, association locale…' },
          adresse: { type: 'string', description: 'Adresse postale complète si trouvée, sinon commune.' },
          telephone: { type: 'string', description: 'Vide si non trouvé.' },
          email: { type: 'string', description: 'Vide si non trouvé. Jamais inventé.' },
          site: { type: 'string', description: 'URL, vide si aucune.' },
          distance: { type: 'string', description: 'Distance ou temps approximatif depuis le magasin, ex. « 3 km » ; vide si inconnu.' },
          eligibilite: { type: 'string', enum: ['reseau_national', 'a_verifier', 'inconnue'], description: 'reseau_national pour les grands réseaux reconnus d’utilité publique ; a_verifier pour une association locale ou un CCAS ; inconnue sinon.' },
          collecteMagasin: { type: 'string', enum: ['oui', 'non', 'inconnu'], description: '« oui » seulement si la structure dit elle-même pratiquer la collecte d’invendus en magasin.' },
          note: { type: 'string', description: 'Une ou deux phrases : pertinence, horaires, réserve ou risque.' },
          source: { type: 'string', description: 'Site ou page d’où viennent les informations.' },
        },
      },
    },
    remarque: { type: 'string', description: 'Remarque générale : couverture, ce qui manque, conseil pour le premier contact.' },
  },
} as const

const CONSIGNES_RECHERCHE = `Tu aides Mana, service français qui met en relation des magasins alimentaires bio et des associations pour le don d'invendus (article 238 bis du CGI). Cherche sur le web les structures d'aide alimentaire capables de venir collecter des invendus près du magasin indiqué, et donne pour chacune : nom exact, type, adresse, téléphone, e-mail, site, distance approximative, si elle pratique déjà la collecte d'invendus en magasin, et une note sur sa pertinence.

Priorités : 1) Banque Alimentaire du département et Restos du Cœur (association départementale ou centre le plus proche) — réseaux reconnus d'utilité publique, éligibilité certaine ; 2) Secours populaire, Secours catholique, Croix-Rouge (comité ou unité locale) ; 3) épiceries solidaires, CCAS et associations locales d'aide alimentaire, en signalant que leur éligibilité au reçu fiscal est à vérifier.

Règles : ne jamais inventer un téléphone, un e-mail ou une adresse ; si tu ne trouves pas, dis-le. Cite la page source pour chaque fiche. Réponds en français, sous forme de liste détaillée.`

const CONSIGNES_FORMAT = `Mets la recherche ci-dessous au format demandé, sans rien ajouter qui n'y figure pas. Un champ non trouvé reste vide. Classe par sûreté fiscale puis proximité.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: enTetes })
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405, headers: enTetes })

  const cle = Deno.env.get('ANTHROPIC_API_KEY')
  if (!cle) return Response.json({ erreur: 'Recherche indisponible : la clé ANTHROPIC_API_KEY n’est pas configurée sur le projet Supabase.' }, { status: 503, headers: enTetes })

  // Réservé aux administrateurs Mana : on vérifie le compte porteur du JWT.
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: admin } = await supabase.rpc('mana_est_admin')
    if (!admin) return Response.json({ erreur: 'Réservé aux administrateurs Mana.' }, { status: 403, headers: enTetes })
  } catch {
    return Response.json({ erreur: 'Vérification du compte impossible.' }, { status: 401, headers: enTetes })
  }

  let corps: { adresse?: string; magasin?: string; societe?: string; besoin?: string; exclure?: string[] }
  try {
    corps = await req.json()
  } catch {
    return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: enTetes })
  }
  const adresse = (corps.adresse ?? '').trim().slice(0, 300)
  if (!adresse) return Response.json({ erreur: 'Adresse du magasin manquante.' }, { status: 400, headers: enTetes })

  const question = [
    `Magasin : ${(corps.magasin ?? '').slice(0, 120)}${corps.societe ? ` (société ${String(corps.societe).slice(0, 120)})` : ''}.`,
    `Adresse : ${adresse}.`,
    corps.besoin ? `Besoin exprimé par le magasin : ${String(corps.besoin).slice(0, 500)}.` : '',
    corps.exclure?.length ? `Ne pas proposer (déjà en place ou écartées) : ${corps.exclure.slice(0, 10).join(', ')}.` : '',
    'Trouve 5 à 8 associations pertinentes, les plus proches d’abord dans chaque catégorie.',
  ].filter(Boolean).join('\n')

  try {
    const client = new Anthropic({ apiKey: cle })
    // 1. Recherche web
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }]
    let recherche = ''
    for (let tour = 0; tour < 4; tour++) {
      const rep = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 8000,
        system: CONSIGNES_RECHERCHE,
        messages,
        // deno-lint-ignore no-explicit-any
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10, user_location: { type: 'approximate', country: 'FR' } } as any],
      })
      if (rep.stop_reason === 'refusal') return Response.json({ erreur: 'Recherche refusée.' }, { status: 422, headers: enTetes })
      messages.push({ role: 'assistant', content: rep.content })
      if (rep.stop_reason === 'pause_turn') continue
      recherche = rep.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')
      break
    }
    if (!recherche.trim()) return Response.json({ erreur: 'La recherche n’a rien donné.' }, { status: 502, headers: enTetes })

    // 2. Mise au format
    const structure = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 6000,
      system: CONSIGNES_FORMAT,
      messages: [{ role: 'user', content: `Magasin : ${corps.magasin ?? ''} — ${adresse}\n\nRésultat de la recherche :\n\n${recherche}` }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    })
    const texte = structure.content.find((b) => b.type === 'text')
    if (!texte || texte.type !== 'text') return Response.json({ erreur: 'Mise en forme impossible.' }, { status: 502, headers: enTetes })
    const resultat = JSON.parse(texte.text)
    return Response.json({ ...resultat, recherche }, { headers: enTetes })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erreur inconnue'
    console.error('trouver-associations', message)
    return Response.json({ erreur: `Recherche indisponible : ${message}` }, { status: 502, headers: enTetes })
  }
})
