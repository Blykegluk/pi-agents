import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AnalyseAssociation, Collecteur, Justificatif, Magasin, Societe } from '../types'
import { FREQUENCES, PLAGES } from '../lib/annuaire'
import { analyserAssociation, telechargerPieces, televerserDocumentAssociation, compteId } from '../lib/cloud'
import { compresserPhoto } from '../lib/fichiers'
import { eligibiliteDepuisVerdict, LIBELLES_VERDICT, verdictDepuisCriteres } from '../lib/eligibilite'
import { pdfConventionDon, pdfDemandeRescrit } from '../lib/pdf'
import { fmtDate } from '../lib/format'
import { uid } from '../lib/storage'
import { Pieces } from './Pieces'

const TAILLE_MAX_PIECE = 6 * 1024 * 1024

/** Un fichier → base64 (les photos sont compressées, les PDF passent tels quels). */
async function encoder(f: File): Promise<{ base64: string; typeMime: string; blob: Blob }> {
  if (f.type.startsWith('image/')) {
    const { blob, base64, typeMime } = await compresserPhoto(f, 2000, 0.8)
    return { base64, typeMime, blob }
  }
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
  return { base64, typeMime: f.type || 'application/pdf', blob: f }
}

export const COLLECTEUR_VIDE: Collecteur = { nom: '', contact: '', telephone: '', email: '', frequence: '', frequenceAutre: '', plage: '', plageAutre: '', jours: '' }

export const LIBELLES_ELIGIBILITE: Record<NonNullable<Collecteur['eligibilite']>, { texte: string; classe: string; aide: string }> = {
  inconnue: { texte: 'éligibilité non vérifiée', classe: 'badge alerte', aide: 'Aucune pièce réunie : le reçu fiscal de fin d’année repose sur la seule parole de l’association.' },
  a_verifier: { texte: 'pièces réunies, à confirmer', classe: 'badge', aide: 'Statuts et récépissé en main. Demandez-lui le rescrit mécénat (article L. 80 C du LPF) pour sécuriser le reçu.' },
  rescrit: { texte: 'rescrit positif', classe: 'badge vert', aide: 'L’administration a confirmé par écrit que l’association peut délivrer des reçus fiscaux. C’est la situation la plus sûre.' },
  reseau_national: { texte: 'réseau national', classe: 'badge vert', aide: 'Banque Alimentaire, Restos du Cœur, Secours populaire, Croix-Rouge… : éligibilité notoire, pas de rescrit à demander.' },
}

const TYPES_DOCUMENT = ['Statuts', 'Récépissé de déclaration (préfecture)', 'Rescrit mécénat', 'Convention de don', 'Habilitation aide alimentaire', 'Autre']

const LIBELLES_TYPE_DOC: Record<string, string> = {
  statuts: 'Statuts',
  recepisse: 'Récépissé de déclaration',
  journal_officiel: 'Journal officiel',
  rescrit: 'Rescrit mécénat',
  habilitation: 'Habilitation aide alimentaire',
  convention: 'Convention de don',
  attestation: 'Attestation',
  recu_fiscal: 'Reçu fiscal',
  autre: 'Autre pièce',
}

const LIBELLES_CRITERES: Record<string, string> = {
  declarationPrefecture: 'Déclarée en préfecture',
  gestionDesinteressee: 'Gestion désintéressée',
  activiteNonLucrative: 'Activité non lucrative',
  cercleRestreint: 'Cercle restreint',
  devolutionBoni: 'Dévolution de l’actif',
  objetEligible: 'Objet social ou d’aide alimentaire',
  rescritPositif: 'Rescrit mécénat',
  habilitationAideAlimentaire: 'Habilitation aide alimentaire',
  reseauNational: 'Réseau national',
  gratuiteBeneficiaires: 'Gratuité pour les bénéficiaires',
}

/**
 * Fiche d'une association collectrice — un seul formulaire, utilisé à la
 * création du magasin comme dans l'assistant de collecte, pour que les
 * coordonnées saisies une fois n'aient jamais à être ressaisies.
 * Seul le nom est obligatoire : le reste se complète au fil des échanges.
 *
 * Le bloc « Éligibilité » n'est pas décoratif : le reçu fiscal de fin d'année
 * n'a de valeur que si l'association est d'intérêt général au sens de
 * l'article 238 bis. Les pièces s'archivent ici (compte connecté).
 */
