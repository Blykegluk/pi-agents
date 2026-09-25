import type { Societe } from '../types'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  envoyerMessage,
  listerClients,
  marquerLu,
  majContenuDemande,
  majStatutDemande,
  mesDemandes,
  messagesDe,
  listerSignaux,
  majStatutSignal,
  derniereSurveillance,
  lancerSurveillance,
  enregistrerRedaction,
  listerRedactions,
  lireParametre,
  ecrireParametre,
  redigerAvecStyle,
  deduireRegles,
  type Redaction,
  type Signal,
  type Surveillance,
  type ClientAdmin,
  type Demande,
  type Message,
  type NonLus,
} from '../lib/cloud'
import { Composer } from '../components/Composer'
import { Reseau } from '../components/Reseau'
import { ActionsAssociation, type EnvoiConsigne } from '../components/ActionsAssociation'
import { aggParSociete } from '../lib/selectors'
import { fmtDateHeure, fmtEUR, fmtNum } from '../lib/format'
import { LIBELLES_STATUT } from '../components/Aide'
import { exerciceCourant } from '../lib/demo'
import { ACTIONS_SIGNAL, LIBELLES_NIVEAU, type TypeSignal } from '../lib/signaux'

/**
 * Console administrateur Mana : demandes entrantes (mise en relation, support)
 * avec fil de discussion, et suivi d'activité de chaque client.
 */
import { pdfConventionIntraGroupe } from '../lib/pdf'

