import { useState } from 'react'
import type { Demande, AssociationTrouvee } from '../lib/cloud'
import { trouverAssociations } from '../lib/cloud'
import { LIBELLES_ELIGIBILITE } from './CollecteurForm'

/**
 * Actions de Mana sur une demande liée aux associations (changement, problème,
 * mise en relation) : un mail de justification préparé pour l'association en
 * place, et la recherche de nouvelles associations autour du magasin, chacune
 * avec un mail de prise de contact préparé. Rien ne part sans que l'admin ait
 * relu le texte et cliqué : le mail s'ouvre dans sa messagerie, prêt à envoyer,
 * et l'envoi est consigné dans le fil de la demande.
 */

export interface Brouillon {
  a: string
  objet: string
  corps: string
}

const texte = (v: unknown) => (v === undefined || v === null ? '' : String(v))

function signature(adminEmail: string) {
  return `\n\nBien cordialement,\nAnthony Bouskila\nMana by LAB — dons d’invendus et reçus fiscaux\n${adminEmail}`
}

/** Mail à l'association en place : que s'est-il passé, la collecte reprend-elle ? */
export function brouillonJustification(d: Demande, adminEmail: string): Brouillon {
  const c = d.contenu
  const magasin = texte(c.magasin)
  const societe = texte(c.societe)
  const asso = texte(c.association_concernee)
  const rythme = texte(c.rythme_convenu)
  const adresse = texte(c.adresse_magasin)
  const motif = texte(c.motif)
  const dans7j = new Date(Date.now() + 7 * 86400_000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const corps =
    `Bonjour,\n\n` +
    `Mana accompagne ${societe ? `la société ${societe} et ` : ''}le magasin ${magasin}${adresse ? ` (${adresse})` : ''} pour le don de ses invendus alimentaires à votre association${asso && asso !== 'aucune en particulier' ? ` ${asso}` : ''}.\n\n` +
    `Le magasin nous signale ceci : ${motif || 'un problème sur la collecte'}.${rythme ? ` Le rythme convenu était : ${rythme}.` : ''}\n\n` +
    `Pourriez-vous nous dire ce qui s’est passé, et si la collecte peut reprendre selon le rythme convenu ? Si vos disponibilités ont changé, dites-nous ce qui vous conviendrait : nous ajusterons avec le magasin.\n\n` +
    `Pour mémoire, chaque passage doit être documenté par un bordereau signé, et le magasin établit en fin d’année le reçu fiscal qui vous concerne : c’est ce suivi qui permet de maintenir les dons dans la durée.\n\n` +
    `Merci de nous répondre d’ici le ${dans7j}. Sans nouvelles, nous devrons proposer au magasin une autre association pour ne pas perdre les denrées.` +
    signature(adminEmail)
  return {
    a: texte(c.association_email),
    objet: `Collecte des invendus de ${magasin} : point sur les passages`,
    corps,
  }
}

/** Mail de relance à l'association d'un fil de suivi : des passages prévus sans enlèvement. */
export function brouillonRelance(d: Demande, adminEmail: string): Brouillon {
  const c = d.contenu
  const magasin = texte(c.magasin)
  const societe = texte(c.societe)
  const asso = texte(c.association_concernee)
  const rythme = texte(c.rythme_convenu)
  const adresse = texte(c.adresse_magasin)
  const dates = Array.isArray(c.dates) ? (c.dates as string[]) : []
  const jours = dates.map((j) => { const [, m, dd] = j.split('-').map(Number); return `${dd} ${['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][m - 1]}` })
  const liste = jours.length > 1 ? `${jours.slice(0, -1).join(', ')} et ${jours[jours.length - 1]}` : jours.join('')
  const dans7j = new Date(Date.now() + 7 * 86400_000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const corps =
    `Bonjour,\n\n` +
    `Mana accompagne ${societe ? `la société ${societe} et ` : ''}le magasin ${magasin}${adresse ? ` (${adresse})` : ''} pour le don de ses invendus alimentaires à ${asso && asso !== 'aucune en particulier' ? asso : 'votre association'}.\n\n` +
    `Nos relevés n’indiquent aucun enlèvement ${jours.length > 1 ? 'les' : 'le'} ${liste}${rythme ? `, alors que le rythme convenu est : ${rythme}` : ''}. ` +
    `S’agit-il d’un empêchement ponctuel ou d’un changement dans vos tournées ? Le magasin prépare et pèse les produits pour chaque passage ; si un autre rythme vous convient mieux, dites-le-nous et nous l’ajusterons avec lui.\n\n` +
    `Pour mémoire, chaque passage est documenté par un bordereau signé des deux côtés : c’est ce qui permet au magasin d’établir le reçu fiscal en fin d’année et de maintenir les dons dans la durée.\n\n` +
    `Merci de nous répondre d’ici le ${dans7j}. Sans nouvelles, nous devrons proposer au magasin une autre association pour ne pas perdre les denrées.` +
    signature(adminEmail)
  return {
    a: texte(c.association_email),
    objet: `Collecte des invendus de ${magasin} : passages ${jours.length > 1 ? 'des' : 'du'} ${liste}`,
    corps,
  }
}

/** Mail de prise de contact avec une association trouvée. */
export function brouillonProspection(d: Demande, a: AssociationTrouvee, adminEmail: string): Brouillon {
  const c = d.contenu
  const magasin = texte(c.magasin)
  const societe = texte(c.societe)
  const adresse = texte(c.adresse_magasin) || texte(c.ville)
  const rythme = texte(c.frequence_souhaitee) || texte(c.rythme_convenu)
  const plage = texte(c.plage_horaire)
  const volume = texte(c.invendus_estimes) || texte(c.volume_par_passage)
  const corps =
    `Bonjour,\n\n` +
    `Mana met en relation des magasins alimentaires bio et des associations d’aide alimentaire pour le don de leurs invendus, dans le cadre du mécénat (article 238 bis du CGI).\n\n` +
    `Le magasin ${magasin}${societe ? ` (${societe})` : ''}${adresse ? `, ${adresse}` : ''}, cherche une association pour venir collecter ses invendus : fruits et légumes, produits frais et épicerie, triés et consommables.` +
    (rythme ? ` Rythme souhaité : ${rythme.toLowerCase()}${plage ? `, ${plage.toLowerCase()}` : ''}.` : '') +
    (volume ? ` Volume estimé : ${volume}.` : '') +
    `\n\nConcrètement : vos bénévoles passent au magasin, un bordereau est signé à chaque enlèvement, et le magasin établit en fin d’année le reçu fiscal. Nous vous demanderons simplement vos statuts et votre attestation d’intérêt général (ou votre rescrit) pour sécuriser ce reçu.\n\n` +
    `Seriez-vous intéressés ? Si oui, dites-nous vos jours et créneaux possibles, et nous organisons un premier passage avec le magasin.` +
    signature(adminEmail)
  return {
    a: a.email,
    objet: `Proposition : collecte des invendus alimentaires de ${magasin}${adresse ? ` (${adresse.split(',').pop()?.trim() ?? ''})` : ''}`,
    corps,
  }
}

function mailto(b: Brouillon): string {
  return `mailto:${encodeURIComponent(b.a)}?subject=${encodeURIComponent(b.objet)}&body=${encodeURIComponent(b.corps)}`
}

/** Éditeur de brouillon : on relit, on corrige, puis on ouvre dans la messagerie et on consigne l'envoi. */
export function EditeurMail({ initial, titre, onEnvoye, onFermer }: { initial: Brouillon; titre: string; onEnvoye: (b: Brouillon) => Promise<void>; onFermer: () => void }) {
  const [b, setB] = useState<Brouillon>(initial)
  const [etat, setEtat] = useState<'edition' | 'ouvert' | 'consigne'>('edition')
  const [copie, setCopie] = useState(false)
  const valide = /^\S+@\S+\.\S+$/.test(b.a.trim()) && b.objet.trim() && b.corps.trim()
  return (
    <div className="card" style={{ background: 'var(--papier)', marginTop: 10 }}>
      <h3>{titre}</h3>
      <p className="muted">Relisez et modifiez librement. « Ouvrir et envoyer » ouvre le mail prêt dans votre messagerie ; vous l’envoyez de là, puis Mana le consigne dans le fil.</p>
      <label className="field">
        <span>À</span>
        <input type="email" value={b.a} onChange={(e) => setB({ ...b, a: e.target.value })} placeholder="adresse@association.org" />
        {!b.a && <span className="aide" style={{ color: 'var(--ambre-texte)' }}>Aucune adresse enregistrée : saisissez-la.</span>}
      </label>
      <label className="field">
        <span>Objet</span>
        <input type="text" value={b.objet} onChange={(e) => setB({ ...b, objet: e.target.value })} />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea rows={14} value={b.corps} onChange={(e) => setB({ ...b, corps: e.target.value })} style={{ fontFamily: 'inherit', lineHeight: 1.45 }} />
      </label>
      <div className="row-actions">
        <a
          className="btn btn-primary btn-sm"
          style={{ flex: 1, textAlign: 'center', pointerEvents: valide ? 'auto' : 'none', opacity: valide ? 1 : 0.5 }}
          href={valide ? mailto(b) : undefined}
          onClick={() => setEtat('ouvert')}
        >
          ✉ Ouvrir et envoyer depuis ma messagerie
        </a>
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(`À : ${b.a}\nObjet : ${b.objet}\n\n${b.corps}`).catch(() => {})
            setCopie(true)
            window.setTimeout(() => setCopie(false), 2000)
          }}
        >
          {copie ? 'Copié' : 'Copier'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onFermer}>Fermer</button>
      </div>
      {etat === 'ouvert' && (
        <div className="info-banner" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>Le mail est ouvert dans votre messagerie. Une fois envoyé, consignez-le ici : il apparaîtra dans le fil de la demande et le client le verra.</span>
          <button className="btn btn-primary btn-sm" onClick={async () => { await onEnvoye(b); setEtat('consigne') }}>Mail envoyé, consigner</button>
        </div>
      )}
      {etat === 'consigne' && <p className="muted" style={{ marginTop: 8, color: 'var(--vert)' }}>Envoi consigné dans le fil.</p>}
    </div>
  )
}