export function CollecteurForm({
  valeur,
  onChange,
  onSupprimer,
  session,
  magasin,
  societe,
}: {
  valeur: Collecteur
  onChange: (c: Collecteur) => void
  onSupprimer?: () => void
  session?: Session | null
  magasin?: Magasin
  societe?: Societe
}) {
  const maj = (champ: keyof Collecteur, v: string) => onChange({ ...valeur, [champ]: v })
  const [etape, setEtape] = useState<'repos' | 'envoi' | 'analyse'>('repos')
  const [survol, setSurvol] = useState(false)
  const [message, setMessage] = useState('')
  const eligibilite = valeur.eligibilite ?? 'inconnue'
  const analyse = valeur.analyse

  /**
   * Smart upload : les pièces sont archivées, puis TOUTES les pièces de
   * l'association (anciennes comprises) partent à l'analyse. Le verdict est
   * calculé ici par la règle fixe, à partir des critères lus.
   */
  async function deposer(files: FileList | File[] | null) {
    if (!files || !session) return
    const fichiers = Array.from(files).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf')
    if (fichiers.length === 0) {
      setMessage('Seules les photos (JPG, PNG) et les PDF sont lus.')
      return
    }
    setMessage('')
    setEtape('envoi')
    const nouveaux: Justificatif[] = []
    const aAnalyser: { fichier: string; typeMime: string; nom: string }[] = []
    for (const f of fichiers) {
      if (f.size > TAILLE_MAX_PIECE) {
        setMessage(`${f.name} dépasse 6 Mo : réduisez-le ou photographiez les pages.`)
        continue
      }
      try {
        const { base64, typeMime, blob } = await encoder(f)
        const chemin = await televerserDocumentAssociation(compteId(session), blob, f.name)
        nouveaux.push({ id: uid(), nom: f.name, type: typeMime, taille: blob.size, chemin })
        aAnalyser.push({ fichier: base64, typeMime, nom: f.name })
      } catch (e) {
        setMessage(`${f.name} : ${(e as Error).message}`)
      }
    }
    const documents = [...(valeur.documents ?? []), ...nouveaux]
    onChange({ ...valeur, documents })
    if (aAnalyser.length === 0) {
      setEtape('repos')
      return
    }
    setEtape('analyse')
    try {
      // Les pièces déjà archivées rejoignent l'analyse : le verdict porte sur l'ensemble.
      const anciennes = (valeur.documents ?? []).map((d) => d.chemin).filter((c): c is string => Boolean(c))
      const rapatriees = await telechargerPieces(anciennes)
      const paires: { ref: Justificatif; doc: { fichier: string; typeMime: string; nom: string } }[] = [
        ...rapatriees.flatMap((r) => {
          const ref = valeur.documents?.find((d) => d.chemin === r.chemin)
          return ref ? [{ ref, doc: { fichier: r.base64, typeMime: r.typeMime, nom: ref.nom } }] : []
        }),
        ...nouveaux.map((ref, i) => ({ ref, doc: aAnalyser[i] })),
      ].filter((p) => p.doc.typeMime.startsWith('image/') || p.doc.typeMime === 'application/pdf')
      const brute = await analyserAssociation(paires.map((p) => p.doc), { nomAssociation: valeur.nom, magasin: magasin?.nom })
      const regle = verdictDepuisCriteres(brute.criteres)
      const complete: AnalyseAssociation = {
        ...brute,
        le: new Date().toISOString(),
        verdict: regle.verdict,
        motifs: [...regle.motifs, ...brute.motifs],
        actions: regle.actions,
      }
      // La nature reconnue (statuts, récépissé…) nomme mieux la pièce que son nom de fichier
      const nommes = documents.map((d) => {
        const i = paires.findIndex((p) => p.ref.id === d.id)
        const lu = i >= 0 ? complete.documents[i] : undefined
        const libelle = lu ? LIBELLES_TYPE_DOC[lu.type] ?? lu.type : undefined
        return libelle && !d.nom.startsWith(libelle) ? { ...d, nom: `${libelle} — ${d.nom.replace(/^.+? — /, '')}` } : d
      })
      onChange({
        ...valeur,
        documents: nommes,
        analyse: complete,
        eligibilite: eligibiliteDepuisVerdict(complete),
        nom: valeur.nom || complete.association.nom,
        rna: valeur.rna || complete.association.rna || undefined,
        siren: valeur.siren || complete.association.siren || undefined,
      })
    } catch (e) {
      setMessage(`Pièces archivées, mais analyse impossible : ${(e as Error).message}`)
    } finally {
      setEtape('repos')
    }
  }

  const actif = !!session && etape === 'repos'

  return (
    <div className="collecteur-form">
      <label className="field">
        <span>Nom de l’association *</span>
        <input type="text" value={valeur.nom} onChange={(e) => maj('nom', e.target.value)} placeholder="Ex. Les Restos du Cœur — Paris" />
      </label>

      <div className="colonnes-2">
        <label className="field">
          <span>Référent (facultatif)</span>
          <input type="text" value={valeur.contact} onChange={(e) => maj('contact', e.target.value)} placeholder="Ex. M. Dubreuil" />
        </label>
        <label className="field">
          <span>Téléphone (facultatif)</span>
          <input type="tel" inputMode="tel" value={valeur.telephone ?? ''} onChange={(e) => maj('telephone', e.target.value)} placeholder="Ex. 01 45 22 18 40" />
        </label>
        <label className="field">
          <span>E-mail de l’association *</span>
          <input type="email" inputMode="email" value={valeur.email ?? ''} onChange={(e) => maj('email', e.target.value)} placeholder="Ex. contact@association.org" />
          <span className="aide">Mana s’en sert pour le suivi de la collecte : justificatifs, relances, changement d’association.</span>
        </label>
        <label className="field">
          <span>N° RNA ou SIREN (facultatif — repris sur le reçu fiscal)</span>
          <input type="text" value={valeur.rna ?? valeur.siren ?? ''} onChange={(e) => onChange({ ...valeur, rna: e.target.value.trim().toUpperCase().startsWith('W') ? e.target.value.trim() : '', siren: /^\d/.test(e.target.value.trim()) ? e.target.value.trim() : '' })} placeholder="Ex. W931030100 ou 995298452" />
        </label>
      </div>

      <label className="field">
        <span>Fréquence de passage</span>
        <div className="chips" style={{ marginBottom: 0 }}>
          {FREQUENCES.map((f) => (
            <button key={f} type="button" className={`chip ${valeur.frequence === f ? 'active' : ''}`} onClick={() => maj('frequence', valeur.frequence === f ? '' : f)}>
              {f === 'Autre' ? 'Autre (préciser)' : f}
            </button>
          ))}
        </div>
        {valeur.frequence === 'Autre' && (
          <input type="text" style={{ marginTop: 8 }} value={valeur.frequenceAutre ?? ''} onChange={(e) => maj('frequenceAutre', e.target.value)} placeholder="Ex. tous les 15 jours, ou à la demande" />
        )}
      </label>

      <label className="field">
        <span>Créneau de passage</span>
        <div className="chips" style={{ marginBottom: 0 }}>
          {PLAGES.map((p) => (
            <button key={p} type="button" className={`chip ${valeur.plage === p ? 'active' : ''}`} onClick={() => maj('plage', valeur.plage === p ? '' : p)}>
              {p === 'Autre' ? 'Autre (préciser)' : p}
            </button>
          ))}
        </div>
        {valeur.plage === 'Autre' && (
          <input type="text" style={{ marginTop: 8 }} value={valeur.plageAutre ?? ''} onChange={(e) => maj('plageAutre', e.target.value)} placeholder="Ex. entre 14 h et 15 h, ou à la fermeture" />
        )}
      </label>

      <label className="field">
        <span>Jours de passage (facultatif)</span>
        <input type="text" value={valeur.jours} onChange={(e) => maj('jours', e.target.value)} placeholder="Ex. du lundi au samedi, sauf jours fériés" />
      </label>

      {/* ---- Éligibilité au reçu fiscal & documents ---- */}
      <div style={{ background: 'var(--sable)', borderRadius: 10, padding: '12px 14px', marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Éligibilité au reçu fiscal (article 238 bis)</strong>
          <span className={LIBELLES_ELIGIBILITE[eligibilite].classe}>{LIBELLES_ELIGIBILITE[eligibilite].texte}</span>
        </div>
        <p className="muted" style={{ margin: '6px 0 8px', fontSize: 13 }}>
          Le reçu de fin d’année ne vaut que si l’association est d’intérêt général : gestion désintéressée, activité
          non lucrative, public ouvert. Réunissez ses pièces ici — c’est ce qu’on vous demandera en cas de contrôle.
        </p>
        <div className="chips" style={{ marginBottom: 8 }}>
          {(Object.keys(LIBELLES_ELIGIBILITE) as NonNullable<Collecteur['eligibilite']>[]).map((k) => (
            <button key={k} type="button" className={`chip ${eligibilite === k ? 'active' : ''}`} onClick={() => onChange({ ...valeur, eligibilite: k })}>
              {LIBELLES_ELIGIBILITE[k].texte}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>{LIBELLES_ELIGIBILITE[eligibilite].aide}</p>

        {/* ---- Smart upload des pièces ---- */}
        <label
          className={`zone-depot ${survol ? 'survol' : ''} ${actif ? '' : 'inactive'}`}
          style={{ padding: '18px 14px' }}
          onDragOver={(e) => { e.preventDefault(); if (actif) setSurvol(true) }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => { e.preventDefault(); setSurvol(false); if (actif) void deposer(e.dataTransfer.files) }}
        >
          <input type="file" accept="image/*,application/pdf" multiple disabled={!actif} onChange={(e) => { void deposer(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
          <span className="zone-depot-icone" aria-hidden="true">📄</span>
          {!session ? (
            <>
              <strong>Connectez-vous pour déposer les pièces de l’association</strong>
              <span className="muted">Statuts, récépissé, rescrit, habilitation, convention… Mana les archive et les analyse.</span>
            </>
          ) : etape === 'envoi' ? (
            <strong>Archivage des pièces…</strong>
          ) : etape === 'analyse' ? (
            <>
              <strong>Analyse en cours…</strong>
              <span className="muted">Mana lit les pièces et vérifie les critères de l’article 238 bis (30 s à 1 min).</span>
            </>
          ) : (
            <>
              <strong>Glissez ici les pièces de l’association, ou cliquez</strong>
              <span className="muted">
                {TYPES_DOCUMENT.slice(0, 5).join(', ').toLowerCase()} · photos ou PDF, plusieurs à la fois. Mana dit si le reçu fiscal tiendra, et quoi faire sinon.
              </span>
            </>
          )}
        </label>
        {message && <p className="muted" style={{ margin: '8px 0 0', color: 'var(--rouge)' }}>{message}</p>}

        {(valeur.documents?.length ?? 0) > 0 && (
          <div style={{ marginTop: 10 }}>
            <Pieces justificatifs={valeur.documents ?? []} onChange={(liste) => onChange({ ...valeur, documents: liste })} compact />
          </div>
        )}

        {/* ---- Verdict ---- */}
        {analyse && (
          <div className={`verdict verdict-${LIBELLES_VERDICT[analyse.verdict].classe}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 15 }}>{LIBELLES_VERDICT[analyse.verdict].titre}</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                analyse du {fmtDate(analyse.le.slice(0, 10))} · {analyse.documents.length} pièce{analyse.documents.length > 1 ? 's' : ''} · lecture {analyse.confiance === 'haute' ? 'sûre' : analyse.confiance === 'moyenne' ? 'à vérifier' : 'incertaine'}
              </span>
            </div>
            <p style={{ margin: '6px 0 10px', fontSize: 13.5 }}>{LIBELLES_VERDICT[analyse.verdict].explication}</p>

            <div className="verdict-criteres">
              {(Object.keys(LIBELLES_CRITERES) as (keyof typeof analyse.criteres)[]).map((k) => {
                const v = analyse.criteres[k]
                if (typeof v !== 'string' || v === 'inconnu') return null
                // Le cercle restreint est le seul critère où « oui » est mauvais
                const bon = k === 'cercleRestreint' ? v === 'non' : v === 'oui'
                return (
                  <span key={k} className={`badge ${bon ? 'vert' : 'alerte'}`}>
                    {bon ? '✓' : '✗'} {LIBELLES_CRITERES[k]}{k === 'rescritPositif' && analyse.criteres.dateRescrit ? ` (${fmtDate(analyse.criteres.dateRescrit)})` : ''}
                  </span>
                )
              })}
            </div>

            {analyse.motifs.length > 0 && (
              <>
                <div className="verdict-titre">Ce que les pièces établissent</div>
                <ul>{analyse.motifs.map((m) => <li key={m}>{m}</li>)}</ul>
              </>
            )}
            {analyse.doutes.length > 0 && (
              <>
                <div className="verdict-titre">Ce qui manque ou reste flou</div>
                <ul>{analyse.doutes.map((m) => <li key={m}>{m}</li>)}</ul>
              </>
            )}
            {analyse.actions.length > 0 && (
              <>
                <div className="verdict-titre">Ce que Mana propose</div>
                <ol>{analyse.actions.map((m) => <li key={m}>{m}</li>)}</ol>
              </>
            )}
            {analyse.verdict !== 'refus' && (
              <div className="row-actions" style={{ marginTop: 10 }}>
                {analyse.verdict === 'a_securiser' && (
                  <button className="btn btn-primary btn-sm" onClick={() => void pdfDemandeRescrit(valeur, societe)}>
                    ⬇ Demande de rescrit préremplie
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => void pdfConventionDon(valeur, societe, magasin)}>
                  ⬇ Convention de don à faire signer
                </button>
              </div>
            )}
            {analyse.documents.some((d) => !d.lisible) && (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
                Une pièce au moins est illisible ou hors sujet : {analyse.documents.filter((d) => !d.lisible).map((d) => d.resume).join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>

      {onSupprimer && (
        <button className="btn btn-danger btn-sm" style={{ marginTop: 10 }} onClick={onSupprimer}>
          Retirer cette association
        </button>
      )}
    </div>
  )
}
