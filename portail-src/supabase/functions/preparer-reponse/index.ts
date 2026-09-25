/**
 * Réponses préparées aux messages des clients (console Mana).
 *
 * Appelée par le déclencheur de mana_messages (clé service) à chaque message client, ou depuis
 * la console par un administrateur (« Préparer une réponse », « Proposer une autre version »).
 * Rédige une réponse avec le contexte du dossier, le compte du client, la FAQ, les règles de
 * style de l'équipe et ses corrections passées, puis l'enregistre dans mana_brouillons_reponse.
 *
 * Envoi autonome : seulement si l'équipe l'a activé (mana_parametres « reponse_auto »), si les
 * dernières réponses préparées ont été validées sans retouche notable (SEUIL_*), et si le modèle
 * juge lui-même la réponse sûre (confiance haute, rien à valider). Sinon, la réponse attend.
 * Clé d'API dans le secret ANTHROPIC_API_KEY.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.125.0'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { FAQ } from './faq.ts'

const MODELE = 'claude-opus-5'
/** Autonomie : au moins N réponses traitées, dont une part suffisante validée sans retouche notable. */
export const SEUIL_NOMBRE = 20
export const SEUIL_TAUX = 0.85
/** Écart (0 = identique, 1 = tout réécrit) en dessous duquel une retouche est jugée légère. */
export const ECART_LEGER = 0.15

const enTetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SCHEMA = {
  type: 'object',
  properties: {
    reponse: { type: 'string', description: 'Le message à envoyer au client, prêt à partir, sans objet ni signature ajoutée.' },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
    a_valider: { type: 'boolean', description: 'true si un humain doit décider ou vérifier avant l’envoi.' },
    raison: { type: 'string', description: 'En une phrase : ce que l’équipe doit vérifier ou décider, ou vide.' },
  },
  required: ['reponse', 'confiance', 'a_valider', 'raison'],
  additionalProperties: false,
}

const SYSTEME = `Tu rédiges, au nom de l’équipe Mana, la réponse à un message qu’un client vient d’écrire dans son espace Mana.

Mana est un service français pour les commerces alimentaires : il organise le don des invendus à des associations d’aide alimentaire, documente chaque don (bordereaux signés, relevés de démarque) et produit les justificatifs de la réduction d’impôt mécénat (article 238 bis du CGI, 60 % du coût de revient des denrées, plafond de 20 000 € ou 0,5 % du CA HT). Mana est rémunéré par une commission sur la réduction obtenue, sans abonnement. Mana surveille chaque nuit les passages des associations et relance ou remplace une association défaillante.

Qui écrit : le dirigeant d’un magasin ou d’un petit groupe, ou un responsable de magasin. Il veut une réponse courte, concrète, qui lui dit quoi faire ou ce que Mana fait pour lui.

Comment répondre :
- En français, vouvoiement, ton simple et chaleureux, phrases courtes. Commence par « Bonjour, » et termine par « L’équipe Mana ».
- Réponds à la question posée, avec les informations du dossier, du compte et de la FAQ. Indique l’écran de Mana où agir quand c’est utile (Saisie, Magasins, Bilan, Messages).
- N’invente aucun fait, montant, date ou engagement. Si l’information manque, dis ce que Mana va vérifier plutôt que de supposer.
- Ne promets rien que l’équipe devra tenir (délai, geste commercial, remise, modification de contrat, avis fiscal personnalisé, mise en relation garantie) : rédige une réponse prudente et mets a_valider à true.

Auto-évaluation, obligatoire :
- confiance « haute » : question simple, réponse entièrement couverte par la FAQ, le dossier ou le compte, aucune décision à prendre.
- « moyenne » : réponse probablement juste mais qui mérite un coup d’œil.
- « basse » : information manquante, sujet sensible (réclamation, mécontentement, résiliation, facturation contestée, question fiscale ou juridique pointue), ou message ambigu.
- a_valider à true dès que la confiance n’est pas haute, ou qu’il faut une décision ou un engagement de l’équipe. raison dit alors, en une phrase, quoi vérifier.`

const s = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '')

