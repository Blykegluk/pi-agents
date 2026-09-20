import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Justificatif, Magasin } from '../types'
import { compresserPhoto } from '../lib/fichiers'
import { lireBordereau, televerserBordereau, type LectureBordereau, compteId } from '../lib/cloud'
import { fmtNum } from '../lib/format'
import { uid } from '../lib/storage'

export interface BordereauImporte {
  id: string
  fichier: string
  justificatif: Justificatif
  lecture: LectureBordereau | null
  erreur?: string
  /** Champs corrigés par le magasin avant enregistrement. */
  jour: string
  collecteur: string
  colis: number
  kgFL: number
  signe: boolean
  garder: boolean
}

/**
 * Import groupé : plusieurs bordereaux photographiés d'un coup (fin de semaine,
 * fin de mois). Chaque photo est archivée puis lue ; les lectures s'affichent
 * en tableau, corrigeables ligne par ligne, et un seul clic enregistre tout.
 * Une ligne sans date lisible reste bloquée tant que la date n'est pas donnée.
 */
export function ImportBordereaux({
  magasin,
  session,
  onEnregistrer,
}: {
  magasin: Magasin
  session: Session | null
  onEnregistrer: (lignes: BordereauImporte[]) => void
}) {
  const [lignes, setLignes] = useState<BordereauImporte[]>([])
  const [enCours, setEnCours] = useState(0)
  const [message, setMessage] = useState('')
  const [survol, setSurvol] = useState(false)

  async function traiter(files: FileList | File[] | null) {
    if (!files || files.length === 0 || !session) return
    setMessage('')
    const tous = Array.from(files)
    const fichiers = tous.filter((f) => f.type.startsWith('image/'))
    if (fichiers.length < tous.length) {
      setMessage(`${tous.length - fichiers.length} fichier${tous.length - fichiers.length > 1 ? 's' : ''} ignoré${tous.length - fichiers.length > 1 ? 's' : ''} : seules les photos (JPG, PNG, HEIC converti) sont lues.`)
    }
    if (fichiers.length === 0) return
    setEnCours(fichiers.length)
    const nouvelles: BordereauImporte[] = []
    // Lectures en parallèle par paquets de 3 : assez rapide, sans saturer la fonction
    for (let i = 0; i < fichiers.length; i += 3) {
      const paquet = fichiers.slice(i, i + 3)
      const resultats = await Promise.all(
        paquet.map(async (f): Promise<BordereauImporte> => {
          const base = { id: uid(), fichier: f.name, jour: '', collecteur: magasin.collecteurs.length === 1 ? magasin.collecteurs[0].nom : '', colis: 0, kgFL: 0, signe: false, garder: true }
          try {
            const { blob, base64, typeMime } = await compresserPhoto(f)
            const chemin = await televerserBordereau(compteId(session), blob, 'bordereau.jpg')
            const justificatif: Justificatif = { id: uid(), nom: f.name, type: typeMime, taille: blob.size, chemin }
            const lecture = await lireBordereau(base64, typeMime, { magasin: magasin.nom, associations: magasin.collecteurs.map((c) => c.nom) })
            const connue = magasin.collecteurs.find((c) => c.nom.toLowerCase() === lecture.association.toLowerCase())
            return {
              ...base,
              justificatif: { ...justificatif, nom: lecture.date ? `Bordereau ${lecture.date}` : f.name },
              lecture,
              jour: lecture.date,
              collecteur: connue?.nom ?? base.collecteur,
              colis: lecture.nbColis,
              kgFL: lecture.kgFL,
              signe: lecture.signe,
              garder: lecture.estUnBordereau,
            }
          } catch (e) {
            return { ...base, justificatif: { id: uid(), nom: f.name, type: f.type, taille: f.size }, lecture: null, erreur: (e as Error).message, garder: false }
          }
        }),
      )
      nouvelles.push(...resultats)
      setEnCours((n) => Math.max(0, n - paquet.length))
    }
    setLignes((l) => [...l, ...nouvelles])
  }

  const maj = (id: string, patch: Partial<BordereauImporte>) => setLignes((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const pretes = lignes.filter((l) => l.garder && l.jour && (!(magasin.collecteurs.length >= 2) || l.collecteur))
  const bloquees = lignes.filter((l) => l.garder && (!l.jour || (magasin.collecteurs.length >= 2 && !l.collecteur)))

  const actif = !!session && enCours === 0

  return (
    <div className="card">
      <h3>Smart upload — vos bordereaux</h3>
      <p className="muted" style={{ margin: '0 0 10px' }}>
        Glissez ici un ou plusieurs bordereaux photographiés (une journée, une semaine, un mois) : chaque photo est
        archivée puis lue, vous corrigez ce qui doit l’être, un seul clic enregistre tout.
      </p>
      <label
        className={`zone-depot ${survol ? 'survol' : ''} ${actif ? '' : 'inactive'}`}
        onDragOver={(e) => { e.preventDefault(); if (actif) setSurvol(true) }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); if (actif) void traiter(e.dataTransfer.files) }}
      >
        <input type="file" accept="image/*" multiple disabled={!actif} onChange={(e) => { void traiter(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
        <span className="zone-depot-icone" aria-hidden="true">📷</span>
        {!session ? (
          <>
            <strong>Connectez-vous pour déposer vos bordereaux</strong>
            <span className="muted">Les photos sont archivées sur votre compte : c’est la preuve de chaque passage.</span>
          </>
        ) : enCours > 0 ? (
          <>
            <strong>Lecture en cours… {enCours} restant{enCours > 1 ? 's' : ''}</strong>
            <span className="muted">Chaque bordereau est archivé puis lu par Mana.</span>
          </>
        ) : (
          <>
            <strong>Glissez vos bordereaux ici, ou cliquez pour les choisir</strong>
            <span className="muted">Un ou plusieurs à la fois · JPG, PNG · depuis le téléphone, prenez la photo directement.</span>
          </>
        )}
      </label>
      {message && <p className="muted" style={{ color: 'var(--vert)', marginTop: 8 }}>{message}</p>}

      {lignes.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Date</th>
                {magasin.collecteurs.length >= 2 && <th>Association</th>}
                <th className="num">Colis</th>
                <th className="num">F&amp;L (kg)</th>
                <th>Signé</th>
                <th>Lecture</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} style={{ opacity: l.garder ? 1 : 0.5 }}>
                  <td><input type="checkbox" checked={l.garder} onChange={(e) => maj(l.id, { garder: e.target.checked })} /></td>
                  <td><input type="date" value={l.jour} onChange={(e) => maj(l.id, { jour: e.target.value })} style={{ minWidth: 140, padding: 6 }} /></td>
                  {magasin.collecteurs.length >= 2 && (
                    <td>
                      <select value={l.collecteur} onChange={(e) => maj(l.id, { collecteur: e.target.value })} style={{ padding: 6 }}>
                        <option value="">— choisir —</option>
                        {magasin.collecteurs.map((c) => <option key={c.nom} value={c.nom}>{c.nom}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="num"><input type="number" min={0} step={1} value={l.colis || ''} onChange={(e) => maj(l.id, { colis: Number(e.target.value) || 0 })} style={{ width: 70, padding: 6, textAlign: 'right' }} /></td>
                  <td className="num"><input type="number" min={0} step={0.5} value={l.kgFL || ''} onChange={(e) => maj(l.id, { kgFL: Number(e.target.value) || 0 })} style={{ width: 80, padding: 6, textAlign: 'right' }} /></td>
                  <td><input type="checkbox" checked={l.signe} onChange={(e) => maj(l.id, { signe: e.target.checked })} /></td>
                  <td style={{ fontSize: 12.5, maxWidth: 260 }}>
                    {l.erreur ? <span style={{ color: 'var(--rouge)' }}>{l.erreur}</span>
                      : !l.lecture?.estUnBordereau ? <span className="badge alerte">pas un bordereau</span>
                      : <>
                          <span className={l.lecture.confiance === 'haute' ? 'badge vert' : l.lecture.confiance === 'moyenne' ? 'badge' : 'badge alerte'}>
                            {l.lecture.confiance === 'haute' ? 'sûre' : l.lecture.confiance === 'moyenne' ? 'à vérifier' : 'incertaine'}
                          </span>
                          {l.lecture.doutes.length > 0 && <span className="muted"> {l.lecture.doutes.join(' · ')}</span>}
                        </>}
                    <div className="muted" style={{ fontSize: 11.5 }}>{l.fichier}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lignes.length > 0 && (
        <>
          {bloquees.length > 0 && (
            <p className="muted" style={{ color: 'var(--ambre-texte)', marginTop: 8 }}>
              {bloquees.length} ligne{bloquees.length > 1 ? 's' : ''} sans date{magasin.collecteurs.length >= 2 ? ' ou sans association' : ''} : complétez-la{bloquees.length > 1 ? ' ou décochez-les' : ' ou décochez-la'}.
            </p>
          )}
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, opacity: pretes.length > 0 && bloquees.length === 0 ? 1 : 0.5 }}
              disabled={pretes.length === 0 || bloquees.length > 0}
              onClick={() => {
                onEnregistrer(pretes)
                setLignes([])
                setMessage(`${pretes.length} bordereau${pretes.length > 1 ? 'x' : ''} enregistré${pretes.length > 1 ? 's' : ''} au registre — ${fmtNum(pretes.reduce((t, l) => t + l.kgFL, 0), 1)} kg de F&L, ${pretes.reduce((t, l) => t + l.colis, 0)} colis.`)
              }}
            >
              Enregistrer {pretes.length} bordereau{pretes.length > 1 ? 'x' : ''}
            </button>
            <button className="btn btn-ghost" onClick={() => setLignes([])}>Annuler</button>
          </div>
        </>
      )}
    </div>
  )
}
