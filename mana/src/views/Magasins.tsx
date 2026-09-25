import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState, CategoriePesee, Collecteur, ContratSigne, Justificatif, Magasin, ProfilBordereau, Societe, Saisie, ReponsePassage } from '../types'
import { PROFILS_PRESETS, presetDuProfil, profilDeMagasin } from '../lib/bordereau'
import { ContratModal } from '../components/ContratModal'
import { VERSION_CONTRAT } from '../lib/contrat'
import { pdfBordereau, pdfContratService } from '../lib/pdf'
import { Collecte, EnteteCollecte, avancementCollecte, type ModeAssociation } from './Collecte'
import { useGrandEcran } from '../lib/ecran'
import { Simulateur } from './Simulateur'
import { plafondAnnuel, SUCCESS_FEE_PCT } from '../lib/calc'
import { libelleFrequence, resumePassages } from '../lib/annuaire'
import { CalendrierPassages } from '../components/CalendrierPassages'
import { ImportMagasins } from '../components/ImportMagasins'
import { LIBELLES_ELIGIBILITE } from '../components/CollecteurForm'
import { fmtDate, fmtEUR, fmtPct } from '../lib/format'
import { Amount } from '../components/Formula'
import { IconMagasins } from '../components/Icons'
import { uid } from '../lib/storage'
import { lireFichiers } from '../lib/fichiers'
import { normaliserSiren, sirenValide, verifierSiren } from '../lib/entreprise'
import { denomination } from '../lib/identite'
import { COLLECTEUR_VIDE, CollecteurForm } from '../components/CollecteurForm'
import { pdfModeleAttestation } from '../lib/pdf'

/**
 * Onboarding en deux temps (spec §4.1 + complément §2) :
 * 1. la Société — SIREN vérifié, CA/marge liés à un justificatif, plafond calculé ;
 * 2. le Magasin — paramètres de terrain (coût F&L, collecteurs).
 */