function roleDuJeton(jeton: string): string | null {
  try {
    const partie = jeton.split('.')[1]
    if (!partie) return null
    const b64 = partie.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(partie.length / 4) * 4, '=')
    return (JSON.parse(atob(b64)) as { role?: string }).role ?? null
  } catch {
    return null
  }
}

const LIBELLE_TYPE: Record<string, string> = {
  support: 'question du client',
  collecte: 'demande de mise en relation avec une association',
  association: 'changement ou problème avec une association en place',
  suivi: 'suivi de collecte ouvert par Mana',
}

/** Ce que Mana sait du compte, en quelques lignes : sociétés, magasins, associations, derniers bordereaux. */
function resumeCompte(etat: Record<string, unknown> | null): string {
  if (!etat) return 'Compte : aucune donnée synchronisée.'
  const societes = (etat.societes as Record<string, unknown>[] | undefined) ?? []
  const magasins = (etat.magasins as Record<string, unknown>[] | undefined) ?? []
  const saisies = (etat.saisies as Record<string, unknown>[] | undefined) ?? []
  const lignes: string[] = []
  for (const so of societes) {
    const contrat = so.contrat ? 'contrat Mana signé' : 'contrat Mana NON signé'
    const verif = (so.verification as Record<string, unknown> | undefined)?.caVerifieLe ? 'CA vérifié' : 'CA en attente de justificatif'
    lignes.push(`Société ${s(so.raisonSociale, 120)} (SIREN ${s(so.siren, 20)}) : ${contrat}, ${verif}.`)
    for (const m of magasins.filter((x) => x.societeId === so.id)) {
      const assos = ((m.collecteurs as Record<string, unknown>[] | undefined) ?? []).map((c) => `${s(c.nom, 80)}${c.frequence ? ` (${s(c.frequence, 40)}${c.jours ? `, ${s(c.jours, 60)}` : ''})` : ''}`)
      const jours = saisies.filter((x) => x.magasinId === m.id && typeof x.jour === 'string').map((x) => String(x.jour)).sort()
      const releves = saisies.filter((x) => x.magasinId === m.id && x.origine === 'releve').length
      lignes.push(`  Magasin ${s(m.nom, 80)} : associations ${assos.join(', ') || 'aucune'} ; ${jours.length} bordereau(x)${jours.length ? `, dernier le ${jours[jours.length - 1]}` : ''} ; ${releves} relevé(s) de démarque.`)
    }
  }
  return lignes.join('\n') || 'Compte : aucune société enregistrée.'
}

