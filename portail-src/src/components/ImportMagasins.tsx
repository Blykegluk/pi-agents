import { useState } from 'react'
import type { AppState, Magasin, Societe } from '../types'
import { interpreterCSV, preparerImport, MODELE_CSV, MARGE_PAR_DEFAUT, type PlanImport } from '../lib/importMagasins'
import { verifierSiren } from '../lib/entreprise'
import { fmtEUR } from '../lib/format'

/**
 * Import CSV de magasins : coller ou déposer le fichier, relire ce qui va être créé
 * (sociétés reconnues ou nouvelles, magasins, associations, avertissements), puis
 * enregistrer en un clic. Les SIREN des nouvelles sociétés sont vérifiés au registre.
 */
export function ImportMagasins({ state, onSaveSociete, onSaveMagasin, onFermer }: { state: AppState; onSaveSociete: (s: Societe) => void; onSaveMagasin: (m: Magasin) => void; onFermer: () => void }) {
  const [texte, setTexte] = useState('')
  const [plan, setPlan] = useState<PlanImport | null>(null)
  const [inconnues, setInconnues] = useState<string[]>([])
  const [etape, setEtape] = useState<'saisie' | 'verification' | 'fait'>('saisie')
  const [avancement, setAvancement] = useState('')
  const [erreur, setErreur] = useState('')

  function analyser(t: string) {
    setTexte(t)
    setErreur('')
    if (!t.trim()) {
      setPlan(null)
      return
    }
    try {
      const { lignes, colonnesInconnues, colonnesReconnues } = interpreterCSV(t)
      setInconnues(colonnesInconnues)
      if (!colonnesReconnues.includes('magasin')) {
        setPlan(null)
        setErreur('Colonne « magasin » introuvable : la première ligne du fichier doit contenir les en-têtes (voir le modèle).')
        return
      }
      setPlan(preparerImport(lignes, state))
    } catch (e) {
      setPlan(null)
      setErreur((e as Error).message)
    }
  }

  async function fichierChoisi(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    analyser(await f.text())
  }

  function telechargerModele() {
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + MODELE_CSV)
    a.download = 'modele-import-magasins.csv'
    a.click()
  }

  async function importer() {
    if (!plan) return
    setEtape('verification')
    setErreur('')
    try {
      // 1) Sociétés nouvelles, vérifiées au registre national (dénomination officielle, siège).
      const nouvelles = plan.societes.filter((s) => s.nouvelle)
      for (let i = 0; i < nouvelles.length; i++) {
        const s = nouvelles[i]
        setAvancement(`Vérification au registre : ${s.societe.raisonSociale} (${i + 1}/${nouvelles.length})`)
        let societe = s.societe
        if (societe.siren) {
          try {
            const r = await verifierSiren(societe.siren)
            societe = r.ok
              ? { ...societe, verification: { apiStatut: 'verifie', raisonSocialeAPI: r.raisonSociale, formeJuridique: r.formeJuridique, adresseSiege: r.adresse, apiVerifieLe: new Date().toISOString() } }
              : { ...societe, verification: { apiStatut: r.erreur?.includes('introuvable') ? 'introuvable' : 'indisponible' } }
          } catch {
            societe = { ...societe, verification: { apiStatut: 'indisponible' } }
          }
        }
        onSaveSociete(societe)
      }
      // 2) Magasins, sauf ceux déjà présents.
      const aCreer = plan.magasins.filter((m) => !m.dejaPresent)
      setAvancement(`Enregistrement de ${aCreer.length} magasin${aCreer.length > 1 ? 's' : ''}…`)
      for (const m of aCreer) onSaveMagasin(m.magasin)
      setEtape('fait')
      setAvancement(`${aCreer.length} magasin${aCreer.length > 1 ? 's' : ''} et ${nouvelles.length} société${nouvelles.length > 1 ? 's' : ''} enregistré${aCreer.length + nouvelles.length > 1 ? 's' : ''}.`)
    } catch (e) {
      setErreur((e as Error).message)
      setEtape('saisie')
    }
  }

  const nbNouveaux = plan?.magasins.filter((m) => !m.dejaPresent).length ?? 0
  const nbSocietesNouvelles = plan?.societes.filter((s) => s.nouvelle).length ?? 0

  return (
    <div className="card import-magasins">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Importer des magasins (CSV)</h3>
        <button className="btn btn-ghost btn-sm" onClick={onFermer}>Fermer</button>
      </div>
      <p className="muted" style={{ margin: '4px 0 8px' }}>
        Une ligne par magasin. Colonnes : société, SIREN, CA HT, marge %, magasin, enseigne, adresse, association, contact, téléphone, e-mail,
        fréquence, créneau, jours, coût F&amp;L au kilo. Seuls « société » (ou SIREN) et « magasin » sont obligatoires.{' '}
        <button type="button" className="lien" onClick={telechargerModele}>Télécharger le modèle</button>
      </p>
      {etape === 'saisie' && (
        <>
          <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void fichierChoisi(e.target.files)} />
          <textarea
            rows={6}
            value={texte}
            onChange={(e) => analyser(e.target.value)}
            placeholder={'Ou collez ici le contenu du fichier (première ligne : les en-têtes).\n' + MODELE_CSV.split('\n')[0]}
            style={{ width: '100%', marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          />
        </>
      )}
      {erreur && <div className="info-banner alerte" style={{ marginTop: 8 }}>{erreur}</div>}
      {inconnues.length > 0 && <p className="muted" style={{ marginTop: 6 }}>Colonnes ignorées : {inconnues.join(', ')}.</p>}

      {plan && etape !== 'fait' && (
        <>
          <p style={{ margin: '10px 0 6px' }}>
            <strong>{nbNouveaux}</strong> magasin{nbNouveaux > 1 ? 's' : ''} à créer, <strong>{nbSocietesNouvelles}</strong> société{nbSocietesNouvelles > 1 ? 's' : ''} nouvelle{nbSocietesNouvelles > 1 ? 's' : ''}
            {plan.magasins.some((m) => m.dejaPresent) ? `, ${plan.magasins.filter((m) => m.dejaPresent).length} déjà présent(s) (ignorés)` : ''}
            {plan.erreurs.length ? `, ${plan.erreurs.length} ligne${plan.erreurs.length > 1 ? 's' : ''} en erreur` : ''}.
          </p>
          {plan.societes.some((s) => s.nouvelle && s.margeParDefaut) && (
            <div className="info-banner" style={{ marginBottom: 8 }}>
              Marge brute absente pour {plan.societes.filter((s) => s.nouvelle && s.margeParDefaut).map((s) => s.societe.raisonSociale).join(', ')} : {MARGE_PAR_DEFAUT} % par défaut.
              La marge fixe la valeur des dons emballés : corrigez-la dans la fiche société avec la liasse ou l’attestation de l’expert-comptable.
            </div>
          )}
          <div className="table-scroll">
            <table className="reseau-table">
              <thead>
                <tr><th>Ligne</th><th>Société</th><th>Magasin</th><th>Association · rythme</th><th>État</th></tr>
              </thead>
              <tbody>
                {plan.magasins.map((m) => (
                  <tr key={m.ligne}>
                    <td>{m.ligne}</td>
                    <td>
                      {m.societe.societe.raisonSociale}
                      {m.societe.nouvelle ? <span className="badge" style={{ marginLeft: 6 }}>nouvelle</span> : <span className="badge vert" style={{ marginLeft: 6 }}>existante</span>}
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {m.societe.societe.siren ? `SIREN ${m.societe.societe.siren}` : 'sans SIREN'}
                        {m.societe.nouvelle ? ` · CA ${fmtEUR(m.societe.societe.caHT)} · marge ${m.societe.societe.margePct} %` : ''}
                      </div>
                    </td>
                    <td>
                      <strong>{m.magasin.nom}</strong>
                      <div className="muted" style={{ fontSize: 11.5 }}>{[m.magasin.enseigne, m.magasin.adresse].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>
                      {m.magasin.collecteurs[0] ? (
                        <>
                          {m.magasin.collecteurs[0].nom}
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {[m.magasin.collecteurs[0].frequence === 'Autre' ? m.magasin.collecteurs[0].frequenceAutre : m.magasin.collecteurs[0].frequence, m.magasin.collecteurs[0].plage === 'Autre' ? m.magasin.collecteurs[0].plageAutre : m.magasin.collecteurs[0].plage, m.magasin.collecteurs[0].jours].filter(Boolean).join(' · ')}
                          </div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {m.dejaPresent ? <span className="badge">déjà présent</span> : <span className="badge vert">à créer</span>}
                      {m.avertissements.map((a) => (
                        <div className="muted" style={{ fontSize: 11.5 }} key={a}>{a}</div>
                      ))}
                    </td>
                  </tr>
                ))}
                {plan.erreurs.map((e) => (
                  <tr key={`e${e.ligne}`} className="niveau-alerte">
                    <td>{e.ligne}</td>
                    <td colSpan={3} className="muted">{e.message}</td>
                    <td><span className="badge alerte">ignorée</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" disabled={nbNouveaux === 0 || etape === 'verification'} style={{ opacity: nbNouveaux === 0 ? 0.5 : 1 }} onClick={() => void importer()}>
              {etape === 'verification' ? 'Import en cours…' : `Importer ${nbNouveaux} magasin${nbNouveaux > 1 ? 's' : ''}`}
            </button>
            {avancement && <span className="muted">{avancement}</span>}
          </div>
        </>
      )}
      {etape === 'fait' && (
        <div className="info-banner vert" style={{ marginTop: 8 }}>
          {avancement} Les magasins apparaissent dans la liste ; complétez les fiches (adresse, pièces des associations) au fil de l’eau.
        </div>
      )}
    </div>
  )
}