export function Admin({ session, nonLus, onLu, societes = [] }: { session: Session; nonLus: NonLus; onLu: () => void
  societes?: Societe[]
}) {
  const [onglet, setOnglet] = useState<'demandes' | 'signaux' | 'clients' | 'style'>('demandes')
  const [signaux, setSignaux] = useState<Signal[]>([])
  const [surveillance, setSurveillance] = useState<Surveillance | null>(null)
  const [surveillanceEnCours, setSurveillanceEnCours] = useState(false)
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [clients, setClients] = useState<ClientAdmin[]>([])
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [fil, setFil] = useState<Message[]>([])
  const [erreur, setErreur] = useState('')
  const exercice = exerciceCourant()

  async function recharger() {
    try {
      setErreur('')
      const [d, c] = await Promise.all([mesDemandes(), listerClients()])
      setDemandes(d)
      setClients(c)
      // Les signaux ont leurs propres tables : une erreur là ne doit pas cacher les demandes.
      try {
        const [sg, sv] = await Promise.all([listerSignaux(), derniereSurveillance()])
        setSignaux(sg)
        setSurveillance(sv)
      } catch (e) {
        setErreur((e as Error).message)
      }
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  useEffect(() => {
    recharger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ouvrir un fil éteint sa pastille côté Mana.
  useEffect(() => {
    if (!ouverte) return
    messagesDe(ouverte).then(setFil).catch(() => setFil([]))
    marquerLu(ouverte, 'mana').then(onLu).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte])

  const nouvelles = useMemo(() => demandes.filter((d) => d.statut === 'nouvelle').length, [demandes])
  const alertes = useMemo(() => signaux.filter((s) => s.statut === 'ouvert' && s.niveau === 'alerte').length, [signaux])
  const aTraiter = useMemo(() => signaux.filter((s) => s.statut === 'ouvert').length, [signaux])

  async function changerStatutSignal(s: Signal, statut: 'ouvert' | 'traite' | 'ignore') {
    await majStatutSignal(s.id, statut)
    setSignaux(await listerSignaux())
  }

  async function surveillerMaintenant() {
    setSurveillanceEnCours(true)
    try {
      setErreur('')
      await lancerSurveillance()
      const [sg, sv] = await Promise.all([listerSignaux(), derniereSurveillance()])
      setSignaux(sg)
      setSurveillance(sv)
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setSurveillanceEnCours(false)
    }
  }

  async function repondre(d: Demande, texte: string, envoi?: EnvoiConsigne) {
    if (!texte.trim()) return
    await envoyerMessage(d.id, d.user_id, 'mana', texte)
    if (d.statut === 'nouvelle') await majStatutDemande(d.id, 'en_cours')
    if (envoi) {
      // Le style s'apprend de ce qui est parti ; la boucle de résolution, de ce qui a été envoyé à qui et quand.
      await enregistrerRedaction(envoi.genre, { a: envoi.propose.a, objet: envoi.propose.objet, corps: envoi.propose.corps }, envoi.brouillon, d.id).catch(() => {})
      const le = new Date().toISOString()
      const entree = { le, a: envoi.brouillon.a, nom: envoi.association?.nom, objet: envoi.brouillon.objet }
      const contenu = { ...d.contenu }
      if (envoi.genre === 'prospection') contenu.contacts = [...((contenu.contacts as unknown[]) ?? []), entree]
      else contenu.relances = [...((contenu.relances as unknown[]) ?? []), entree]
      await majContenuDemande(d.id, contenu)
    }
    setFil(await messagesDe(d.id))
    setDemandes(await mesDemandes())
    onLu()
  }

  async function changerStatut(d: Demande, statut: Demande['statut']) {
    await majStatutDemande(d.id, statut)
    setDemandes(await mesDemandes())
  }

  return (
    <div>
      <h2>Console Mana</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Connecté en administrateur ({session.user.email}).{' '}
        <button className="amt" onClick={recharger}>Actualiser</button>
      </p>
      {erreur && <div className="info-banner alerte">{erreur}</div>}

      {societes.length > 0 && (
        <div className="card">
          <h3>Documents LAB (éditeur de Mana)</h3>
          <p className="muted" style={{ margin: '0 0 8px' }}>
            LAB détient des sociétés clientes : la facturation intra-groupe doit s’appuyer sur une convention de prestations au prix de marché. Une par société, à signer une fois.
          </p>
          <div className="row-actions">
            {societes.map((so) => (
              <button key={so.id} className="btn btn-ghost btn-sm" onClick={() => void pdfConventionIntraGroupe(so)}>
                ⬇ Convention intra-groupe — {so.raisonSociale}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chips">
        <button className={`chip ${onglet === 'demandes' ? 'active' : ''}`} onClick={() => setOnglet('demandes')}>
          Demandes{nonLus.total > 0 ? ` (${nonLus.total} non lu${nonLus.total > 1 ? 's' : ''})` : nouvelles > 0 ? ` (${nouvelles} nouvelle${nouvelles > 1 ? 's' : ''})` : ''}
        </button>
        <button className={`chip ${onglet === 'signaux' ? 'active' : ''}`} onClick={() => setOnglet('signaux')}>
          Signaux{aTraiter > 0 ? ` (${aTraiter}${alertes > 0 ? `, ${alertes} alerte${alertes > 1 ? 's' : ''}` : ''})` : ''}
        </button>
        <button className={`chip ${onglet === 'style' ? 'active' : ''}`} onClick={() => setOnglet('style')}>
          Style
        </button>
        <button className={`chip ${onglet === 'clients' ? 'active' : ''}`} onClick={() => setOnglet('clients')}>
          Clients ({clients.length})
        </button>
      </div>

      {onglet === 'demandes' && (
        <div>
          {demandes.length === 0 && <div className="card empty">Aucune demande pour l’instant.</div>}
          {demandes.map((d) => (
            <div className="card" key={d.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 14.5 }}>
                    {d.type === 'collecte' ? 'Mise en relation' : d.type === 'association' ? 'Association : changement ou problème' : d.type === 'suivi' ? 'Suivi de collecte (ouvert par Mana)' : 'Support'} — {d.sujet}
                  </strong>
                  <div className="muted">{d.email ?? d.user_id} · {fmtDateHeure(d.created_at)}</div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                  {(nonLus.parDemande[d.id] ?? 0) > 0 && (
                    <span className="pastille">{nonLus.parDemande[d.id]}</span>
                  )}
                  <span className={LIBELLES_STATUT[d.statut].classe}>{LIBELLES_STATUT[d.statut].texte}</span>
                </span>
              </div>

              {Object.keys(d.contenu).length > 0 && (
                <div className="detail-lignes" style={{ marginTop: 6 }}>
                  {Object.entries(d.contenu).filter(([cle]) => !cle.startsWith('propositions')).map(([cle, valeur]) => (
                    <div className="ligne" key={cle}>
                      <span style={{ textTransform: 'capitalize' }}>{cle.replace(/_/g, ' ')}</span>
                      <strong style={{ whiteSpace: 'normal', textAlign: 'right' }}>{String(valeur)}</strong>
                    </div>
                  ))}
                </div>
              )}

              {(d.type === 'association' || d.type === 'collecte' || d.type === 'suivi') && d.statut !== 'traitee' && (
                <ActionsAssociation
                  demande={d}
                  adminEmail={session.user.email ?? ''}
                  onConsigner={(texte, envoi) => repondre(d, texte, envoi)}
                  onStyliser={(genre, b) => redigerAvecStyle(genre, b)}
                  onMajContenu={async (contenu) => {
                    await majContenuDemande(d.id, contenu)
                    setDemandes(await mesDemandes())
                  }}
                  onMessageClient={(texte) => repondre(d, texte)}
                  onPropositions={async (associations, remarque) => {
                    await majContenuDemande(d.id, { ...d.contenu, propositions: associations, propositions_remarque: remarque })
                    setDemandes(await mesDemandes())
                  }}
                />
              )}

              <div className="row-actions" style={{ marginTop: 10 }}>
                <button
                  className={`btn btn-sm ${(nonLus.parDemande[d.id] ?? 0) > 0 ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setOuverte(ouverte === d.id ? null : d.id)}
                >
                  {ouverte === d.id ? 'Fermer le fil' : 'Ouvrir le fil'}
                </button>
                {d.statut !== 'en_cours' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => changerStatut(d, 'en_cours')}>→ En cours</button>
                )}
                {d.statut !== 'traitee' && (
                  <button className="btn btn-primary btn-sm" onClick={() => changerStatut(d, 'traitee')}>✓ Traitée</button>
                )}
              </div>

              {ouverte === d.id && (
                <div style={{ marginTop: 10 }}>
                  {fil.map((m) => (
                    <div key={m.id} style={{ background: m.auteur === 'mana' ? 'var(--sable)' : '#e3ebe3', borderRadius: 10, padding: '9px 12px', marginBottom: 6, fontSize: 14 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--encre-3)', marginBottom: 2 }}>
                        {m.auteur === 'mana' ? 'Mana (vous)' : 'Client'} · {fmtDateHeure(m.created_at)}
                      </div>
                      {m.texte}
                    </div>
                  ))}
                  <Composer placeholder="Votre réponse au client…" onEnvoyer={(texte) => repondre(d, texte)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {onglet === 'signaux' && (
        <SignauxAdmin
          signaux={signaux}
          clients={clients}
          surveillance={surveillance}
          enCours={surveillanceEnCours}
          onLancer={surveillerMaintenant}
          onStatut={changerStatutSignal}
          onOuvrirFil={(id) => {
            setOnglet('demandes')
            setOuverte(id)
          }}
        />
      )}

      {onglet === 'style' && <StyleAdmin />}

      {onglet === 'clients' && (
        <div>
          {clients.length === 0 && <div className="card empty">Aucun client synchronisé pour l’instant.</div>}
          {clients.map((c) => {
            const aggs = c.etat ? aggParSociete(c.etat, exercice) : []
            const baseTotale = aggs.reduce((t, a) => t + a.baseBrute, 0)
            const commissions = aggs.reduce((t, a) => t + a.commissionsHT, 0)
            const nbSaisies = c.etat?.saisies.length ?? 0
            const alerte = aggs.some((a) => a.alerteCA)
            const plafondAtteint = aggs.some((a) => a.plafondAtteint)
            return (
              <div className="card" key={c.user_id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 14.5, overflowWrap: 'anywhere' }}>{c.email ?? c.user_id}</strong>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>synchro {fmtDateHeure(c.updated_at)}</span>
                </div>
                {c.etat ? (
                  <div className="detail-lignes">
                    <div className="ligne">
                      <span>Sociétés / magasins / saisies</span>
                      <strong>{c.etat.societes.length} · {c.etat.magasins.length} · {fmtNum(nbSaisies)}</strong>
                    </div>
                    <div className="ligne">
                      <span>Base documentée (exercice)</span>
                      <strong>{fmtEUR(baseTotale, 2)}</strong>
                    </div>
                    <div className="ligne">
                      <span>Commissions facturées (HT)</span>
                      <strong>{fmtEUR(commissions, 2)}</strong>
                    </div>
                    {aggs.map((a) => (
                      <div className="ligne" key={a.societe.id}>
                        <span>{a.societe.raisonSociale}</span>
                        <span>
                          {Math.round((a.baseBrute / a.resultat.plafond) * 100)} % du plafond
                          {a.plafondAtteint ? ' · saturé' : ''}
                        </span>
                      </div>
                    ))}
                    {(alerte || plafondAtteint) && (
                      <div className="ligne">
                        <span>Signaux</span>
                        <span>
                          {alerte && <span className="badge alerte">alerte 2,5 % CA</span>}{' '}
                          {plafondAtteint && <span className="badge">plafond atteint</span>}
                        </span>
                      </div>
                    )}
                    <Reseau state={c.etat} compact />
                  </div>
                ) : (
                  <p className="muted">État illisible.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ORDRE_NIVEAU = { alerte: 0, attention: 1, info: 2 } as const
const ORDRE_STATUT = { ouvert: 0, traite: 1, ignore: 2, resolu: 3 } as const

function fmtJourCourt(j: string): string {
  const [y, m, d] = j.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Ce que le détail d'un signal a d'utile à lire, en une ligne. */
function resumeDetail(s: Signal): string {
  const d = s.detail
  const morceaux: string[] = []
  if (Array.isArray(d.dates) && d.dates.length) morceaux.push(`passages : ${(d.dates as string[]).map(fmtJourCourt).join(', ')}`)
  if (typeof d.dernierBordereau === 'string') morceaux.push(`dernier bordereau : ${fmtJourCourt(d.dernierBordereau)}`)
  if (typeof d.rythme === 'string') morceaux.push(`rythme compris : ${d.rythme}`)
  if (typeof d.part === 'number') morceaux.push(`${d.part} % du plafond (${fmtEUR(Number(d.base))} sur ${fmtEUR(Number(d.plafond))})`)
  if (typeof d.jours === 'number') morceaux.push(`${d.jours} jours`)
  if (typeof d.joursDepuisCreation === 'number') morceaux.push(`magasin créé il y a ${d.joursDepuisCreation} jours`)
  if (typeof d.note === 'string') morceaux.push(d.note)
  return morceaux.join(' · ')
}

/**
 * Onglet Signaux de la console : ce que la surveillance nocturne a relevé, par client,
 * du plus urgent au plus anodin. Semaine 1 du plan : la liste et son état ; les dossiers
 * de résolution (mails prêts, associations de remplacement) arrivent ensuite.
 */
function SignauxAdmin({
  signaux,
  clients,
  surveillance,
  enCours,
  onLancer,
  onStatut,
  onOuvrirFil,
}: {
  signaux: Signal[]
  clients: ClientAdmin[]
  surveillance: Surveillance | null
  enCours: boolean
  onLancer: () => void
  onStatut: (s: Signal, statut: 'ouvert' | 'traite' | 'ignore') => void
  onOuvrirFil: (demandeId: string) => void
}) {
  const emailDe = new Map(clients.map((c) => [c.user_id, c.email ?? c.user_id]))
  const nomMagasin = (s: Signal) => {
    const etat = clients.find((c) => c.user_id === s.user_id)?.etat
    return etat?.magasins.find((m) => m.id === s.magasin_id)?.nom ?? etat?.societes.find((so) => so.id === s.societe_id)?.raisonSociale ?? ''
  }
  const tries = [...signaux].sort(
    (a, b) => ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut] || ORDRE_NIVEAU[a.niveau] - ORDRE_NIVEAU[b.niveau] || b.mis_a_jour_le.localeCompare(a.mis_a_jour_le),
  )
  const parClient = new Map<string, Signal[]>()
  for (const s of tries) parClient.set(s.user_id, [...(parClient.get(s.user_id) ?? []), s])

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: 14.5 }}>Surveillance des collectes</strong>
            <div className="muted">
              {surveillance
                ? `Dernier passage ${fmtDateHeure(surveillance.commencee_le)} (${surveillance.declencheur.startsWith('admin') ? 'lancé à la main' : 'automatique'}) · ${surveillance.comptes} compte${surveillance.comptes > 1 ? 's' : ''} · ${surveillance.signaux_ouverts} signal${surveillance.signaux_ouverts > 1 ? 'aux' : ''} vivant${surveillance.signaux_ouverts > 1 ? 's' : ''}, ${surveillance.nouveaux} nouveau${surveillance.nouveaux > 1 ? 'x' : ''}, ${surveillance.resolus} résolu${surveillance.resolus > 1 ? 's' : ''} · ${surveillance.rappels ?? 0} rappel${(surveillance.rappels ?? 0) > 1 ? 's' : ''} au magasin${surveillance.erreurs.length ? ` · ${surveillance.erreurs.length} erreur(s)` : ''}`
                : 'Aucun passage enregistré pour l’instant : le moteur tourne chaque nuit vers 5 h.'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onLancer} disabled={enCours}>
            {enCours ? 'Surveillance en cours…' : 'Lancer maintenant'}
          </button>
        </div>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Règles : un passage attendu sans bordereau 24 h après son créneau est manqué ; 1 manqué = case rouge chez le magasin, 2 = un fil de suivi s’ouvre
          avec le magasin (bouton « Dossier » : relance de l’association et recherche de remplacement prêtes à valider), 3 d’affilée = alerte, le magasin est prévenu que Mana prend la main.
          Relevé du mois précédent attendu le 10. Plafond signalé à 80 %. Un signal se résout de lui-même quand la cause disparaît, et son fil se referme.
        </p>
        {surveillance?.erreurs.map((e, i) => (
          <div className="info-banner alerte" key={i} style={{ marginTop: 8 }}>{e.compte} : {e.erreur}</div>
        ))}
      </div>

      {parClient.size === 0 && <div className="card empty">Aucun signal vivant : tout est en ordre.</div>}
      {[...parClient.entries()].map(([userId, liste]) => (
        <div className="card" key={userId}>
          <strong style={{ fontSize: 14.5, overflowWrap: 'anywhere' }}>{emailDe.get(userId) ?? userId}</strong>
          {liste.map((s) => (
            <div className={`signal-ligne ${s.statut}`} key={s.id}>
              <span className={LIBELLES_NIVEAU[s.niveau].classe} style={{ flex: 'none', marginTop: 2 }}>{LIBELLES_NIVEAU[s.niveau].texte}</span>
              <div className="corps">
                <div>
                  <strong>{s.titre}</strong>
                  {nomMagasin(s) && !s.titre.includes(nomMagasin(s)) ? <span className="muted"> · {nomMagasin(s)}</span> : null}
                </div>
                {resumeDetail(s) && <small>{resumeDetail(s)}</small>}
                <small>
                  {ACTIONS_SIGNAL[s.type as TypeSignal] ?? ''} Ouvert {fmtDateHeure(s.ouvert_le)}
                  {s.statut !== 'ouvert' && s.traite_le ? ` · ${s.statut === 'traite' ? 'traité' : 'ignoré'} par ${s.traite_par ?? 'Mana'} le ${fmtDateHeure(s.traite_le)}` : ''}
                </small>
              </div>
              <div className="row-actions" style={{ flex: 'none', marginTop: 0 }}>
                {s.demande_id && (
                  <button className="btn btn-primary btn-sm" onClick={() => onOuvrirFil(s.demande_id!)}>Dossier</button>
                )}
                {s.statut === 'ouvert' ? (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => onStatut(s, 'traite')}>Traité</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => onStatut(s, 'ignore')}>Ignorer</button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => onStatut(s, 'ouvert')}>Rouvrir</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Deux textes côte à côte : ce que Mana proposait, ce qui est parti. */
function Comparaison({ r }: { r: Redaction }) {
  const [ouvert, setOuvert] = useState(false)
  const identique = r.propose_corps.trim() === r.envoye_corps.trim() && r.propose_objet.trim() === r.envoye_objet.trim()
  return (
    <div style={{ borderTop: '1px solid var(--trait-doux)', paddingTop: 8, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span>
          <strong>{r.genre}</strong> · {fmtDateHeure(r.cree_le)} · {r.admin_email}
          {identique ? <span className="badge vert" style={{ marginLeft: 8 }}>envoyé tel quel</span> : <span className="badge" style={{ marginLeft: 8 }}>corrigé</span>}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOuvert(!ouvert)}>{ouvert ? 'Replier' : 'Comparer'}</button>
      </div>
      {ouvert && (
        <div className="style-comparaison">
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Proposé par Mana</div>
            <div className="muted" style={{ marginBottom: 4 }}>Objet : {r.propose_objet}</div>
            <pre>{r.propose_corps}</pre>
          </div>
          <div>
            <div className="muted" style={{ fontWeight: 700, marginBottom: 4 }}>Envoyé</div>
            <div className="muted" style={{ marginBottom: 4 }}>Objet : {r.envoye_objet}</div>
            <pre>{r.envoye_corps}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Onglet Style : les règles de rédaction de l'équipe (appliquées par « Appliquer mon style »
 * dans l'éditeur de mail) et l'historique proposé → envoyé dont elles se déduisent.
 */
function StyleAdmin() {
  const [regles, setRegles] = useState('')
  const [enregistre, setEnregistre] = useState<'repos' | 'en_cours' | 'fait'>('repos')
  const [redactions, setRedactions] = useState<Redaction[]>([])
  const [deduction, setDeduction] = useState<'repos' | 'en_cours' | 'erreur'>('repos')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    lireParametre<{ regles?: string }>('style').then((p) => setRegles(p?.regles ?? '')).catch((e) => setErreur((e as Error).message))
    listerRedactions(20).then(setRedactions).catch((e) => setErreur((e as Error).message))
  }, [])

  const corriges = redactions.filter((r) => r.propose_corps.trim() !== r.envoye_corps.trim() || r.propose_objet.trim() !== r.envoye_objet.trim()).length

  return (
    <div>
      <div className="card">
        <h3>Règles de style</h3>
        <p className="muted" style={{ margin: '2px 0 8px' }}>
          Ce que « ✨ Appliquer mon style » suit quand il réécrit un mail, avec vos cinq dernières corrections du même genre en exemple.
          Écrivez-les vous-même, ou déduisez-les de vos corrections et relisez.
        </p>
        <textarea rows={10} value={regles} onChange={(e) => setRegles(e.target.value)} placeholder={'• Tutoyer les associations que nous connaissons déjà\n• Deux paragraphes maximum\n• Toujours proposer un créneau d’appel…'} style={{ width: '100%', fontFamily: 'inherit', lineHeight: 1.45 }} />
        <div className="row-actions" style={{ marginTop: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={enregistre === 'en_cours'}
            onClick={async () => {
              setEnregistre('en_cours')
              try {
                await ecrireParametre('style', { regles })
                setEnregistre('fait')
                window.setTimeout(() => setEnregistre('repos'), 2000)
              } catch (e) {
                setErreur((e as Error).message)
                setEnregistre('repos')
              }
            }}
          >
            {enregistre === 'fait' ? '✓ Enregistré' : 'Enregistrer les règles'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={deduction === 'en_cours' || corriges === 0}
            title={corriges === 0 ? 'Aucune correction enregistrée pour l’instant : envoyez d’abord quelques mails en les retouchant.' : undefined}
            onClick={async () => {
              setDeduction('en_cours')
              setErreur('')
              try {
                const r = await deduireRegles()
                setRegles((actuel) => (actuel.trim() ? `${actuel.trim()}\n\n— Déduit de mes corrections —\n${r}` : r))
                setDeduction('repos')
              } catch (e) {
                setErreur((e as Error).message)
                setDeduction('erreur')
              }
            }}
          >
            {deduction === 'en_cours' ? 'Analyse…' : 'Déduire les règles de mes corrections'}
          </button>
        </div>
        {erreur && <p className="muted" style={{ color: 'var(--rouge)', marginTop: 8 }}>{erreur}</p>}
      </div>
      <div className="card">
        <h3>Mes corrections ({redactions.length}{corriges ? `, dont ${corriges} retouché${corriges > 1 ? 's' : ''}` : ''})</h3>
        <p className="muted" style={{ margin: '2px 0 0' }}>Chaque mail consigné depuis un dossier : la proposition de Mana à gauche, ce que vous avez envoyé à droite.</p>
        {redactions.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Rien pour l’instant.</p>}
        {redactions.map((r) => (
          <Comparaison key={r.id} r={r} />
        ))}
      </div>
    </div>
  )
}