export function MagasinsView({
  state,
  session,
  invite = false,
  onSaveSociete,
  onDeleteSociete,
  onSaveMagasin,
  onDeleteMagasin,
  onReponsePassage,
  onAllerSaisie,
  onConnexion,
  onOuvrirAide,
  onOuvrirMessages,
  accesPartages = null,
}: {
  state: AppState
  session: Session | null
  /** Accès partagé : ni sociétés, ni ajout/suppression — seulement la collecte des magasins ouverts. */
  invite?: boolean
  /** Carte « Accès partagés » (App.tsx), rendue sous la liste des sociétés. */
  accesPartages?: ReactNode
  onSaveSociete: (s: Societe) => void
  onDeleteSociete: (id: string) => void
  onSaveMagasin: (m: Magasin) => void
  onDeleteMagasin: (id: string) => void
  /** Réponse du magasin sur un passage sans bordereau (calendrier de la carte Associations). */
  onReponsePassage?: (r: Omit<ReponsePassage, 'id' | 'le' | 'par'>) => void
  onAllerSaisie: () => void
  onConnexion: () => void
  onOuvrirAide: () => void
  onOuvrirMessages: () => void
}) {
  const { societes, magasins } = state
  const [edition, setEdition] = useState<
    | { type: 'societe'; societe: Societe | null }
    | { type: 'magasin'; societeId: string; magasin: Magasin | null }
    | null
  >(null)
  const [contratPour, setContratPour] = useState<Societe | null>(null)
  // Barre fixe en haut : une société à la fois, avec son avancement — plus besoin de défiler.
  const [societeSel, setSocieteSel] = useState<string>(() => societes[0]?.id ?? '')
  const societeActive = societes.find((x) => x.id === societeSel) ?? societes[0]
  const avancementSociete = (so: Societe) => {
    const ms = magasins.filter((m) => m.societeId === so.id)
    const faites = ms.reduce((t, m) => t + avancementCollecte(m).faites, 0)
    const total = ms.reduce((t, m) => t + avancementCollecte(m).total, 0)
    return { faites, total, nb: ms.length }
  }
  // Seule la collecte encore en mise en place s'ouvre d'elle-même ; une collecte terminée reste repliée
  // et se rouvre à la demande (bouton « Collecte » ou carte Associations).
  const [collecteOuverte, setCollecteOuverte] = useState<string | null>(() => {
    const enCours = magasins.find((m) => avancementCollecte(m).faites < avancementCollecte(m).total)
    return enCours?.id ?? null
  })
  // Raccourci « Associations » : ouvre la collecte du magasin, amène à l'étape Association, et
  // selon le mode ouvre directement la demande de changement ou le formulaire d'ajout.
  const [focusAssociation, setFocusAssociation] = useState<Record<string, number>>({})
  const [importOuvert, setImportOuvert] = useState(false)
  const [focusMode, setFocusMode] = useState<Record<string, ModeAssociation>>({})
  function ouvrirAssociations(magasinId: string, mode: ModeAssociation = 'liste') {
    setCollecteOuverte(magasinId)
    setFocusMode((f) => ({ ...f, [magasinId]: mode }))
    setFocusAssociation((f) => ({ ...f, [magasinId]: Date.now() }))
  }
  // Sur grand écran, la colonne de droite montre la carte Associations de la société, ou la collecte
  // du magasin explicitement ouvert.
  const grand = useGrandEcran()
  const magasinsAffiches = magasins.filter((m) => !societeActive || m.societeId === societeActive.id)
  const magasinAside = grand ? magasinsAffiches.find((m) => m.id === collecteOuverte) : undefined
  const hub = (
    <HubAssociations
      magasins={magasinsAffiches}
      saisies={state.saisies}
      reponses={state.reponsesPassages ?? []}
      onReponse={onReponsePassage}
      onGerer={(id) => ouvrirAssociations(id, 'liste')}
      onChanger={(id) => ouvrirAssociations(id, 'changement')}
      onAjouter={(id) => ouvrirAssociations(id, 'ajout')}
      onReprendre={(id) => setCollecteOuverte(id)}
    />
  )

  // Entrée / sortie d'un formulaire → retour en haut de page
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [edition])

  if (edition?.type === 'societe') {
    return (
      <FormulaireSociete
        initial={edition.societe}
        onCancel={() => setEdition(null)}
        onSave={(s, estNouvelle) => {
          onSaveSociete(s)
          setEdition(estNouvelle ? { type: 'magasin', societeId: s.id, magasin: null } : null)
        }}
      />
    )
  }
  if (edition?.type === 'magasin') {
    const societe = societes.find((s) => s.id === edition.societeId)
    return (
      <FormulaireMagasin
        societe={societe}
        societes={societes}
        onChoisirSociete={(id) => setEdition({ ...edition, societeId: id })}
        initial={edition.magasin}
        onCancel={() => setEdition(null)}
        onSave={(m) => {
          const nouveau = edition.magasin === null
          onSaveMagasin(m)
          setEdition(null)
          // Parcours fluide : un nouveau magasin s'ouvre directement sur sa mise en place
          if (nouveau) setCollecteOuverte(m.id)
        }}
      />
    )
  }

  return (
    <div className="magasins">
      <h2>{invite ? 'Magasins' : 'Sociétés & magasins'}</h2>
      {invite && societes.length === 0 && (
        <div className="card empty">
          <span className="ico">
            <IconMagasins />
          </span>
          Aucun magasin ne vous est ouvert pour l’instant.
        </div>
      )}
      {!invite && societes.length === 0 && (
        <div className="card empty">
          <span className="ico">
            <IconMagasins />
          </span>
          Aucune société pour l’instant.
          <br />
          L’onboarding prend moins de 5 minutes (SIREN + justificatif de CA).
        </div>
      )}
      {societes.length > 0 && (
        <div className="barre-societes">
          <select
            value={societeActive?.id ?? ''}
            onChange={(e) => setSocieteSel(e.target.value)}
            aria-label="Choisir une société"
          >
            {societes.map((so) => {
              const av = avancementSociete(so)
              return (
                <option key={so.id} value={so.id}>
                  {denomination(so)} · {av.nb} magasin{av.nb > 1 ? 's' : ''}
                </option>
              )
            })}
          </select>
          {societeActive && (
            <div className="barre-societes-actions">
              {magasins.filter((m) => m.societeId === societeActive.id).map((m) => (
                <button key={m.id} className="btn btn-ghost btn-sm" onClick={() => void pdfBordereau(m, denomination(societeActive))} title={`Bordereau d’enlèvement vierge — ${m.nom}`}>
                  ⬇ Bordereau {magasins.filter((x) => x.societeId === societeActive.id).length > 1 ? m.nom : ''}
                </button>
              ))}
              {!invite && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'magasin', societeId: societeActive.id, magasin: null })} title={`Ajouter un magasin à ${denomination(societeActive)} — avec estimation`}>
                    + Magasin
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'societe', societe: null })}>
                    + Société
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setImportOuvert(true)} title="Plusieurs magasins d’un coup, depuis un tableur">
                    ⬆ Importer CSV
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {!invite && importOuvert && (
        <ImportMagasins state={state} onSaveSociete={onSaveSociete} onSaveMagasin={onSaveMagasin} onFermer={() => setImportOuvert(false)} />
      )}
      {/* Deux colonnes dès 1 100 px : la société et ses magasins à gauche, la collecte du magasin ouvert à droite.
          En dessous, `.magasins-col { display: contents }` : rien ne change par rapport au mobile. */}
      <div className="magasins-grille">
      <div className="magasins-col">
      {societes.filter((s) => !societeActive || s.id === societeActive.id).map((s) => {
        const sesMagasins = magasins.filter((m) => m.societeId === s.id)
        return (
          <div className="card" key={s.id}>
            <h3>{denomination(s)}</h3>
            <p className="muted" style={{ margin: '2px 0 8px' }}>
              SIREN {s.siren}
              {s.verification.formeJuridique ? ` · ${s.verification.formeJuridique}` : ''}
              {s.verification.adresseSiege
                ? ` · ${s.verification.adresseSiege.voie}, ${s.verification.adresseSiege.codePostal} ${s.verification.adresseSiege.commune}`
                : ''}
            </p>
            {!invite && (
              s.contrat ? (
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
                  ✓ Contrat de service signé le {fmtDate(s.contrat.signeLe.slice(0, 10))} par {s.contrat.nomSignataire} (version {s.contrat.version}).{' '}
                  <button className="amt" onClick={() => void pdfContratService(s, { ...s.contrat!, adresseIp: null })}>Télécharger</button>
                  {s.contrat.version !== VERSION_CONTRAT && <> · <button className="amt" onClick={() => setContratPour(s)}>Nouvelle version à signer</button></>}
                </p>
              ) : (
                <div className="info-banner" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ flex: 1, minWidth: 220 }}>
                    <strong>Contrat de service à signer.</strong> Sans abonnement : 30 % de la réduction d’impôt acquise, facturée sur le réel. Il faut le signer avant la première facture.
                  </span>
                  <button className="btn btn-primary btn-sm" onClick={() => (session ? setContratPour(s) : onConnexion())}>
                    {session ? 'Lire et signer' : 'Se connecter pour signer'}
                  </button>
                </div>
              )
            )}
            {!invite && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {s.verification.apiStatut === 'verifie' ? (
                <span className="verif-badge">✓ Société vérifiée (registre national)</span>
              ) : (
                <span className="verif-badge attente">SIREN non vérifié</span>
              )}
              {s.verification.caVerifieLe ? (
                <span className="verif-badge">
                  ✓ CA &amp; marge vérifiés le {fmtDate(s.verification.caVerifieLe)} — source : {s.verification.caSource}
                </span>
              ) : (
                <span className="verif-badge attente">CA &amp; marge en attente de justificatif</span>
              )}
            </div>}
            {!invite && <div className="detail-lignes">
              <div className="ligne">
                <span>CA HT vérifié</span>
                <strong>{fmtEUR(s.caHT)}</strong>
              </div>
              <div className="ligne">
                <span>Plafond annuel de dons (calculé, non modifiable)</span>
                <Amount
                  titre="Plafond annuel (par société)"
                  lignes={[
                    'max(20 000 € ; 0,5 % × CA HT vérifié)',
                    `0,5 % × ${fmtEUR(s.caHT)} = ${fmtEUR(0.005 * s.caHT)}`,
                    `= ${fmtEUR(plafondAnnuel(s.caHT))}`,
                  ]}
                >
                  <strong>{fmtEUR(plafondAnnuel(s.caHT))}</strong>
                </Amount>
              </div>
              <div className="ligne">
                <span>Marge brute (liasse)</span>
                <strong>{fmtPct(s.margePct)}</strong>
              </div>
              <div className="ligne">
                <span>Commission Mana</span>
                <Amount
                  titre="Commission Mana"
                  lignes={[
                    `${s.successFeePct.toLocaleString('fr-FR')} % de la réduction d'impôt de 60 %`,
                    `= ${(s.successFeePct * 0.6).toLocaleString('fr-FR')} % de la base des dons documentés`,
                    'Facturée chaque mois échu ; s’arrête automatiquement au plafond.',
                  ]}
                >
                  <strong>{(s.successFeePct * 0.6).toLocaleString('fr-FR')} % de la base</strong>
                </Amount>
              </div>
            </div>}

            {sesMagasins.map((m) => {
              const av = avancementCollecte(m)
              const ouverte = collecteOuverte === m.id
              return (
                <div key={m.id} style={{ borderTop: '1px solid var(--trait-doux)', paddingTop: 10, marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: 14.5 }}>{m.nom}</strong>
                      <div className="muted">
                        {m.enseigne ? `${m.enseigne} · ` : ''}F&amp;L {fmtEUR(m.coutKgFL, 2)}/kg
                        {m.collecteurs.length > 0
                          ? ` · ${m.collecteurs.map((c) => `${c.nom}${libelleFrequence(c) ? ` (${libelleFrequence(c).toLowerCase()})` : ''}`).join(', ')}`
                          : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className={`btn btn-sm ${ouverte ? 'btn-primary' : av.faites < av.total ? 'btn-ambre' : 'btn-ghost'}`} onClick={() => setCollecteOuverte(ouverte ? null : m.id)}>
                        {ouverte ? '▾ Collecte' : '▸ Collecte'} · {av.faites}/{av.total} étape{av.total > 1 ? 's' : ''}
                      </button>
                      {!invite && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            title={m.collecteurs.length > 0 ? 'Modifier, ajouter ou changer d’association' : 'Enregistrer une association'}
                            onClick={() => ouvrirAssociations(m.id)}
                          >
                            {m.collecteurs.length > 0 ? 'Associations' : '+ Association'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'magasin', societeId: s.id, magasin: m })}>
                            Modifier le magasin
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            title={`Retirer le magasin ${m.nom}`}
                            onClick={() => {
                              if (confirm(`Supprimer « ${m.nom} » et ses saisies ?`)) onDeleteMagasin(m.id)
                            }}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {ouverte && !grand && (
                    <div className="collecte-integree">
                      <Collecte
                        state={state}
                        session={session}
                        magasinIdFixe={m.id}
                        onSaveMagasin={onSaveMagasin}
                        onAllerSaisie={onAllerSaisie}
                        onConnexion={onConnexion}
                        onOuvrirAide={onOuvrirAide}
                        onOuvrirMessages={onOuvrirMessages}
                        focusAssociation={focusAssociation[m.id]}
                        focusMode={focusMode[m.id]}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {!invite && <div className="row-actions" style={{ marginTop: 12, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Société {denomination(s)} :</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'societe', societe: s })}>
                Modifier la société
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm(`Supprimer « ${s.raisonSociale} », ses magasins et toutes leurs saisies ?`)) onDeleteSociete(s.id)
                }}
              >
                Supprimer la société
              </button>
            </div>}
          </div>
        )
      })}
      {!grand && magasinsAffiches.length > 0 && hub}
      {accesPartages}
      </div>
      {grand && magasinsAffiches.length > 0 && (
        <aside className="magasins-col">
          {magasinAside ? (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <EnteteCollecte magasin={magasinAside} titre={`Collecte — ${magasinAside.nom}`} />
                </div>
                <button className="btn btn-ghost btn-sm" style={{ flex: 'none' }} onClick={() => setCollecteOuverte(null)} title="Replier la collecte">
                  ✕ Fermer
                </button>
              </div>
              <div style={{ height: 14 }} />
              <Collecte
                key={magasinAside.id}
                state={state}
                session={session}
                magasinIdFixe={magasinAside.id}
                sansEntete
                onSaveMagasin={onSaveMagasin}
                onAllerSaisie={onAllerSaisie}
                onConnexion={onConnexion}
                onOuvrirAide={onOuvrirAide}
                onOuvrirMessages={onOuvrirMessages}
                focusAssociation={focusAssociation[magasinAside.id]}
                focusMode={focusMode[magasinAside.id]}
              />
            </div>
          ) : (
            hub
          )}
        </aside>
      )}
      </div>
      {contratPour && session && (
        <ContratModal
          societe={contratPour}
          session={session}
          onFermer={() => setContratPour(null)}
          onSigne={(contrat: ContratSigne) => onSaveSociete({ ...contratPour, contrat })}
        />
      )}
    </div>
  )
}