export function ActionsAssociation({ demande, adminEmail, onConsigner, onPropositions }: {
  demande: Demande
  adminEmail: string
  /** Consigne un mail envoyé dans le fil (message Mana) et passe la demande en cours. */
  onConsigner: (texte: string) => Promise<void>
  /** Mémorise les associations trouvées dans la demande, pour les retrouver à la prochaine ouverture. */
  onPropositions: (associations: AssociationTrouvee[], remarque: string) => Promise<void>
}) {
  const c = demande.contenu
  const [brouillon, setBrouillon] = useState<{ titre: string; b: Brouillon } | null>(null)
  const [adresse, setAdresse] = useState(texte(c.adresse_magasin) || texte(c.ville))
  const [recherche, setRecherche] = useState(false)
  const [erreur, setErreur] = useState('')
  const [propositions, setPropositions] = useState<AssociationTrouvee[]>((c.propositions as AssociationTrouvee[] | undefined) ?? [])
  const [remarque, setRemarque] = useState(texte(c.propositions_remarque))
  const [chercherOuvert, setChercherOuvert] = useState(false)
  const aUneAsso = !!c.association_concernee && c.association_concernee !== 'aucune en particulier'

  async function chercher() {
    if (!adresse.trim()) return
    setRecherche(true)
    setErreur('')
    try {
      const exclure = texte(c.associations_en_place).split(',').map((x) => x.trim()).filter((x) => x && x !== 'aucune')
      const r = await trouverAssociations({
        adresse: adresse.trim(),
        magasin: texte(c.magasin),
        societe: texte(c.societe),
        besoin: [texte(c.motif), texte(c.frequence_souhaitee), texte(c.plage_horaire)].filter(Boolean).join(' ; '),
        exclure,
      })
      setPropositions(r.associations)
      setRemarque(r.remarque)
      await onPropositions(r.associations, r.remarque)
    } catch (e) {
      setErreur((e as Error).message)
    }
    setRecherche(false)
  }

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--trait-doux)', paddingTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Actions Mana</div>
      <div className="row-actions">
        {aUneAsso && demande.type === 'suivi' && (
          <button className="btn btn-primary btn-sm" onClick={() => setBrouillon({ titre: `Relance de ${texte(c.association_concernee)}`, b: brouillonRelance(demande, adminEmail) })}>
            ✉ Préparer la relance de l’association
          </button>
        )}
        {aUneAsso && demande.type !== 'suivi' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setBrouillon({ titre: `Demande de justification à ${texte(c.association_concernee)}`, b: brouillonJustification(demande, adminEmail) })}>
            ✉ Préparer la demande de justification à l’association
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setChercherOuvert(true)}>
          🔎 Trouver une nouvelle association
        </button>
      </div>

      {brouillon && (
        <EditeurMail
          key={brouillon.titre}
          titre={brouillon.titre}
          initial={brouillon.b}
          onFermer={() => setBrouillon(null)}
          onEnvoye={async (b) => onConsigner(`✉ Mail envoyé à ${b.a} — « ${b.objet} »\n\n${b.corps}`)}
        />
      )}

      {chercherOuvert && (
        <div className="card" style={{ background: 'var(--papier)', marginTop: 10 }}>
          <h3>Trouver une nouvelle association</h3>
          <p className="muted">Claude cherche sur le web les structures d’aide alimentaire autour du magasin : banques alimentaires, Restos du Cœur, Secours populaire, Secours catholique, Croix-Rouge, épiceries solidaires, CCAS. Comptez une à deux minutes.</p>
          <label className="field">
            <span>Adresse du magasin</span>
            <input type="text" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Rue, code postal, ville" />
          </label>
          <button className="btn btn-primary btn-sm" disabled={recherche || !adresse.trim()} style={{ opacity: recherche || !adresse.trim() ? 0.5 : 1 }} onClick={() => void chercher()}>
            {recherche ? 'Recherche en cours…' : propositions.length ? 'Relancer la recherche' : 'Lancer la recherche'}
          </button>
          {erreur && <p className="muted" style={{ color: 'var(--rouge)', marginTop: 8 }}>{erreur}</p>}
          {remarque && <p className="muted" style={{ marginTop: 10 }}>{remarque}</p>}
          {propositions.map((a) => (
            <div className="facture-ligne" key={a.nom + a.adresse} style={{ alignItems: 'flex-start' }}>
              <div className="infos" style={{ minWidth: 0 }}>
                <strong>{a.nom}</strong>
                <small>{[a.type, a.adresse, a.distance, a.telephone, a.email || 'e-mail non trouvé'].filter(Boolean).join(' · ')}</small>
                <small>
                  <span className={LIBELLES_ELIGIBILITE[a.eligibilite].classe} style={{ marginRight: 6 }}>{LIBELLES_ELIGIBILITE[a.eligibilite].texte}</span>
                  collecte en magasin : {a.collecteMagasin}
                </small>
                {a.note && <small>{a.note}</small>}
                {(a.site || a.source) && <small><a href={a.site || a.source} target="_blank" rel="noreferrer">{a.site || a.source}</a></small>}
              </div>
              <div style={{ flex: 'none' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setBrouillon({ titre: `Prise de contact : ${a.nom}`, b: brouillonProspection(demande, a, adminEmail) })}>
                  ✉ Préparer un mail
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
