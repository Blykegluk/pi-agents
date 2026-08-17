import { useState } from 'react'
import type { Collecteur, Magasin } from '../types'
import { plafondAnnuel } from '../lib/calc'
import { fmtEUR, fmtPct } from '../lib/format'
import { Amount } from '../components/Formula'
import { uid } from '../lib/storage'

/** Onboarding magasin (spec §4.1) — une fois, < 5 minutes. */
export function Magasins({
  magasins,
  onSave,
  onDelete,
}: {
  magasins: Magasin[]
  onSave: (m: Magasin) => void
  onDelete: (id: string) => void
}) {
  const [edition, setEdition] = useState<Magasin | 'nouveau' | null>(null)

  if (edition) {
    return (
      <FormulaireMagasin
        initial={edition === 'nouveau' ? null : edition}
        onCancel={() => setEdition(null)}
        onSave={(m) => {
          onSave(m)
          setEdition(null)
        }}
      />
    )
  }

  return (
    <div>
      <h2>Mes magasins</h2>
      {magasins.length === 0 && (
        <div className="card empty">
          <span className="ico">🏪</span>
          Aucun magasin pour l’instant.
          <br />
          L’onboarding prend moins de 5 minutes.
        </div>
      )}
      {magasins.map((m) => (
        <div className="card" key={m.id}>
          <h3>{m.nom}</h3>
          <p className="muted" style={{ margin: '2px 0 10px' }}>
            {m.societe}
            {m.enseigne ? ` · ${m.enseigne}` : ''}
            {m.siren ? ` · SIREN ${m.siren}` : ''}
          </p>
          <div className="detail-lignes">
            <div className="ligne">
              <span>CA HT dernier exercice</span>
              <strong>{fmtEUR(m.caHT)}</strong>
            </div>
            <div className="ligne">
              <span>Plafond annuel de dons</span>
              <Amount
                titre="Plafond annuel (par société)"
                lignes={[
                  'max(20 000 € ; 0,5 % × CA HT)',
                  `0,5 % × ${fmtEUR(m.caHT)} = ${fmtEUR(0.005 * m.caHT)}`,
                  `= ${fmtEUR(plafondAnnuel(m.caHT))}`,
                ]}
              >
                <strong>{fmtEUR(plafondAnnuel(m.caHT))}</strong>
              </Amount>
            </div>
            <div className="ligne">
              <span>Marge brute (coefficient de valorisation)</span>
              <Amount
                titre="Coefficient de coût de revient"
                lignes={[
                  `coût de revient = prix de vente × (1 − marge)`,
                  `= PV × (1 − ${fmtPct(m.margePct)}) = PV × ${(1 - m.margePct / 100).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}`,
                ]}
              >
                <strong>{fmtPct(m.margePct)}</strong>
              </Amount>
            </div>
            <div className="ligne">
              <span>Coût de revient moyen F&amp;L</span>
              <strong>{fmtEUR(m.coutKgFL, 2)}/kg</strong>
            </div>
            <div className="ligne">
              <span>Success fee Mana</span>
              <strong>{fmtPct(m.successFeePct, 0)}</strong>
            </div>
            {m.collecteurs.length > 0 && (
              <div className="ligne">
                <span>Collecteur{m.collecteurs.length > 1 ? 's' : ''}</span>
                <span style={{ textAlign: 'right' }}>
                  {m.collecteurs.map((c) => (
                    <span key={c.nom}>
                      <strong>{c.nom}</strong>
                      <br />
                      <small className="muted">{c.jours}</small>
                      <br />
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEdition(m)}>
              Modifier
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (confirm(`Supprimer « ${m.nom} » et toutes ses saisies ?`)) onDelete(m.id)
              }}
            >
              Supprimer
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-primary btn-block" onClick={() => setEdition('nouveau')}>
        + Ajouter un magasin
      </button>
    </div>
  )
}

function FormulaireMagasin({
  initial,
  onSave,
  onCancel,
}: {
  initial: Magasin | null
  onSave: (m: Magasin) => void
  onCancel: () => void
}) {
  const [nom, setNom] = useState(initial?.nom ?? '')
  const [societe, setSociete] = useState(initial?.societe ?? '')
  const [siren, setSiren] = useState(initial?.siren ?? '')
  const [enseigne, setEnseigne] = useState(initial?.enseigne ?? '')
  const [caHT, setCaHT] = useState(initial?.caHT ?? 0)
  const [margePct, setMargePct] = useState(initial?.margePct ?? 30)
  const [coutKgFL, setCoutKgFL] = useState(initial?.coutKgFL ?? 2.2)
  const [successFeePct, setSuccessFeePct] = useState(initial?.successFeePct ?? 25)
  const [collecteurs, setCollecteurs] = useState<Collecteur[]>(
    initial?.collecteurs?.length ? initial.collecteurs : [{ nom: '', contact: '', jours: '' }],
  )

  const valide = nom.trim() && societe.trim() && caHT > 0 && margePct > 0 && margePct < 100

  function enregistrer() {
    if (!valide) return
    const maintenant = new Date().toISOString()
    const versions = [...(initial?.versionsParametres ?? [])]
    const derniere = versions[versions.length - 1]
    if (!derniere) {
      versions.push({ version: 1, date: maintenant, margePct, coutKgFL })
    } else if (derniere.margePct !== margePct || derniere.coutKgFL !== coutKgFL) {
      // Changement de coefficient → nouvelle version de la note de méthode
      versions.push({ version: derniere.version + 1, date: maintenant, margePct, coutKgFL })
    }
    onSave({
      id: initial?.id ?? uid(),
      nom: nom.trim(),
      societe: societe.trim(),
      siren: siren.trim() || undefined,
      enseigne: enseigne.trim() || undefined,
      caHT,
      margePct,
      coutKgFL,
      successFeePct,
      collecteurs: collecteurs.filter((c) => c.nom.trim()),
      creeLe: initial?.creeLe ?? maintenant,
      versionsParametres: versions,
    })
  }

  return (
    <div>
      <h2>{initial ? 'Modifier le magasin' : 'Nouveau magasin'}</h2>
      <div className="card">
        <label className="field">
          <span>Nom du magasin *</span>
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Marché Frais Centre-Ville" />
        </label>
        <label className="field">
          <span>Société *</span>
          <input type="text" value={societe} onChange={(e) => setSociete(e.target.value)} placeholder="Ex. SARL Delmas Distribution" />
          <span className="aide">Le plafond fiscal de dons s’apprécie par société.</span>
        </label>
        <label className="field">
          <span>SIREN (facultatif)</span>
          <input type="text" inputMode="numeric" value={siren} onChange={(e) => setSiren(e.target.value)} placeholder="123 456 789" />
        </label>
        <label className="field">
          <span>Enseigne (facultatif)</span>
          <input type="text" value={enseigne} onChange={(e) => setEnseigne(e.target.value)} placeholder="Ex. Bio&Local" />
        </label>
      </div>

      <div className="card">
        <h3>Paramètres de valorisation</h3>
        <label className="field">
          <span>CA HT du dernier exercice *</span>
          <div className="suffixe">
            <input type="number" inputMode="numeric" min={0} step={10000} value={caHT || ''} onChange={(e) => setCaHT(Number(e.target.value))} />
            <em>€ HT</em>
          </div>
          {caHT > 0 && (
            <span className="aide">
              Plafond annuel de dons calculé : <strong>{fmtEUR(plafondAnnuel(caHT))}</strong> — max(20 000 € ; 0,5 % × CA HT).
            </span>
          )}
        </label>
        <label className="field">
          <span>Marge brute de la liasse fiscale *</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} max={99} step={0.1} value={margePct || ''} onChange={(e) => setMargePct(Number(e.target.value))} />
            <em>%</em>
          </div>
          <span className="aide">
            Coefficient de valorisation : coût de revient = prix de vente × (1 − marge). Règle prudente : caler sur la
            liasse, ou arrondir la marge <strong>au-dessus</strong> (jamais en dessous) — méthode défendable en cas de contrôle.
          </span>
        </label>
        <label className="field">
          <span>Coût de revient moyen F&amp;L</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} step={0.1} value={coutKgFL} onChange={(e) => setCoutKgFL(Number(e.target.value))} />
            <em>€/kg</em>
          </div>
          <span className="aide">Préréglé à 2,20 €/kg. Source : total des achats F&amp;L annuels ÷ tonnage acheté, ou échantillonnage sur 2 semaines.</span>
        </label>
        <label className="field">
          <span>Taux de la réduction d’impôt</span>
          <div className="suffixe">
            <input type="number" value={60} disabled />
            <em>%</em>
          </div>
          <span className="aide">Fixé par l’article 238 bis du CGI — non modifiable.</span>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Success fee Mana</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} max={100} step={1} value={successFeePct} onChange={(e) => setSuccessFeePct(Number(e.target.value))} />
            <em>%</em>
          </div>
          <span className="aide">Part de l’économie d’impôt réellement générée. 0 € d’abonnement : pas d’économie, pas de facture.</span>
        </label>
      </div>

      <div className="card">
        <h3>Collecteur(s) partenaire(s)</h3>
        <p className="muted">Banque Alimentaire, Restos du Cœur, Linkee, Le Chaînon Manquant… Informatif.</p>
        {collecteurs.map((c, i) => (
          <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--trait)' : undefined, paddingTop: i > 0 ? 12 : 0 }}>
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
