/**
 * Courrier entrant : une association répond à un mail de Mana, la réponse tombe dans le
 * fil de suivi du dossier. L'adresse de réponse porte l'identifiant du fil :
 * suivi+<id du fil>@<domaine>. Appelée par le webhook « e-mail reçu » de Resend (ou tout
 * relais qui poste un JSON { from, to, subject, text|html }).
 *
 * Pas de JWT (c'est un webhook) : la requête doit porter la clé partagée MANA_WEBHOOK_SECRET
 * (en-tête x-mana-cle ou paramètre ?cle=). À activer avec le domaine : voir COURRIER.md.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function texteDepuisHTML(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Coupe la citation du mail précédent (« Le … a écrit : », lignes « > »). */
function sansCitation(texte: string): string {
  const lignes = texte.split('\n')
  const coupe = lignes.findIndex((l) => /^(Le .+ a écrit ?:|On .+ wrote:|-----Original Message-----|De ?: .+)$/i.test(l.trim()))
  const utiles = (coupe >= 0 ? lignes.slice(0, coupe) : lignes).filter((l) => !l.trim().startsWith('>'))
  return utiles.join('\n').trim()
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405 })
  const secret = Deno.env.get('MANA_WEBHOOK_SECRET')
  if (!secret) return Response.json({ erreur: 'Courrier entrant non activé (MANA_WEBHOOK_SECRET absent).' }, { status: 503 })
  const url = new URL(req.url)
  const cle = req.headers.get('x-mana-cle') ?? url.searchParams.get('cle')
  if (cle !== secret) return Response.json({ erreur: 'Clé invalide.' }, { status: 401 })

  let corps: Record<string, unknown>
  try {
    corps = await req.json()
  } catch {
    return Response.json({ erreur: 'JSON illisible.' }, { status: 400 })
  }
  // Resend : { type: 'email.received', data: {...} } ; relais générique : le mail à plat.
  const data = ((corps.data as Record<string, unknown> | undefined) ?? corps) as Record<string, unknown>
  const destinataires = ([] as unknown[]).concat(data.to ?? []).map(String)
  const cible = destinataires.find((d) => /suivi\+/i.test(d)) ?? destinataires[0] ?? ''
  const id = cible.match(UUID)?.[0]
  if (!id) return Response.json({ ignore: true, raison: 'aucun identifiant de fil dans le destinataire' }, { status: 200 })

  const expediteur = String(data.from ?? '')
  const objet = String(data.subject ?? '')
  const texteBrut = typeof data.text === 'string' && data.text.trim() ? data.text : typeof data.html === 'string' ? texteDepuisHTML(data.html) : ''
  const texte = sansCitation(texteBrut) || texteBrut.trim() || '(message sans texte)'

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: fil } = await sb.from('mana_demandes').select('id, user_id, contenu, statut').eq('id', id).maybeSingle()
  if (!fil) return Response.json({ ignore: true, raison: 'fil inconnu' }, { status: 200 })

  const maintenant = new Date().toISOString()
  const { error } = await sb.from('mana_messages').insert({
    demande_id: fil.id,
    user_id: fil.user_id,
    auteur: 'association',
    texte: `${objet ? `${objet}\n\n` : ''}${texte}`,
    origine: { from: expediteur, to: cible, subject: objet, message_id: data.message_id ?? data.email_id ?? null, recu_le: maintenant },
  })
  if (error) return Response.json({ erreur: error.message }, { status: 500 })

  // La boucle de résolution s'arrête d'elle-même : l'association a répondu.
  const contenu = { ...(fil.contenu as Record<string, unknown>), reponse_association_le: maintenant, reponse_association_de: expediteur }
  await sb.from('mana_demandes').update({ contenu, updated_at: maintenant, statut: fil.statut === 'traitee' ? 'en_cours' : fil.statut }).eq('id', fil.id)
  return Response.json({ ok: true, fil: fil.id })
})