/**
 * Carte « Associations » : l'état des associations de chaque magasin, et les trois gestes
 * courants sans dérouler la mise en place de la collecte — gérer, demander un changement à Mana,
 * ajouter. Un magasin dont la collecte n'est pas terminée propose de reprendre là où il en est.
 */
function HubAssociations({
  magasins,
  saisies,
  reponses,
  onReponse,
  onGerer,
  onChanger,
  onAjouter,
  onReprendre,
}: {
  magasins: Magasin[]
  saisies: Saisie[]
  reponses: ReponsePassage[]
  onReponse?: (r: Omit<ReponsePassage, 'id' | 'le' | 'par'>) => void
  onGerer: (magasinId: string) => void
  onChanger: (magasinId: string) => void
  onAjouter: (magasinId: string) => void
  onReprendre: (magasinId: string) => void
}) {
  return (
    <div className="card hub-associations">
      <h3>Associations</h3>
      <p className="muted" style={{ margin: '2px 0 4px' }}>
        Qui collecte, à quel rythme, et si tout va bien. Un passage manqué, une association qui ne répond plus :
        demandez un changement, Mana gère la relation et vous répond dans Messages.
      </p>
      {magasins.map((m) => {
        const av = avancementCollecte(m)
        return (
          <div key={m.id} style={{ borderTop: '1px solid var(--trait-doux)', paddingTop: 10, marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14.5 }}>{m.nom}</strong>
              {av.faites < av.total && (
                <button className="btn btn-ambre btn-sm" onClick={() => onReprendre(m.id)}>
                  Reprendre la mise en place · {av.faites}/{av.total}
                </button>
              )}
            </div>
            {m.collecteurs.length === 0 ? (
              <p className="muted" style={{ margin: '6px 0 8px' }}>Aucune association enregistrée pour ce magasin.</p>
            ) : (
              m.collecteurs.map((c, i) => (
                <div className="facture-ligne" key={i} style={{ marginTop: 6 }}>
                  <div className="infos">
                    <strong>{c.nom}</strong>
                    <small>{[resumePassages(c), c.contact, c.telephone].filter(Boolean).join(' · ') || 'coordonnées à compléter'}</small>
                  </div>
                  <span className={LIBELLES_ELIGIBILITE[c.eligibilite ?? 'inconnue'].classe} style={{ flex: 'none' }}>
                    {LIBELLES_ELIGIBILITE[c.eligibilite ?? 'inconnue'].texte}
                  </span>
                </div>
              ))
            )}
            {m.collecteurs.length > 0 && <CalendrierPassages magasin={m} saisies={saisies} reponses={reponses} onReponse={onReponse} />}
            <div className="row-actions" style={{ marginTop: 8 }}>
              {m.collecteurs.length > 0 && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => onChanger(m.id)}>
                    Demander un changement à Mana
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onGerer(m.id)}>Gérer</button>
                </>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => onAjouter(m.id)}>+ Ajouter une association</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FormulaireSociete({
  initial,
  onSave,
  onCancel,
}: {
  initial: Societe | null
  onSave: (s: Societe, estNouvelle: boolean) => void
  onCancel: () => void
}) {
  const [raisonSociale, setRaisonSociale] = useState(initial?.raisonSociale ?? '')
  const [siren, setSiren] = useState(initial?.siren ?? '')
  const [caHT, setCaHT] = useState(initial?.caHT ?? 0)
  const [margePct, setMargePct] = useState(initial?.margePct ?? 30)
  const [verification, setVerification] = useState(initial?.verification ?? { apiStatut: 'non_verifie' as const })
  const [nouvellePiece, setNouvellePiece] = useState<Justificatif | null>(null)
  const [sourcePiece, setSourcePiece] = useState<'liasse' | 'attestation'>('liasse')
  const [verifEnCours, setVerifEnCours] = useState(false)
  const [messageVerif, setMessageVerif] = useState('')

  // Le CA et la marge sont liés au justificatif : modifiables uniquement
  // à la création ou en téléversant une nouvelle pièce.
  const caModifiable = !initial || nouvellePiece !== null
  const pieceOK = initial ? true : nouvellePiece !== null
  const valide = raisonSociale.trim() && sirenValide(siren) && caHT > 0 && margePct > 0 && margePct < 100 && pieceOK

  // Dès que 9 ou 14 chiffres sont saisis, on interroge le registre sans attendre un clic.
  useEffect(() => {
    const chiffres = siren.replace(/\D/g, '')
    if ((chiffres.length !== 9 && chiffres.length !== 14) || verifEnCours) return
    if (verification.apiStatut === 'verifie' && initial && normaliserSiren(siren) === initial.siren) return
    const timer = window.setTimeout(() => void lancerVerification(), 400)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siren])

  async function lancerVerification() {
    setVerifEnCours(true)
    setMessageVerif('')
    const r = await verifierSiren(siren)
    setVerifEnCours(false)
    if (r.ok) {
      setMessageVerif(`✓ ${r.raisonSociale}${r.formeJuridique ? ` (${r.formeJuridique})` : ''}${r.adresse ? ` — ${r.adresse.voie}, ${r.adresse.codePostal} ${r.adresse.commune}` : ''}`)
      // La dénomination du registre fait foi : c'est elle qui ira sur le reçu fiscal.
      if (r.raisonSociale) setRaisonSociale(r.raisonSociale)
      setVerification((v) => ({
        ...v,
        apiStatut: 'verifie',
        raisonSocialeAPI: r.raisonSociale,
        formeJuridique: r.formeJuridique,
        adresseSiege: r.adresse,
        apiVerifieLe: new Date().toISOString(),
      }))
    } else {
      setMessageVerif(r.erreur ?? 'Vérification impossible.')
      setVerification((v) => ({
        ...v,
        apiStatut: r.erreur?.includes('introuvable') ? 'introuvable' : 'indisponible',
      }))
    }
  }

  async function choisirPiece(files: FileList | null) {
    const [pj] = await lireFichiers(files)
    if (pj) setNouvellePiece(pj)
  }

  function enregistrer() {
    if (!valide) return
    const maintenant = new Date().toISOString()
    const verif = { ...verification }
    if (nouvellePiece) {
      verif.caVerifieLe = maintenant
      verif.caSource =
        sourcePiece === 'liasse' ? 'Liasse fiscale 2052 (téléversée)' : 'Attestation CA & marge de l’expert-comptable (téléversée)'
    }
    onSave(
      {
        id: initial?.id ?? uid(),
        raisonSociale: raisonSociale.trim(),
        siren: normaliserSiren(siren),
        caHT,
        margePct,
        // Fixé par Mana — jamais saisi par le client (30 % de la réduction constatée)
        successFeePct: SUCCESS_FEE_PCT,
        verification: verif,
        justificatifCA: nouvellePiece ?? initial?.justificatifCA,
        // Modifier la fiche ne dé-signe pas le contrat
        contrat: initial?.contrat,
        creeLe: initial?.creeLe ?? maintenant,
      },
      !initial,
    )
  }

  return (
    <div className="etroit">
      <h2>{initial ? 'Modifier la société' : 'Nouvelle société'}</h2>

      <div className="card">
        <h3>Identité (vérifiée au registre national)</h3>
        <label className="field">
          <span>SIREN ou SIRET *</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              placeholder="9 chiffres (SIREN) ou 14 (SIRET)"
              style={{ flex: 1 }}
            />
            <button className="btn btn-ghost" onClick={lancerVerification} disabled={verifEnCours || !sirenValide(siren)} style={{ opacity: sirenValide(siren) ? 1 : 0.5 }}>
              {verifEnCours ? '…' : 'Vérifier'}
            </button>
          </div>
          {messageVerif && <span className="aide" style={{ color: messageVerif.startsWith('✓') ? 'var(--vert)' : 'var(--rouge)' }}>{messageVerif}</span>}
          <span className="aide">
            Le registre national (api.gouv.fr) fournit la dénomination, la forme juridique et l’adresse du siège —
            reprises telles quelles sur le reçu fiscal et les documents.
          </span>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Dénomination {verification.apiStatut === 'verifie' ? '(registre national)' : '*'}</span>
          <input
            type="text"
            value={raisonSociale}
            onChange={(e) => setRaisonSociale(e.target.value)}
            placeholder="Renseignée automatiquement depuis le SIREN"
            readOnly={verification.apiStatut === 'verifie'}
            style={verification.apiStatut === 'verifie' ? { background: 'var(--sable)', fontWeight: 600 } : undefined}
          />
          {verification.apiStatut === 'verifie' && (
            <span className="aide">
              {verification.formeJuridique ?? 'Forme juridique inconnue'}
              {verification.adresseSiege ? ` · ${verification.adresseSiege.voie}, ${verification.adresseSiege.codePostal} ${verification.adresseSiege.commune}` : ''}
            </span>
          )}
        </label>
      </div>

      <div className="card">
        <h3>CA &amp; marge (liés à un justificatif)</h3>
        <p className="muted">
          Un seul justificatif prouve les deux valeurs : la liasse fiscale (formulaire 2052) les contient, ou une
          attestation d’expert-comptable mentionnant <strong>le CA HT et la marge brute</strong>. Le plafond de dons en
          découle automatiquement.
        </p>
        {initial && !nouvellePiece && (
          <div className="info-banner">
            CA et marge sont verrouillés par le justificatif du {initial.verification.caVerifieLe ? fmtDate(initial.verification.caVerifieLe) : '—'}.
            Téléversez une nouvelle pièce ci-dessous pour les modifier.
          </div>
        )}
        <label className="field">
          <span>Justificatif {initial ? '(nouvelle pièce)' : '*'}</span>
          <div className="chips" style={{ marginBottom: 8 }}>
            <button type="button" className={`chip ${sourcePiece === 'liasse' ? 'active' : ''}`} onClick={() => setSourcePiece('liasse')}>
              Liasse fiscale 2052
            </button>
            <button type="button" className={`chip ${sourcePiece === 'attestation' ? 'active' : ''}`} onClick={() => setSourcePiece('attestation')}>
              Attestation expert-comptable
            </button>
          </div>
          {sourcePiece === 'attestation' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 8 }}
              onClick={() => pdfModeleAttestation(raisonSociale.trim() || undefined, normaliserSiren(siren) || undefined, new Date().getFullYear())}
            >
              ⬇ Modèle d’attestation CA &amp; marge à faire signer par votre expert-comptable
            </button>
          )}
          <input type="file" accept="image/*,application/pdf" onChange={(e) => choisirPiece(e.target.files)} />
          {nouvellePiece && (
            <span className="justif-list">
              <span className="pj">
                📎 {nouvellePiece.nom}
                <button onClick={(e) => { e.preventDefault(); setNouvellePiece(null) }} aria-label="Retirer">✕</button>
              </span>
            </span>
          )}
          <span className="aide">
            Une seule demande à votre expert-comptable suffit : le modèle ci-dessus contient les deux valeurs (CA HT et
            marge brute). Si les comptes de la société ne sont pas publics, ce justificatif est obligatoire.
          </span>
        </label>
        <label className="field">
          <span>CA HT du dernier exercice *</span>
          <div className="suffixe">
            <input type="number" inputMode="numeric" min={0} step={10000} value={caHT || ''} disabled={!caModifiable} onChange={(e) => setCaHT(Number(e.target.value))} />
            <em>€ HT</em>
          </div>
          {caHT > 0 && (
            <span className="aide">
              Plafond annuel de dons : <strong>{fmtEUR(plafondAnnuel(caHT))}</strong> — max(20 000 € ; 0,5 % × CA HT). Calculé, jamais éditable.
            </span>
          )}
        </label>
        <label className="field">
          <span>Marge brute de la liasse *</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} max={99} step={0.1} value={margePct || ''} disabled={!caModifiable} onChange={(e) => setMargePct(Number(e.target.value))} />
            <em>%</em>
          </div>
          <span className="aide">
            Coefficient de valorisation : coût de revient = prix de vente × (1 − marge). Règle prudente : caler sur la
            liasse ou arrondir <strong>au-dessus</strong>.
          </span>
        </label>
        <p className="muted" style={{ margin: 0 }}>
          0 € d’abonnement : Mana se rémunère uniquement au succès, sur l’économie d’impôt réellement constatée —
          pas d’économie, pas de facture. Le détail figure sur chaque facture et dans « Votre contrat en clair ».
        </p>
      </div>

      <div className="row-actions">
        <button className="btn btn-primary" disabled={!valide} style={{ opacity: valide ? 1 : 0.5, flex: 1 }} onClick={enregistrer}>
          {initial ? 'Enregistrer' : 'Enregistrer et ajouter un magasin'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}

function FormulaireMagasin({
  societe,
  societes = [],
  onChoisirSociete,
  initial,
  onSave,
  onCancel,
}: {
  societe: Societe | undefined
  /** Toutes les sociétés du compte : à la création, le magasin se rattache à l'une d'elles. */
  societes?: Societe[]
  onChoisirSociete?: (societeId: string) => void
  initial: Magasin | null
  onSave: (m: Magasin) => void
  onCancel: () => void
}) {
  const [nom, setNom] = useState(initial?.nom ?? '')
  const [enseigne, setEnseigne] = useState(initial?.enseigne ?? '')
  const [adresse, setAdresse] = useState(initial?.adresse ?? '')
  const [coutKgFL, setCoutKgFL] = useState(initial?.coutKgFL ?? 2.2)
  const [frequence, setFrequence] = useState<'hebdomadaire' | 'quotidienne'>(initial?.frequenceSaisie ?? 'hebdomadaire')
  const [profil, setProfil] = useState<ProfilBordereau>(() =>
    initial ? profilDeMagasin(initial) : { colis: true, categories: PROFILS_PRESETS.tout_scanne.categories.map((c) => ({ ...c })) },
  )
  const majCategorie = (i: number, patch: Partial<CategoriePesee>) =>
    setProfil((p) => ({ ...p, categories: p.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
  const catFL = profil.categories.find((c) => c.id === 'fl')
  const modeFL: 'poids' | 'inclus' = catFL?.valorisation === 'cout_kg' ? 'poids' : 'inclus'
  const [collecteurs, setCollecteurs] = useState<Collecteur[]>(
    initial?.collecteurs?.length ? initial.collecteurs : [{ ...COLLECTEUR_VIDE }],
  )
  const [simulateurOuvert, setSimulateurOuvert] = useState(false)

  if (!societe) return null
  const valide = nom.trim().length > 0

  function enregistrer() {
    if (!valide || !societe) return
    const maintenant = new Date().toISOString()
    // Compatibilité : coutKgFL / modeFL restent le reflet de la catégorie F&L du profil
    const coutKgFLEffectif = catFL?.valorisation === 'cout_kg' ? (catFL.coutKg ?? coutKgFL) : coutKgFL
    const versions = [...(initial?.versionsParametres ?? [])]
    const derniere = versions[versions.length - 1]
    if (!derniere) {
      versions.push({ version: 1, date: maintenant, margePct: societe.margePct, coutKgFL: coutKgFLEffectif })
    } else if (derniere.coutKgFL !== coutKgFLEffectif || derniere.margePct !== societe.margePct) {
      versions.push({ version: derniere.version + 1, date: maintenant, margePct: societe.margePct, coutKgFL: coutKgFLEffectif })
    }
    onSave({
      id: initial?.id ?? uid(),
      societeId: societe.id,
      nom: nom.trim(),
      enseigne: enseigne.trim() || undefined,
      adresse: adresse.trim() || undefined,
      coutKgFL: coutKgFLEffectif,
      frequenceSaisie: frequence,
      modeFL,
      profilBordereau: { ...profil, categories: profil.categories.filter((c) => c.libelle.trim()) },
      collecteurs: collecteurs.filter((c) => c.nom.trim()),
      // Modifier les réglages ne remet pas la mise en place de la collecte à zéro
      miseEnPlace: initial?.miseEnPlace,
      creeLe: initial?.creeLe ?? maintenant,
      versionsParametres: versions,
    })
  }

  return (
    <div className="etroit">
      <h2>{initial ? 'Modifier le magasin' : `Nouveau magasin — ${societe.raisonSociale}`}</h2>
      {!initial && societes.length > 1 && onChoisirSociete && (
        <label className="field">
          <span>Société à laquelle rattacher ce magasin</span>
          <select value={societe.id} onChange={(e) => onChoisirSociete(e.target.value)} style={{ padding: 10 }}>
            {societes.map((so) => (
              <option key={so.id} value={so.id}>{so.raisonSociale}</option>
            ))}
          </select>
        </label>
      )}
      {!initial && (
        <div className="card">
          <button className="btn btn-ghost btn-block" onClick={() => setSimulateurOuvert((o) => !o)}>
            {simulateurOuvert ? '▾ Masquer l’estimation' : '▸ Estimer d’abord ce que ce magasin peut rapporter (simulateur)'}
          </button>
          {simulateurOuvert && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ margin: '0 0 8px' }}>
                Prérempli avec le CA et la marge de {denomination(societe)}. Ajustez la démarque et la part donnable pour ce magasin : c’est une
                estimation, la saisie réelle fera foi.
              </p>
              <Simulateur compact caInitial={societe.caHT} margeInitiale={societe.margePct} onCommencer={() => setSimulateurOuvert(false)} />
            </div>
          )}
        </div>
      )}
      <div className="card">
        <label className="field">
          <span>Nom du magasin *</span>
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Marché Frais Centre-Ville" />
        </label>
        <label className="field">
          <span>Enseigne (facultatif)</span>
          <input type="text" value={enseigne} onChange={(e) => setEnseigne(e.target.value)} placeholder="Ex. Bio&Local" />
        </label>
        <label className="field">
          <span>Adresse du magasin</span>
          <input type="text" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Ex. 58 boulevard Ornano, 75018 Paris" />
          <span className="aide">Sert à trouver des associations à proximité et figure sur les bordereaux.</span>
        </label>
        <div className="field">
          <span>Bordereau : ce qui est pesé et comment c’est valorisé</span>
          <div className="chips" style={{ marginBottom: 6 }}>
            {(Object.keys(PROFILS_PRESETS) as (keyof typeof PROFILS_PRESETS)[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${presetDuProfil(profil) === k ? 'active' : ''}`}
                onClick={() => setProfil({ colis: true, categories: PROFILS_PRESETS[k].categories.map((c) => ({ ...c })) })}
              >
                {PROFILS_PRESETS[k].libelle}
              </button>
            ))}
          </div>
          <span className="aide" style={{ display: 'block', marginBottom: 8 }}>
            {presetDuProfil(profil) ? PROFILS_PRESETS[presetDuProfil(profil)!].description : 'Profil personnalisé : chaque catégorie a sa propre règle.'}{' '}
            Chaque enseigne a ses habitudes de scan des pertes : ajustez catégorie par catégorie.
          </span>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Catégorie pesée</th>
                  <th>Sa valeur vient…</th>
                  <th className="num">€/kg</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {profil.categories.map((c, i) => (
                  <tr key={c.id}>
                    <td><input type="text" value={c.libelle} onChange={(e) => majCategorie(i, { libelle: e.target.value })} style={{ padding: 6, minWidth: 140 }} /></td>
                    <td>
                      <select value={c.valorisation} onChange={(e) => majCategorie(i, { valorisation: e.target.value as CategoriePesee['valorisation'], coutKg: e.target.value === 'cout_kg' ? (c.coutKg ?? 2.2) : undefined })} style={{ padding: 6 }}>
                        <option value="releve">du relevé (scanné en démarque)</option>
                        <option value="cout_kg">du poids × coût au kilo</option>
                      </select>
                    </td>
                    <td className="num">
                      {c.valorisation === 'cout_kg' && (
                        <input type="number" inputMode="decimal" min={0} step={0.1} value={c.coutKg ?? ''} onChange={(e) => majCategorie(i, { coutKg: Number(e.target.value) || 0 })} style={{ width: 80, padding: 6, textAlign: 'right' }} />
                      )}
                    </td>
                    <td>
                      {c.id !== 'fl' && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProfil((p) => ({ ...p, categories: p.categories.filter((_, j) => j !== i) }))} aria-label="Retirer">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 6 }}
            onClick={() => setProfil((p) => ({ ...p, categories: [...p.categories, { id: `cat${Date.now().toString(36)}`, libelle: '', valorisation: 'releve' }] }))}
          >
            + Ajouter une catégorie
          </button>
          <span className="aide" style={{ display: 'block', marginTop: 6 }}>
            Coût au kilo : total des achats annuels de la catégorie ÷ tonnage acheté, ou échantillonnage sur deux semaines. Modifiable à tout moment ; chaque ligne du registre fige les coefficients du jour.
          </span>
        </div>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Fréquence de saisie des pertes</span>
          <div className="chips" style={{ marginBottom: 0 }}>
            <button type="button" className={`chip ${frequence === 'hebdomadaire' ? 'active' : ''}`} onClick={() => setFrequence('hebdomadaire')}>
              Hebdomadaire (recommandé)
            </button>
            <button type="button" className={`chip ${frequence === 'quotidienne' ? 'active' : ''}`} onClick={() => setFrequence('quotidienne')}>
              Quotidienne
            </button>
          </div>
          <span className="aide">
            En quotidien, chaque journée s’ajoute au cumul de la semaine — le calcul fiscal reste hebdomadaire. Modifiable à tout moment.
          </span>
        </label>
      </div>

      <div className="card">
        <h3>Votre association collectrice</h3>
        <p className="muted">
          Vous travaillez déjà avec une association ? Renseignez-la ici : ses coordonnées et son rythme de passage
          sont repris automatiquement dans la collecte du magasin, sur les bordereaux et dans le reçu fiscal — vous n’aurez
          pas à les ressaisir. Si vous n’en avez pas encore, laissez vide : l’assistant Collecte vous en trouve une.
        </p>
        {collecteurs.map((c, i) => (
          <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--trait-doux)' : undefined, paddingTop: i > 0 ? 14 : 0 }}>
            <CollecteurForm
              valeur={c}
              onChange={(v) => setCollecteurs(collecteurs.map((x, j) => (j === i ? v : x)))}
              onSupprimer={collecteurs.length > 1 ? () => setCollecteurs(collecteurs.filter((_, j) => j !== i)) : undefined}
            />
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setCollecteurs([...collecteurs, { ...COLLECTEUR_VIDE }])}>
          + Ajouter une autre association
        </button>
      </div>

      <div className="row-actions">
        <button className="btn btn-primary" disabled={!valide} style={{ opacity: valide ? 1 : 0.5, flex: 1 }} onClick={enregistrer}>
          Enregistrer le magasin
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
