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
  type Signal,
  type Surveillance,
  type ClientAdmin,
  type Demande,
  type Message,
  type NonLus,
} from '../lib/cloud'
import { Composer } from '../components/Composer'
import { ActionsAssociation } from '../components/ActionsAssociation'
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
  const [onglet, setOnglet] = useState<'demandes' | 'signaux' | 'clients'>('demandes')
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

  async function repondre(d: Demande, texte: string) {
    if (!texte.trim()) return
    await envoyerMessage(d.id, d.user_id, 'mana', texte)
    if (d.statut === 'nouvelle') await majStatutDemande(d.id, 'en_cours')
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
                  onConsigner={(texte) => repondre(d, texte)}
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
                ? `Dernier passage ${fmtDateHeure(surveillance.commencee_le)} (${surveillance.declencheur.startsWith('admin') ? 'lancé à la main' : 'automatique'}) · ${surveillance.comptes} compte${surveillance.comptes > 1 ? 's' : ''} · ${surveillance.signaux_ouverts} signal${surveillance.signaux_ouverts > 1 ? 'aux' : ''} vivant${surveillance.signaux_ouverts > 1 ? 's' : ''}, ${surveillance.nouveaux} nouveau${surveillance.nouveaux > 1 ? 'x' : ''}, ${surveillance.resolus} résolu${surveillance.resolus > 1 ? 's' : ''}${surveillance.erreurs.length ? ` · ${surveillance.erreurs.length} erreur(s)` : ''}`
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
