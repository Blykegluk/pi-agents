import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  envoyerMessage,
  listerClients,
  majStatutDemande,
  mesDemandes,
  messagesDe,
  type ClientAdmin,
  type Demande,
  type Message,
} from '../lib/cloud'
import { aggParSociete } from '../lib/selectors'
import { fmtDateHeure, fmtEUR, fmtNum } from '../lib/format'
import { LIBELLES_STATUT } from '../components/Aide'
import { exerciceCourant } from '../lib/demo'

/**
 * Console administrateur Mana : demandes entrantes (mise en relation, support)
 * avec fil de discussion, et suivi d'activité de chaque client.
 */
export function Admin({ session }: { session: Session }) {
  const [onglet, setOnglet] = useState<'demandes' | 'clients'>('demandes')
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [clients, setClients] = useState<ClientAdmin[]>([])
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [fil, setFil] = useState<Message[]>([])
  const [reponse, setReponse] = useState('')
  const [erreur, setErreur] = useState('')
  const exercice = exerciceCourant()

  async function recharger() {
    try {
      setErreur('')
      const [d, c] = await Promise.all([mesDemandes(), listerClients()])
      setDemandes(d)
      setClients(c)
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  useEffect(() => {
    recharger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (ouverte) messagesDe(ouverte).then(setFil).catch(() => setFil([]))
  }, [ouverte])

  const nouvelles = useMemo(() => demandes.filter((d) => d.statut === 'nouvelle').length, [demandes])

  async function repondre(d: Demande) {
    if (!reponse.trim()) return
    await envoyerMessage(d.id, d.user_id, 'mana', reponse)
    if (d.statut === 'nouvelle') await majStatutDemande(d.id, 'en_cours')
    setReponse('')
    setFil(await messagesDe(d.id))
    setDemandes(await mesDemandes())
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

      <div className="chips">
        <button className={`chip ${onglet === 'demandes' ? 'active' : ''}`} onClick={() => setOnglet('demandes')}>
          Demandes{nouvelles > 0 ? ` (${nouvelles} nouvelle${nouvelles > 1 ? 's' : ''})` : ''}
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
                    {d.type === 'collecte' ? 'Mise en relation' : 'Support'} — {d.sujet}
                  </strong>
                  <div className="muted">{d.email ?? d.user_id} · {fmtDateHeure(d.created_at)}</div>
                </div>
                <span className={LIBELLES_STATUT[d.statut].classe}>{LIBELLES_STATUT[d.statut].texte}</span>
              </div>

              {Object.keys(d.contenu).length > 0 && (
                <div className="detail-lignes" style={{ marginTop: 6 }}>
                  {Object.entries(d.contenu).map(([cle, valeur]) => (
                    <div className="ligne" key={cle}>
                      <span style={{ textTransform: 'capitalize' }}>{cle.replace(/_/g, ' ')}</span>
                      <strong style={{ whiteSpace: 'normal', textAlign: 'right' }}>{String(valeur)}</strong>
                    </div>
                  ))}
                </div>
              )}

              <div className="row-actions" style={{ marginTop: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setOuverte(ouverte === d.id ? null : d.id)}>
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
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <input type="text" placeholder="Répondre au client…" value={reponse} onChange={(e) => setReponse(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && repondre(d)} style={{ flex: 1 }} />
                    <button className="btn btn-primary btn-sm" onClick={() => repondre(d)} disabled={!reponse.trim()} style={{ opacity: reponse.trim() ? 1 : 0.5 }}>
                      Envoyer
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
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
