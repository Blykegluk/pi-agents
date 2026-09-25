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

export type { Brouillon } from '../lib/cloud'
import type { Brouillon } from '../lib/cloud'

export type GenreMail = 'relance' | 'justification' | 'prospection'

/** Ce que la console consigne quand un mail part : quoi, à qui, et ce que Mana avait proposé. */
export interface EnvoiConsigne {
  genre: GenreMail
  brouillon: Brouillon
  propose: Brouillon
  association?: { nom: string; email?: string }
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
export function EditeurMail({
  initial,
  titre,
  onEnvoye,
  onFermer,
  onStyliser,
}: {
  initial: Brouillon
  titre: string
  onEnvoye: (b: Brouillon, propose: Brouillon) => Promise<void>
  onFermer: () => void
  /** Réécrit le brouillon dans le style de l'équipe (règles + corrections passées). */
  onStyliser?: (b: Brouillon) => Promise<Brouillon>
}) {
  const [b, setB] = useState<Brouillon>(initial)
  const [etat, setEtat] = useState<'edition' | 'ouvert' | 'consigne'>('edition')
  const [copie, setCopie] = useState(false)
  const [style, setStyle] = useState<'repos' | 'en_cours' | 'fait' | 'erreur'>('repos')
  const [erreurStyle, setErreurStyle] = useState('')
  const valide = /^\S+@\S+\.\S+$/.test(b.a.trim()) && b.objet.trim() && b.corps.trim()
  return (
    <div className="card" style={{ background: 'var(--papier)', marginTop: 10 }}>
      <h3>{titre}</h3>
      <p className="muted">Relisez, puis ouvrez-le dans votre messagerie.</p>
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
        {onStyliser && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={style === 'en_cours'}
            title="Réécrit le mail selon vos règles de style et vos dernières corrections (onglet Style)"
            onClick={async () => {
              setStyle('en_cours')
              setErreurStyle('')
              try {
                setB(await onStyliser(b))
                setStyle('fait')
              } catch (e) {
                setErreurStyle((e as Error).message)
                setStyle('erreur')
              }
            }}
          >
            {style === 'en_cours' ? 'Réécriture…' : style === 'fait' ? '✓ Mon style appliqué' : '✨ Appliquer mon style'}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onFermer}>Fermer</button>
      </div>
      {erreurStyle && <p className="muted" style={{ color: 'var(--rouge)', marginTop: 6 }}>{erreurStyle}</p>}
      {etat === 'ouvert' && (
        <div className="info-banner" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>Envoyé ? Consignez-le pour le garder au dossier.</span>
          <button className="btn btn-primary btn-sm" onClick={async () => { await onEnvoye(b, initial); setEtat('consigne') }}>Mail envoyé, consigner</button>
        </div>
      )}
      {etat === 'consigne' && <p className="muted" style={{ marginTop: 8, color: 'var(--vert)' }}>Envoi consigné dans le fil.</p>}
    </div>
  )
}

export function ActionsAssociation({ demande, adminEmail, onConsigner, onPropositions, onStyliser, onMajContenu, onMessageClient }: {
  demande: Demande
  adminEmail: string
  /** Consigne un mail envoyé dans le fil (message Mana) et passe la demande en cours ; `envoi` décrit ce qui est parti. */
  onConsigner: (texte: string, envoi?: EnvoiConsigne) => Promise<void>
  /** Mémorise les associations trouvées dans la demande, pour les retrouver à la prochaine ouverture. */
  onPropositions: (associations: AssociationTrouvee[], remarque: string) => Promise<void>
  onStyliser?: (genre: GenreMail, b: Brouillon) => Promise<Brouillon>
  /** Complète le contenu du fil (réponse reçue, association retenue…). */
  onMajContenu?: (contenu: Record<string, unknown>) => Promise<void>
  /** Écrit un message Mana au client dans le fil, sans le marquer comme mail. */
  onMessageClient?: (texte: string) => Promise<void>
}) {
  const c = demande.contenu
  const [brouillon, setBrouillon] = useState<{ titre: string; genre: GenreMail; association?: { nom: string; email?: string }; b: Brouillon } | null>(null)
  const relances = Array.isArray(c.relances) ? (c.relances as { le: string; a?: string }[]) : []
  const contacts = Array.isArray(c.contacts) ? (c.contacts as { le: string; nom?: string; a?: string }[]) : []
  const retenue = c.retenue as { nom: string; email?: string } | undefined
  const fmtLe = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
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
          <button className="btn btn-primary btn-sm" onClick={() => setBrouillon({ titre: `Relance de ${texte(c.association_concernee)}`, genre: 'relance', association: { nom: texte(c.association_concernee), email: texte(c.association_email) }, b: brouillonRelance(demande, adminEmail) })}>
            ✉ {relances.length ? 'Relancer à nouveau' : 'Préparer la relance de l’association'}
          </button>
        )}
        {aUneAsso && demande.type !== 'suivi' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setBrouillon({ titre: `Demande de justification à ${texte(c.association_concernee)}`, genre: 'justification', association: { nom: texte(c.association_concernee), email: texte(c.association_email) }, b: brouillonJustification(demande, adminEmail) })}>
            ✉ Préparer la demande de justification à l’association
          </button>
        )}
        {demande.type === 'suivi' && onMajContenu && relances.length > 0 && !c.reponse_association_le && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await onMajContenu({ ...c, reponse_association_le: new Date().toISOString() })
              await onMessageClient?.(`${texte(c.association_concernee)} nous a répondu : la collecte devrait reprendre. Nous restons attentifs aux prochains passages.`)
            }}
          >
            ✓ L’association a répondu
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setChercherOuvert(true)}>
          🔎 Trouver une nouvelle association
        </button>
      </div>

      {demande.type === 'suivi' && (relances.length > 0 || contacts.length > 0 || !!retenue || typeof c.reponse_association_le === 'string') && (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          {relances.length > 0 && <>Relance{relances.length > 1 ? 's' : ''} envoyée{relances.length > 1 ? 's' : ''} : {relances.map((r) => fmtLe(r.le)).join(', ')}. </>}
          {typeof c.reponse_association_le === 'string' && <>Réponse de l’association le {fmtLe(c.reponse_association_le)}. </>}
          {contacts.length > 0 && <>Remplaçantes contactées : {contacts.map((x, i) => `n° ${i + 1} ${x.nom ?? x.a ?? ''} (${fmtLe(x.le)})`).join(', ')}. </>}
          {retenue && <><strong>Association retenue : {retenue.nom}.</strong></>}
        </p>
      )}

      {brouillon && (
        <EditeurMail
          key={brouillon.titre}
          titre={brouillon.titre}
          initial={brouillon.b}
          onFermer={() => setBrouillon(null)}
          onStyliser={onStyliser ? (b) => onStyliser(brouillon.genre, b) : undefined}
          onEnvoye={async (b, propose) => onConsigner(`✉ Mail envoyé à ${b.a} — « ${b.objet} »\n\n${b.corps}`, { genre: brouillon.genre, brouillon: b, propose, association: brouillon.association })}
        />
      )}

      {chercherOuvert && (
        <div className="card" style={{ background: 'var(--papier)', marginTop: 10 }}>
          <h3>Trouver une nouvelle association</h3>
          <p className="muted">Recherche sur le web autour du magasin. Une à deux minutes.</p>
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
              <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setBrouillon({ titre: `Prise de contact : ${a.nom}`, genre: 'prospection', association: { nom: a.nom, email: a.email }, b: brouillonProspection(demande, a, adminEmail) })}>
                  ✉ {contacts.some((x) => x.nom === a.nom) ? 'Relancer' : 'Préparer un mail'}
                </button>
                {demande.type === 'suivi' && onMajContenu && !retenue && (
                  <button
                    className="btn btn-primary btn-sm"
                    title="Cette association reprend la collecte : le magasin est prévenu, la boucle de résolution s’arrête"
                    onClick={async () => {
                      await onMajContenu({ ...c, retenue: { nom: a.nom, email: a.email, telephone: a.telephone, le: new Date().toISOString() } })
                      await onMessageClient?.(
                        `Bonne nouvelle : ${a.nom} accepte de collecter vos invendus${a.telephone || a.email ? ` (${[a.telephone, a.email].filter(Boolean).join(' · ')})` : ''}. ` +
                          `Ajoutez-la dans Magasins › Associations avec ses jours et son créneau de passage : la surveillance suivra ses passages dès le premier bordereau.`,
                      )
                    }}
                  >
                    ✓ Retenir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
