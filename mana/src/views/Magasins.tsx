import { useEffect, useState } from 'react'
import type { Collecteur, Justificatif, Magasin, Societe } from '../types'
import { plafondAnnuel, SUCCESS_FEE_PCT } from '../lib/calc'
import { fmtDate, fmtEUR, fmtPct } from '../lib/format'
import { Amount } from '../components/Formula'
import { IconMagasins } from '../components/Icons'
import { uid } from '../lib/storage'
import { lireFichiers } from '../lib/fichiers'
import { normaliserSiren, sirenValide, verifierSiren } from '../lib/entreprise'
import { pdfModeleAttestation } from '../lib/pdf'

/**
 * Onboarding en deux temps (spec §4.1 + complément §2) :
 * 1. la Société — SIREN vérifié, CA/marge liés à un justificatif, plafond calculé ;
 * 2. le Magasin — paramètres de terrain (coût F&L, collecteurs).
 */
export function MagasinsView({
  societes,
  magasins,
  onSaveSociete,
  onDeleteSociete,
  onSaveMagasin,
  onDeleteMagasin,
  onPremierMagasin,
}: {
  societes: Societe[]
  magasins: Magasin[]
  onSaveSociete: (s: Societe) => void
  onDeleteSociete: (id: string) => void
  onSaveMagasin: (m: Magasin) => void
  onDeleteMagasin: (id: string) => void
  onPremierMagasin: () => void
}) {
  const [edition, setEdition] = useState<
    | { type: 'societe'; societe: Societe | null }
    | { type: 'magasin'; societeId: string; magasin: Magasin | null }
    | null
  >(null)

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
        initial={edition.magasin}
        onCancel={() => setEdition(null)}
        onSave={(m) => {
          const premierMagasin = edition.magasin === null && magasins.length === 0
          onSaveMagasin(m)
          setEdition(null)
          // Parcours fluide : après le tout premier magasin, direction la mise en place de la collecte
          if (premierMagasin) onPremierMagasin()
        }}
      />
    )
  }

  return (
    <div>
      <h2>Sociétés &amp; magasins</h2>
      {societes.length === 0 && (
        <div className="card empty">
          <span className="ico">
            <IconMagasins />
          </span>
          Aucune société pour l’instant.
          <br />
          L’onboarding prend moins de 5 minutes (SIREN + justificatif de CA).
        </div>
      )}
      {societes.map((s) => {
        const sesMagasins = magasins.filter((m) => m.societeId === s.id)
        return (
          <div className="card" key={s.id}>
            <h3>{s.raisonSociale}</h3>
            <p className="muted" style={{ margin: '2px 0 8px' }}>
              SIREN {s.siren}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
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
            </div>
            <div className="detail-lignes">
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
            </div>

            {sesMagasins.map((m) => (
              <div key={m.id} style={{ borderTop: '1px solid var(--trait-doux)', paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <strong style={{ fontSize: 14.5 }}>{m.nom}</strong>
                    <div className="muted">
                      {m.enseigne ? `${m.enseigne} · ` : ''}F&amp;L {fmtEUR(m.coutKgFL, 2)}/kg
                      {m.collecteurs.length > 0 ? ` · ${m.collecteurs.map((c) => c.nom).join(', ')}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'magasin', societeId: s.id, magasin: m })}>
                      Modifier
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm(`Supprimer « ${m.nom} » et ses saisies ?`)) onDeleteMagasin(m.id)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="row-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'magasin', societeId: s.id, magasin: null })}>
                + Ajouter un magasin
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdition({ type: 'societe', societe: s })}>
                Modifier la société
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm(`Supprimer « ${s.raisonSociale} », ses magasins et toutes leurs saisies ?`)) onDeleteSociete(s.id)
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        )
      })}
      <button className="btn btn-primary btn-block" onClick={() => setEdition({ type: 'societe', societe: null })}>
        + Ajouter une société
      </button>
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

  async function lancerVerification() {
    setVerifEnCours(true)
    setMessageVerif('')
    const r = await verifierSiren(siren)
    setVerifEnCours(false)
    if (r.ok) {
      setMessageVerif(`✓ Société trouvée : ${r.raisonSociale}`)
      if (!raisonSociale.trim() && r.raisonSociale) setRaisonSociale(r.raisonSociale)
      setVerification((v) => ({
        ...v,
        apiStatut: 'verifie',
        raisonSocialeAPI: r.raisonSociale,
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
        creeLe: initial?.creeLe ?? maintenant,
      },
      !initial,
    )
  }

  return (
    <div>
      <h2>{initial ? 'Modifier la société' : 'Nouvelle société'}</h2>

      <div className="card">
        <h3>Identité (vérifiée au registre national)</h3>
        <label className="field">
          <span>SIREN *</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              placeholder="9 chiffres"
              style={{ flex: 1 }}
            />
            <button className="btn btn-ghost" onClick={lancerVerification} disabled={verifEnCours || !sirenValide(siren)} style={{ opacity: sirenValide(siren) ? 1 : 0.5 }}>
              {verifEnCours ? '…' : 'Vérifier'}
            </button>
          </div>
          {messageVerif && <span className="aide" style={{ color: messageVerif.startsWith('✓') ? 'var(--vert)' : 'var(--rouge)' }}>{messageVerif}</span>}
          <span className="aide">Vérification gratuite via l’API Recherche d’Entreprises (api.gouv.fr).</span>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Raison sociale *</span>
          <input type="text" value={raisonSociale} onChange={(e) => setRaisonSociale(e.target.value)} placeholder="Ex. SARL Delmas Distribution" />
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
  initial,
  onSave,
  onCancel,
}: {
  societe: Societe | undefined
  initial: Magasin | null
  onSave: (m: Magasin) => void
  onCancel: () => void
}) {
  const [nom, setNom] = useState(initial?.nom ?? '')
  const [enseigne, setEnseigne] = useState(initial?.enseigne ?? '')
  const [coutKgFL, setCoutKgFL] = useState(initial?.coutKgFL ?? 2.2)
  const [frequence, setFrequence] = useState<'hebdomadaire' | 'quotidienne'>(initial?.frequenceSaisie ?? 'hebdomadaire')
  const [collecteurs, setCollecteurs] = useState<Collecteur[]>(
    initial?.collecteurs?.length ? initial.collecteurs : [{ nom: '', contact: '', jours: '' }],
  )

  if (!societe) return null
  const valide = nom.trim().length > 0

  function enregistrer() {
    if (!valide || !societe) return
    const maintenant = new Date().toISOString()
    const versions = [...(initial?.versionsParametres ?? [])]
    const derniere = versions[versions.length - 1]
    if (!derniere) {
      versions.push({ version: 1, date: maintenant, margePct: societe.margePct, coutKgFL })
    } else if (derniere.coutKgFL !== coutKgFL || derniere.margePct !== societe.margePct) {
      versions.push({ version: derniere.version + 1, date: maintenant, margePct: societe.margePct, coutKgFL })
    }
    onSave({
      id: initial?.id ?? uid(),
      societeId: societe.id,
      nom: nom.trim(),
      enseigne: enseigne.trim() || undefined,
      coutKgFL,
      frequenceSaisie: frequence,
      collecteurs: collecteurs.filter((c) => c.nom.trim()),
      creeLe: initial?.creeLe ?? maintenant,
      versionsParametres: versions,
    })
  }

  return (
    <div>
      <h2>{initial ? 'Modifier le magasin' : `Nouveau magasin — ${societe.raisonSociale}`}</h2>
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
          <span>Coût de revient moyen F&amp;L</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} step={0.1} value={coutKgFL} onChange={(e) => setCoutKgFL(Number(e.target.value))} />
            <em>€/kg</em>
          </div>
          <span className="aide">Préréglé à 2,20 €/kg. Source : total des achats F&amp;L annuels ÷ tonnage acheté, ou échantillonnage sur 2 semaines.</span>
        </label>
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
        <h3>Collecteur(s) partenaire(s)</h3>
        <p className="muted">Banque Alimentaire, Restos du Cœur, Linkee, Le Chaînon Manquant… Informatif.</p>
        {collecteurs.map((c, i) => (
          <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--trait-doux)' : undefined, paddingTop: i > 0 ? 12 : 0 }}>
            <label className="field">
              <span>Nom de l’association</span>
              <input type="text" value={c.nom} onChange={(e) => setCollecteurs(collecteurs.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} placeholder="Ex. Banque Alimentaire du Rhône" />
            </label>
            <label className="field">
              <span>Contact</span>
              <input type="text" value={c.contact} onChange={(e) => setCollecteurs(collecteurs.map((x, j) => (j === i ? { ...x, contact: e.target.value } : x)))} placeholder="Nom, téléphone…" />
            </label>
            <label className="field">
              <span>Jours de passage</span>
              <input type="text" value={c.jours} onChange={(e) => setCollecteurs(collecteurs.map((x, j) => (j === i ? { ...x, jours: e.target.value } : x)))} placeholder="Ex. mardi et vendredi matin" />
            </label>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setCollecteurs([...collecteurs, { nom: '', contact: '', jours: '' }])}>
          + Ajouter un collecteur
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
