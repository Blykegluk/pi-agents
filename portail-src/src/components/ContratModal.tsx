import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { ContratSigne, Societe } from '../types'
import { EDITEUR, VERSION_CONTRAT, articlesContrat, empreinteContrat } from '../lib/contrat'
import { signerContrat } from '../lib/cloud'
import { pdfContratService } from '../lib/pdf'
import { denomination } from '../lib/identite'

/**
 * Signature en ligne du contrat de service. Le texte affiché est celui du
 * PDF, mot pour mot ; l'empreinte envoyée au serveur en est le sceau. Ce qui
 * est signé est exactement ce qui est archivé.
 */
export function ContratModal({
  societe,
  session,
  onSigne,
  onFermer,
}: {
  societe: Societe
  session: Session
  onSigne: (contrat: ContratSigne) => void
  onFermer: () => void
}) {
  const [nom, setNom] = useState('')
  const [lu, setLu] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')
  const articles = articlesContrat(societe)

  async function signer() {
    if (!lu || nom.trim().length < 3) return
    setEnCours(true)
    setErreur('')
    try {
      const empreinte = await empreinteContrat(societe)
      const preuve = await signerContrat({
        societeId: societe.id,
        raisonSociale: denomination(societe),
        siren: societe.siren,
        version: VERSION_CONTRAT,
        empreinte,
        nomSignataire: nom.trim(),
      })
      const contrat: ContratSigne = { id: preuve.id, version: preuve.version, signeLe: preuve.signe_le, email: preuve.email, nomSignataire: nom.trim() }
      onSigne(contrat)
      await pdfContratService(societe, { ...contrat, adresseIp: preuve.adresse_ip })
      onFermer()
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onFermer}>
      <div className="sheet" role="dialog" aria-label="Contrat de service Mana" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-handle" />
        <h3 style={{ marginBottom: 2 }}>Contrat de service Mana</h3>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
          Version {VERSION_CONTRAT} · entre {EDITEUR.denomination} {EDITEUR.forme} (éditeur de Mana) et {denomination(societe)}. Lisez, puis signez en bas.
        </p>
        <div className="contrat-texte">
          {articles.map((a) => (
            <section key={a.titre}>
              <h4>{a.titre}</h4>
              <p>{a.corps}</p>
            </section>
          ))}
        </div>
        <div style={{ paddingTop: 10 }}>
          <label className="field">
            <span>Votre nom et qualité (signataire pour {denomination(societe)})</span>
            <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Anthony Bouskila, président" />
          </label>
          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={lu} onChange={(e) => setLu(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--vert)' }} />
            <span style={{ marginBottom: 0, fontWeight: 600, fontSize: 14 }}>J’ai lu le contrat et je l’accepte au nom de {denomination(societe)}.</span>
          </label>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            En cliquant « Signer », Mana enregistre votre identité ({session.user.email}), la date et l’heure, la version du texte et l’adresse depuis laquelle vous signez,
            puis vous remet le contrat en PDF. Cette acceptation vaut signature (articles 1366 et 1367 du code civil).
          </p>
          {erreur && <p className="muted" style={{ color: 'var(--rouge)' }}>{erreur}</p>}
          <div className="row-actions">
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!lu || nom.trim().length < 3 || enCours} onClick={() => void signer()}>
              {enCours ? 'Signature…' : 'Signer électroniquement'}
            </button>
            <button className="btn btn-ghost" onClick={() => void pdfContratService(societe)}>Lire en PDF</button>
            <button className="btn btn-ghost" onClick={onFermer}>Plus tard</button>
          </div>
        </div>
      </div>
    </div>
  )
}
