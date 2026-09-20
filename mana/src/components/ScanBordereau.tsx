import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Justificatif, Magasin } from '../types'
import { compresserPhoto } from '../lib/fichiers'
import { lireBordereau, televerserBordereau, type LectureBordereau, compteId } from '../lib/cloud'
import { fmtDate, fmtNum } from '../lib/format'
import { uid } from '../lib/storage'

export interface PropositionScan {
  lecture: LectureBordereau
  justificatif: Justificatif
}

const LIBELLES_CONFIANCE: Record<LectureBordereau['confiance'], { texte: string; classe: string }> = {
  haute: { texte: 'lecture sûre', classe: 'badge vert' },
  moyenne: { texte: 'à vérifier', classe: 'badge' },
  basse: { texte: 'lecture incertaine', classe: 'badge alerte' },
}

/**
 * Photo du bordereau signé → lecture automatique → proposition de saisie.
 *
 * Rien n'est enregistré sans le magasin : la lecture s'affiche champ par champ
 * et c'est un clic explicite qui la reporte dans le formulaire. La photo, elle,
 * est archivée d'emblée (elle sert de justificatif quoi qu'il arrive).
 */
export function ScanBordereau({
  magasin,
  session,
  jour,
  onAppliquer,
}: {
  magasin: Magasin
  session: Session | null
  jour: string
  onAppliquer: (p: PropositionScan) => void
}) {
  const [etape, setEtape] = useState<'repos' | 'encours' | 'resultat'>('repos')
  const [message, setMessage] = useState('')
  const [proposition, setProposition] = useState<PropositionScan | null>(null)

  async function traiter(files: FileList | null) {
    const fichier = files?.[0]
    if (!fichier || !session) return
    setEtape('encours')
    setMessage('')
    setProposition(null)
    try {
      const { blob, base64, typeMime } = await compresserPhoto(fichier)
      // La photo est archivée même si la lecture échoue : c'est la pièce justificative.
      const chemin = await televerserBordereau(compteId(session), blob, 'bordereau.jpg')
      const justificatif: Justificatif = {
        id: uid(),
        nom: `Bordereau ${jour}`,
        type: typeMime,
        taille: blob.size,
        chemin,
      }
      const lecture = await lireBordereau(base64, typeMime, {
        magasin: magasin.nom,
        associations: magasin.collecteurs.map((c) => c.nom),
        jour,
      })
      setProposition({ lecture, justificatif })
      setEtape('resultat')
      if (!lecture.estUnBordereau) {
        setMessage('Cette image ne ressemble pas à un bordereau d’enlèvement — la photo est archivée, mais rien n’a pu en être lu.')
      }
    } catch (e) {
      setEtape('repos')
      setMessage((e as Error).message)
    }
  }

  if (!session) {
    return (
      <div className="info-banner">
        <strong>Scanner vos bordereaux.</strong> Connectez-vous pour photographier le bordereau signé : Mana le lit,
        propose la saisie du jour et archive la photo.
      </div>
    )
  }

  const l = proposition?.lecture

  return (
    <div className="card">
      <h3>Scanner le bordereau signé</h3>
      <p className="muted" style={{ margin: '0 0 10px' }}>
        Photographiez le bordereau à la fin du passage : Mana lit les colis, le poids des fruits &amp; légumes et
        l’association, puis vous propose la saisie. Vous validez avant enregistrement.
      </p>

      <label className="btn btn-primary btn-block" style={{ cursor: 'pointer', marginBottom: 8 }}>
        {etape === 'encours' ? 'Lecture en cours…' : '📷 Photographier ou choisir une photo'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={etape === 'encours'}
          onChange={(e) => {
            void traiter(e.target.files)
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />
      </label>

      {message && (
        <p className="muted" style={{ margin: '0 0 8px', color: 'var(--ambre-texte)' }}>
          {message}
        </p>
      )}

      {l && l.estUnBordereau && (
        <div style={{ background: 'var(--sable)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Ce que Mana a lu</strong>
            <span className={LIBELLES_CONFIANCE[l.confiance].classe}>{LIBELLES_CONFIANCE[l.confiance].texte}</span>
          </div>
          <div className="detail-lignes">
            <div className="ligne">
              <span>Date</span>
              <strong>{l.date ? fmtDate(l.date) : '— non lue'}</strong>
            </div>
            <div className="ligne">
              <span>Association</span>
              <strong>{l.association || '— non lue'}</strong>
            </div>
            <div className="ligne">
              <span>Colis remis</span>
              <strong>{l.nbColis > 0 ? l.nbColis : '— non lu'}</strong>
            </div>
            <div className="ligne">
              <span>Fruits &amp; légumes (net)</span>
              <strong>{l.kgFL > 0 ? `${fmtNum(l.kgFL, 1)} kg` : '— non lu'}</strong>
            </div>
            <div className="ligne">
              <span>Signatures</span>
              <strong>{l.signe ? 'présentes' : 'absentes ou illisibles'}</strong>
            </div>
          </div>

          {l.refus && (
            <p style={{ margin: '8px 0 0', fontSize: 13.5 }}>
              <span className="muted">Refus / remarques : </span>
              <strong>{l.refus}</strong>
            </p>
          )}

          {l.doutes.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--encre-2)' }}>
              {l.doutes.map((d) => (
                <li key={d} style={{ marginBottom: 3 }}>
                  {d}
                </li>
              ))}
            </ul>
          )}

          <p className="muted" style={{ margin: '10px 0 0', fontSize: 12.5 }}>
            Le bordereau ne porte pas le montant de démarque : il reste à saisir depuis votre back-office.
          </p>

          <button
            className="btn btn-ambre btn-block"
            style={{ marginTop: 10 }}
            onClick={() => {
              onAppliquer(proposition!)
              setEtape('repos')
              setProposition(null)
              setMessage('Lecture reportée dans le formulaire — vérifiez puis enregistrez.')
            }}
          >
            Reporter dans la saisie
          </button>
        </div>
      )}
    </div>
  )
}
