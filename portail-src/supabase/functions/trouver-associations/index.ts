/**
 * Trouver des associations d'aide alimentaire près d'un magasin — pour la console Mana.
 *
 * Un seul appel à Claude avec la recherche web, borné (6 recherches, effort réduit)
 * pour tenir dans le temps alloué à une fonction. Claude répond directement en
 * JSON au format attendu ; rien n'est inventé : un champ inconnu reste vide, et
 * chaque fiche dit d'où elle vient.
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

const CONSIGNES = `Tu aides Mana, service français qui met en relation des magasins alimentaires bio et des associations pour le don d'invendus (article 238 bis du CGI). Trouve, avec au plus 6 recherches web, les structures d'aide alimentaire capables de venir collecter des invendus près du magasin indiqué.

Priorités : 1) Banque Alimentaire du département et Restos du Cœur (centre le plus proche) : réseaux reconnus d'utilité publique, éligibilité certaine ; 2) Secours populaire, Secours catholique, Croix-Rouge (comité ou unité locale) ; 3) épiceries solidaires, CCAS et associations locales d'aide alimentaire, éligibilité au reçu fiscal à vérifier.

Règles : ne jamais inventer un téléphone, un e-mail ou une adresse ; un champ non trouvé reste vide. Vise 5 à 7 fiches, les plus sûres fiscalement et les plus proches d'abord.

Réponds UNIQUEMENT par un objet JSON, sans texte autour ni balise de code, de la forme :
{"associations":[{"nom":"","type":"Banque Alimentaire | Restos du Cœur | Secours populaire | Secours catholique | Croix-Rouge | épicerie solidaire | CCAS | association locale","adresse":"","telephone":"","email":"","site":"","distance":"ex. 3 km, vide si inconnu","eligibilite":"reseau_national | a_verifier | inconnue","collecteMagasin":"oui | non | inconnu (oui seulement si la structure dit pratiquer la collecte d'invendus en magasin)","note":"une ou deux phrases : pertinence, horaires, réserve","source":"page d'où viennent les informations"}],"remarque":"remarque générale : couverture, ce qui manque, conseil pour le premier contact"}`

const ELIG = new Set(['reseau_national', 'a_verifier', 'inconnue'])
const COLL = new Set(['oui', 'non', 'inconnu'])
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

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
  const adresse = s(corps.adresse).slice(0, 300)
  if (!adresse) return Response.json({ erreur: 'Adresse du magasin manquante.' }, { status: 400, headers: enTetes })

  const question = [
    `Magasin : ${s(corps.magasin).slice(0, 120)}${corps.societe ? ` (société ${s(corps.societe).slice(0, 120)})` : ''}.`,
    `Adresse : ${adresse}.`,
    corps.besoin ? `Besoin exprimé par le magasin : ${s(corps.besoin).slice(0, 500)}.` : '',
    corps.exclure?.length ? `Ne pas proposer (déjà en place ou écartées) : ${corps.exclure.slice(0, 10).map(s).filter(Boolean).join(', ')}.` : '',
  ].filter(Boolean).join('\n')

  try {
    const client = new Anthropic({ apiKey: cle })
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }]
    let texte = ''
    for (let tour = 0; tour < 3; tour++) {
      const rep = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 5000,
        system: CONSIGNES,
        messages,
        output_config: { effort: 'low' },
        // deno-lint-ignore no-explicit-any
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'FR' } } as any],
      })
      if (rep.stop_reason === 'refusal') return Response.json({ erreur: 'Recherche refusée.' }, { status: 422, headers: enTetes })
      messages.push({ role: 'assistant', content: rep.content })
      if (rep.stop_reason === 'pause_turn') continue
      texte = rep.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n')
      break
    }
    const debut = texte.indexOf('{')
    const fin = texte.lastIndexOf('}')
    if (debut < 0 || fin <= debut) return Response.json({ erreur: 'La recherche n’a pas donné de résultat exploitable.', brut: texte.slice(0, 2000) }, { status: 502, headers: enTetes })
    let brut: { associations?: unknown[]; remarque?: unknown }
    try {
      brut = JSON.parse(texte.slice(debut, fin + 1))
    } catch {
      return Response.json({ erreur: 'Réponse inexploitable.', brut: texte.slice(0, 2000) }, { status: 502, headers: enTetes })
    }
    const associations = (Array.isArray(brut.associations) ? brut.associations : [])
      .map((a) => {
        const o = (a ?? {}) as Record<string, unknown>
        return {
          nom: s(o.nom), type: s(o.type), adresse: s(o.adresse), telephone: s(o.telephone), email: s(o.email), site: s(o.site), distance: s(o.distance),
          eligibilite: ELIG.has(s(o.eligibilite)) ? s(o.eligibilite) : 'inconnue',
          collecteMagasin: COLL.has(s(o.collecteMagasin)) ? s(o.collecteMagasin) : 'inconnu',
          note: s(o.note), source: s(o.source),
        }
      })
      .filter((a) => a.nom)
      .slice(0, 8)
    return Response.json({ associations, remarque: s(brut.remarque) }, { headers: enTetes })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erreur inconnue'
    console.error('trouver-associations', message)
    return Response.json({ erreur: `Recherche indisponible : ${message}` }, { status: 502, headers: enTetes })
  }
})
