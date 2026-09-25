/**
 * Rédaction assistée pour la console Mana (administrateurs seulement).
 *  - mode « reecrire » : réécrit un brouillon (objet + corps) selon les règles de style de
 *    l'équipe et ses dernières corrections (proposé → envoyé), sans changer les faits.
 *  - mode « regles » : déduit des règles de style lisibles à partir des corrections.
 * Clé d'API dans le secret ANTHROPIC_API_KEY ; JWT vérifié par Supabase, admin vérifié en base.
 * Déployée le 25/09/2026 (le code déployé est identique à ce fichier).
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.125.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const enTetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Brouillon { objet: string; corps: string }
interface Exemple { propose: Brouillon; envoye: Brouillon }

const s = (v: unknown, max = 6000) => (typeof v === 'string' ? v.slice(0, max) : '')

function exemplesTexte(exemples: Exemple[]): string {
  return exemples
    .slice(0, 5)
    .map((e, i) => `--- Exemple ${i + 1} ---\nPROPOSÉ (objet) : ${e.propose.objet}\nPROPOSÉ (corps) :\n${e.propose.corps}\n\nENVOYÉ (objet) : ${e.envoye.objet}\nENVOYÉ (corps) :\n${e.envoye.corps}`)
    .join('\n\n')
}

function extraireJSON(texte: string): unknown {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut < 0 || fin < 0) throw new Error('Réponse illisible.')
  return JSON.parse(texte.slice(debut, fin + 1))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: enTetes })
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405, headers: enTetes })

  const cle = Deno.env.get('ANTHROPIC_API_KEY')
  if (!cle) return Response.json({ erreur: 'Rédaction indisponible : la clé ANTHROPIC_API_KEY n’est pas configurée sur le projet Supabase.' }, { status: 503, headers: enTetes })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: admin } = await supabase.rpc('mana_est_admin')
    if (!admin) return Response.json({ erreur: 'Réservé aux administrateurs Mana.' }, { status: 403, headers: enTetes })
  } catch {
    return Response.json({ erreur: 'Vérification du compte impossible.' }, { status: 401, headers: enTetes })
  }

  let corps: { mode?: string; genre?: string; brouillon?: Brouillon; regles?: string; exemples?: Exemple[] }
  try {
    corps = await req.json()
  } catch {
    return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: enTetes })
  }
  const exemples = (Array.isArray(corps.exemples) ? corps.exemples : [])
    .filter((e) => e && e.propose && e.envoye)
    .map((e) => ({ propose: { objet: s(e.propose.objet, 300), corps: s(e.propose.corps) }, envoye: { objet: s(e.envoye.objet, 300), corps: s(e.envoye.corps) } }))
  const client = new Anthropic({ apiKey: cle })

  try {
    if (corps.mode === 'regles') {
      if (exemples.length === 0) return Response.json({ erreur: 'Aucune correction à analyser.' }, { status: 400, headers: enTetes })
      const rep = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1200,
        messages: [
          {
            role: 'user',
            content:
              `Tu aides l’équipe de Mana (service français de dons d’invendus alimentaires) à formaliser son style de rédaction. ` +
              `Voici des mails : la version proposée automatiquement, puis la version réellement envoyée après correction par l’équipe. ` +
              `Déduis-en des règles de style concrètes et réutilisables (ton, longueur, formules d’ouverture et de clôture, vocabulaire à préférer ou éviter, structure), ` +
              `en français, sous forme de liste de 5 à 12 puces courtes. N’invente rien qui ne ressorte pas des corrections. ` +
              `Réponds UNIQUEMENT par un objet JSON {"regles": "..."} (les puces séparées par des retours à la ligne).\n\n` +
              exemplesTexte(exemples),
          },
        ],
      })
      const texte = rep.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
      const json = extraireJSON(texte) as { regles?: string }
      return Response.json({ regles: s(json.regles, 4000) }, { headers: enTetes })
    }

    const brouillon = corps.brouillon
    if (!brouillon || !s(brouillon.corps)) return Response.json({ erreur: 'Brouillon manquant.' }, { status: 400, headers: enTetes })
    const regles = s(corps.regles, 4000)
    if (!regles && exemples.length === 0) return Response.json({ objet: s(brouillon.objet, 300), corps: s(brouillon.corps), inchange: true }, { headers: enTetes })
    const rep = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2500,
      messages: [
        {
          role: 'user',
          content:
            `Tu réécris un mail pour l’équipe de Mana (service français qui met en relation des magasins alimentaires et des associations pour le don d’invendus). ` +
            `Genre du mail : ${s(corps.genre, 40) || 'inconnu'}. ` +
            `Garde exactement les faits, noms, dates, montants, adresses et engagements du brouillon ; n’ajoute aucune information. ` +
            `Adapte seulement le ton, la formulation, la longueur et la structure au style de l’équipe, décrit par les règles ci-dessous et illustré par ses corrections passées. ` +
            `Conserve la signature telle quelle. Réponds UNIQUEMENT par un objet JSON {"objet": "...", "corps": "..."} (retours à la ligne échappés en \\n).\n\n` +
            (regles ? `RÈGLES DE STYLE :\n${regles}\n\n` : '') +
            (exemples.length ? `CORRECTIONS PASSÉES (proposé → envoyé) :\n${exemplesTexte(exemples)}\n\n` : '') +
            `BROUILLON À RÉÉCRIRE\nObjet : ${s(brouillon.objet, 300)}\nCorps :\n${s(brouillon.corps)}`,
        },
      ],
    })
    const texte = rep.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
    const json = extraireJSON(texte) as { objet?: string; corps?: string }
    if (!s(json.corps)) throw new Error('Réponse sans corps de mail.')
    return Response.json({ objet: s(json.objet, 300) || s(brouillon.objet, 300), corps: s(json.corps) }, { headers: enTetes })
  } catch (e) {
    return Response.json({ erreur: `Rédaction impossible : ${(e as Error).message}` }, { status: 502, headers: enTetes })
  }
})