async function autonomieOuverte(sb: SupabaseClient): Promise<{ ouverte: boolean; traites: number; taux: number; activee: boolean }> {
  const { data: p } = await sb.from('mana_parametres').select('valeur').eq('cle', 'reponse_auto').maybeSingle()
  const activee = !!(p?.valeur as { actif?: boolean } | undefined)?.actif
  const { data: traites } = await sb.from('mana_brouillons_reponse').select('statut, ecart').in('statut', ['envoye', 'corrige']).order('traite_le', { ascending: false }).limit(SEUIL_NOMBRE)
  const liste = traites ?? []
  const legers = liste.filter((t) => t.statut === 'envoye' || Number(t.ecart ?? 1) <= ECART_LEGER).length
  const taux = liste.length ? legers / liste.length : 0
  return { activee, traites: liste.length, taux, ouverte: activee && liste.length >= SEUIL_NOMBRE && taux >= SEUIL_TAUX }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: enTetes })
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405, headers: enTetes })
  const url = Deno.env.get('SUPABASE_URL')!
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const cle = Deno.env.get('ANTHROPIC_API_KEY')
  const autorisation = req.headers.get('Authorization') ?? ''
  const jeton = autorisation.replace(/^Bearer\s+/i, '').trim()
  let par = 'automatique'
  if (jeton !== cleService && roleDuJeton(jeton) !== 'service_role') {
    try {
      const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: autorisation } } })
      const { data: admin } = await client.rpc('mana_est_admin')
      if (!admin) return Response.json({ erreur: 'Réservé aux administrateurs Mana.' }, { status: 403, headers: enTetes })
      const { data: u } = await client.auth.getUser()
      par = u?.user?.email ?? 'admin'
    } catch {
      return Response.json({ erreur: 'Vérification du compte impossible.' }, { status: 401, headers: enTetes })
    }
  }
  if (!cle) return Response.json({ erreur: 'Rédaction indisponible : la clé ANTHROPIC_API_KEY n’est pas configurée sur le projet Supabase.' }, { status: 503, headers: enTetes })

  let corps: { demandeId?: string; messageId?: string; consigne?: string }
  try {
    corps = await req.json()
  } catch {
    return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: enTetes })
  }
  const sb = createClient(url, cleService)

  const demandeId = s(corps.demandeId, 64)
  if (!demandeId) return Response.json({ erreur: 'Dossier manquant.' }, { status: 400, headers: enTetes })

  try {
    const { data: d, error: eD } = await sb.from('mana_demandes').select('*').eq('id', demandeId).single()
    if (eD || !d) throw new Error('dossier introuvable')
    const { data: msgs } = await sb.from('mana_messages').select('id, auteur, texte, created_at').eq('demande_id', demandeId).order('created_at')
    const fil = msgs ?? []
    const dernier = fil[fil.length - 1]
    // On ne répond qu'au dernier message, et seulement s'il vient du client : un message plus récent
    // déclenchera sa propre préparation, une réponse déjà partie rend la préparation inutile.
    if (!dernier || dernier.auteur !== 'client') return Response.json({ ignore: 'le dernier message n’est pas du client' }, { headers: enTetes })
    if (corps.messageId && corps.messageId !== dernier.id) return Response.json({ ignore: 'un message plus récent existe' }, { headers: enTetes })
    const { data: existant } = await sb.from('mana_brouillons_reponse').select('id, statut').eq('message_id', dernier.id).maybeSingle()
    if (existant && par === 'automatique') return Response.json({ ignore: 'réponse déjà préparée', id: existant.id }, { headers: enTetes })

    const [{ data: etatLigne }, { data: style }, { data: exemples }] = await Promise.all([
      sb.from('mana_etats').select('data').eq('user_id', d.user_id).maybeSingle(),
      sb.from('mana_parametres').select('valeur').eq('cle', 'style').maybeSingle(),
      sb.from('mana_brouillons_reponse').select('message_client, texte, texte_envoye, statut').in('statut', ['corrige', 'envoye']).order('traite_le', { ascending: false }).limit(12),
    ])
    const regles = s((style?.valeur as { regles?: string } | undefined)?.regles, 4000)
    // Les corrections apprennent plus que les validations telles quelles : elles passent en premier.
    const exemplesTries = [...(exemples ?? [])].sort((a, b) => (a.statut === 'corrige' ? 0 : 1) - (b.statut === 'corrige' ? 0 : 1)).slice(0, 8)
    const faq = FAQ.map((e) => `Q : ${e.question}\nR : ${e.reponse}`).join('\n\n')

    const systeme =
      SYSTEME +
      (regles ? `\n\nRÈGLES DE STYLE DE L’ÉQUIPE (priment sur tout le reste pour la forme) :\n${regles}` : '') +
      (exemplesTries.length
        ? `\n\nRÉPONSES PASSÉES : ce que Mana avait proposé, puis ce que l’équipe a réellement envoyé. Imite la version envoyée.\n` +
          exemplesTries
            .map((e, i) => `--- Exemple ${i + 1} ---\nMESSAGE DU CLIENT :\n${s(e.message_client, 1500)}\nPROPOSÉ :\n${s(e.texte, 2000)}\nENVOYÉ :\n${s(e.texte_envoye ?? e.texte, 2000)}`)
            .join('\n\n')
        : '') +
      `\n\nFAQ DE MANA (source de vérité pour les réponses courantes) :\n${faq}`

    const contenu = Object.entries((d.contenu ?? {}) as Record<string, unknown>)
      .filter(([k, v]) => !['propositions', 'relances', 'contacts', 'signal_cle', 'dates'].includes(k) && (typeof v === 'string' || typeof v === 'number') && String(v).trim())
      .map(([k, v]) => `${k.replace(/_/g, ' ')} : ${s(String(v), 300)}`)
      .join('\n')
    const transcript = fil.map((m) => `[${m.auteur === 'client' ? 'CLIENT' : m.auteur === 'association' ? 'ASSOCIATION (e-mail)' : 'MANA'} · ${String(m.created_at).slice(0, 16).replace('T', ' ')}]\n${s(m.texte, 3000)}`).join('\n\n')
    const utilisateur =
      `DOSSIER : ${LIBELLE_TYPE[d.type] ?? d.type} — « ${s(d.sujet, 200)} »\n${contenu}\n\n` +
      `COMPTE DU CLIENT (${s(d.email, 120) || 'e-mail inconnu'}) :\n${resumeCompte((etatLigne?.data as Record<string, unknown> | null) ?? null)}\n\n` +
      `CONVERSATION (la plus ancienne en premier) :\n${transcript}\n\n` +
      (s(corps.consigne, 1000) ? `CONSIGNE DE L’ÉQUIPE POUR CETTE RÉPONSE : ${s(corps.consigne, 1000)}\n\n` : '') +
      `Rédige la réponse au dernier message du client.`

    const client = new Anthropic({ apiKey: cle })
    const requete = {
      model: MODELE,
      max_tokens: 16000,
      system: [{ type: 'text', text: systeme, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: utilisateur }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }
    let rep
    try {
      // Repli côté serveur si le modèle décline : la réponse est rédigée par le modèle recommandé.
      rep = await client.beta.messages.create({ ...requete, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as never)
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e
      rep = await client.messages.create(requete as never)
    }
    const r = rep as unknown as { stop_reason: string; model: string; content: { type: string; text?: string }[] }
    let sortie = { reponse: '', confiance: 'basse', a_valider: true, raison: 'Le modèle n’a pas pu rédiger de réponse : à écrire à la main.' }
    if (r.stop_reason !== 'refusal') {
      const texte = r.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      const json = JSON.parse(texte) as typeof sortie
      sortie = { reponse: s(json.reponse, 8000), confiance: ['haute', 'moyenne', 'basse'].includes(json.confiance) ? json.confiance : 'basse', a_valider: json.a_valider !== false, raison: s(json.raison, 400) }
      if (!sortie.reponse.trim()) sortie = { ...sortie, confiance: 'basse', a_valider: true }
    }

    // Une nouvelle proposition remplace les précédentes encore en attente sur ce dossier.
    await sb.from('mana_brouillons_reponse').update({ statut: 'remplace', traite_le: new Date().toISOString(), traite_par: par }).eq('demande_id', demandeId).eq('statut', 'propose')
    if (existant) await sb.from('mana_brouillons_reponse').update({ message_id: null }).eq('id', existant.id)
    const { data: b, error: eB } = await sb
      .from('mana_brouillons_reponse')
      .insert({ demande_id: demandeId, message_id: dernier.id, user_id: d.user_id, message_client: s(dernier.texte, 6000), texte: sortie.reponse, confiance: sortie.confiance, a_valider: sortie.a_valider || sortie.confiance !== 'haute', raison: sortie.raison, modele: r.model })
      .select('*')
      .single()
    if (eB) throw new Error(eB.message)

    // Envoi autonome, seulement sur déclenchement automatique et quand tout est au vert.
    let envoye = false
    if (par === 'automatique' && sortie.confiance === 'haute' && !sortie.a_valider && sortie.reponse.trim()) {
      const autonomie = await autonomieOuverte(sb)
      if (autonomie.ouverte) {
        const maintenant = new Date().toISOString()
        const { error: eM } = await sb.from('mana_messages').insert({ demande_id: demandeId, user_id: d.user_id, auteur: 'mana', texte: sortie.reponse, origine: { auto: true, brouillon_id: b.id } })
        if (!eM) {
          await sb.from('mana_brouillons_reponse').update({ statut: 'auto', texte_envoye: sortie.reponse, ecart: 0, traite_le: maintenant, traite_par: 'Mana (seul)' }).eq('id', b.id)
          await sb.from('mana_demandes').update({ statut: d.statut === 'nouvelle' ? 'en_cours' : d.statut, updated_at: maintenant, lu_mana_le: maintenant }).eq('id', demandeId)
          envoye = true
        }
      }
    }
    return Response.json({ brouillon: { ...b, statut: envoye ? 'auto' : b.statut }, envoye }, { headers: enTetes })
  } catch (e) {
    return Response.json({ erreur: `Préparation impossible : ${(e as Error).message}` }, { status: 502, headers: enTetes })
  }
})
