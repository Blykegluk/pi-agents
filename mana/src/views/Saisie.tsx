import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState, Justificatif, Saisie } from '../types'
import { coutEmballes, coutFL } from '../lib/calc'
import { fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { addWeeks, compareWeekIds, currentWeekId, isoWeekOf, weekId, weekLabel } from '../lib/iso'
import { libelleMois, moisDeLaSemaine } from '../lib/facturation'
import { repartirReleve, semainesDuMois } from '../lib/releves'
import { Amount } from '../components/Formula'
import { IconSaisie } from '../components/Icons'
import { ScanBordereau, type PropositionScan } from '../components/ScanBordereau'
import { uid } from '../lib/storage'
import { compresserPhoto, lireFichiers } from '../lib/fichiers'
import { televerserBordereau } from '../lib/cloud'
import { aggParSociete, baseDeLaSaisie } from '../lib/selectors'

// --- Dates locales (AAAA-MM-JJ) ---
const pad2 = (n: number) => String(n).padStart(2, '0')
const dateDuJour = (id: string) => {
  const [y, m, d] = id.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const jourAujourdhui = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const addJours = (id: string, n: number) => {
  const [y, m, d] = id.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}
const labelJour = (id: string) => dateDuJour(id).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const semaineDuJour = (id: string) => {
  const { year, week } = isoWeekOf(dateDuJour(id))
  return weekId(year, week)
}
const moisCourant = () => jourAujourdhui().slice(0, 7)
const addMois = (mois: string, n: number) => {
  const [y, m] = mois.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/**
 * Saisie — deux objets distincts, additionnés par semaine :
 *
 *  1. Le BORDEREAU DU JOUR : un par passage de l'association (colis, poids des
 *     F&L, photo signée). C'est la preuve en cas de contrôle — archivée dans le
 *     compte, jamais valorisée en euros par elle-même.
 *  2. Le RELEVÉ DE DÉMARQUE : le montant en euros lu dans l'export du
 *     back-office, une fois par semaine ou par mois. Réparti sur les semaines
 *     (et les associations) au prorata des bordereaux.
 *
 * Le calcul fiscal reste hebdomadaire : coût des emballés (relevé) + coût des
 * F&L (bordereaux). Un magasin qui ne tient pas de bordereau quotidien saisit
 * son poids de F&L directement dans le relevé de la semaine.
 */
export function SaisieView({
  state,
  exercice,
  session,
  onSave,
  onSaveReleve,
  onDelete,
  onAllerCollecte,
}: {
  state: AppState
  exercice: number
  session: Session | null
  onSave: (s: Saisie) => void
  onSaveReleve: (magasinId: string, periode: { semaine?: string; mois?: string }, nouvelles: Saisie[]) => void
  onDelete: (id: string) => void
  onAllerCollecte: () => void
}) {
  const magasins = state.magasins
  const [magasinId, setMagasinId] = useState(magasins[0]?.id ?? '')
  const magasin = magasins.find((m) => m.id === magasinId) ?? magasins[0]
  const societe = state.societes.find((s) => s.id === magasin?.societeId)
  const agg = useMemo(
    () => (societe ? aggParSociete(state, exercice).find((a) => a.societe.id === societe.id) : undefined),
    [state, societe, exercice],
  )

  // ---- Bordereau du jour ----
  const [jour, setJour] = useState(jourAujourdhui())
  const [colis, setColis] = useState('')
  const [kg, setKg] = useState('')
  const [collecteur, setCollecteur] = useState('')
  const [signe, setSigne] = useState(false)
  const [noteJour, setNoteJour] = useState('')
  const [justificatifs, setJustificatifs] = useState<Justificatif[]>([])
  const [confirmationJour, setConfirmationJour] = useState(false)

  // ---- Relevé de démarque ----
  const [periode, setPeriode] = useState<'semaine' | 'mois'>('semaine')
  const [semaine, setSemaine] = useState(addWeeks(currentWeekId(), -1))
  const [mois, setMois] = useState(addMois(moisCourant(), -1))
  const [montant, setMontant] = useState('')
  const [kgSemaine, setKgSemaine] = useState('')
  const [flInclus, setFlInclus] = useState(false)
  const [confirmationReleve, setConfirmationReleve] = useState(false)

  // ---- Correction (dons refusés) ----
  const [modeCorrection, setModeCorrection] = useState(false)
  const [corrPv, setCorrPv] = useState('')
  const [corrKg, setCorrKg] = useState('')
  const [corrNote, setCorrNote] = useState('')
  const [corrPj, setCorrPj] = useState<Justificatif[]>([])

  const semaineDuBordereau = semaineDuJour(jour)
  const semaineRecap = periode === 'mois' ? semaineDuBordereau : semaine

  const bordereauExistant = useMemo(
    () => state.saisies.find((s) => s.magasinId === magasin?.id && s.jour === jour && s.type === 'don' && s.origine !== 'releve'),
    [state.saisies, magasin, jour],
  )
  const bordereauxDeLaSemaine = useMemo(
    () =>
      state.saisies
        .filter((s) => s.magasinId === magasin?.id && s.semaine === semaineRecap && s.type === 'don' && s.jour)
        .sort((a, b) => (a.jour ?? '').localeCompare(b.jour ?? '')),
    [state.saisies, magasin, semaineRecap],
  )
  const relevesDeLaSemaine = useMemo(
    () => state.saisies.filter((s) => s.magasinId === magasin?.id && s.semaine === semaineRecap && s.type === 'don' && !s.jour),
    [state.saisies, magasin, semaineRecap],
  )
  const corrections = useMemo(
    () =>
      state.saisies
        .filter((s) => s.magasinId === magasin?.id && s.semaine === semaineRecap && s.type === 'correction')
        .sort((a, b) => a.horodatage.localeCompare(b.horodatage)),
    [state.saisies, magasin, semaineRecap],
  )
  const releveExistant = useMemo(() => {
    if (!magasin) return undefined
    return periode === 'mois'
      ? state.saisies.filter((s) => s.magasinId === magasin.id && s.origine === 'releve' && s.releveMois === mois)
      : state.saisies.filter((s) => s.magasinId === magasin.id && s.origine === 'releve' && s.semaine === semaine && !s.releveMois)
  }, [state.saisies, magasin, periode, semaine, mois])
  const bordereauxDeLaSemaineReleve = useMemo(
    () => state.saisies.filter((s) => s.magasinId === magasin?.id && s.semaine === semaine && s.type === 'don' && s.jour),
    [state.saisies, magasin, semaine],
  )

  // Recharge le bordereau quand on change de jour / de magasin
  useEffect(() => {
    setColis(bordereauExistant?.colis ? String(bordereauExistant.colis) : '')
    setKg(bordereauExistant?.kgFL ? String(bordereauExistant.kgFL) : '')
    setCollecteur(bordereauExistant?.collecteur ?? (magasin?.collecteurs.length === 1 ? magasin.collecteurs[0].nom : ''))
    setSigne(bordereauExistant?.signe ?? false)
    setNoteJour(bordereauExistant?.note ?? '')
    setJustificatifs(bordereauExistant?.justificatifs ?? [])
    setConfirmationJour(false)
  }, [bordereauExistant, magasinId, jour, magasin])

  // Recharge le relevé quand on change de période
  useEffect(() => {
    const total = (releveExistant ?? []).reduce((t, s) => t + s.pvEmballes, 0)
    setMontant(total > 0 ? String(Math.round(total * 100) / 100) : '')
    const kgs = (releveExistant ?? []).reduce((t, s) => t + s.kgFL, 0)
    setKgSemaine(kgs > 0 ? String(kgs) : '')
    setFlInclus(releveExistant?.some((s) => s.flInclus) ?? magasin?.modeFL === 'inclus')
    setConfirmationReleve(false)
  }, [releveExistant, magasin])

  if (!magasin || !societe) {
    return (
      <div className="card empty">
        <span className="ico">
          <IconSaisie />
        </span>
        Créez d’abord une société et un magasin dans l’onglet « Magasins » pour commencer la saisie.
      </div>
    )
  }

  const plusieursCollecteurs = magasin.collecteurs.length >= 2
  const colisNum = Number(colis) || 0
  const kgNum = flInclus ? 0 : Number(kg) || 0
  const bordereauValide = (colisNum > 0 || kgNum > 0 || justificatifs.length > 0) && !(plusieursCollecteurs && !collecteur)

  const montantNum = Number(montant) || 0
  const kgSemaineNum = Number(kgSemaine) || 0
  const releveValide = montantNum > 0 || kgSemaineNum > 0

  const semainePasseeCorr = compareWeekIds(semaineRecap, currentWeekId()) < 0
  const corrPvNum = Number(corrPv) || 0
  const corrKgNum = Number(corrKg) || 0
  const correctionValide = semainePasseeCorr && (corrPvNum < 0 || corrKgNum < 0) && corrPvNum <= 0 && corrKgNum <= 0 && corrPj.length > 0

  // ---- Récap de la semaine ----
  const pvSemaine = [...bordereauxDeLaSemaine, ...relevesDeLaSemaine].reduce((t, s) => t + s.pvEmballes, 0)
  const kgTotalSemaine = [...bordereauxDeLaSemaine, ...relevesDeLaSemaine].reduce((t, s) => t + s.kgFL, 0)
  const colisSemaine = bordereauxDeLaSemaine.reduce((t, s) => t + (s.colis ?? 0), 0)
  const cEmbSemaine = coutEmballes(pvSemaine, societe.margePct)
  const cFLSemaine = coutFL(kgTotalSemaine, magasin.coutKgFL)
  const baseSemaineTotale = [...bordereauxDeLaSemaine, ...relevesDeLaSemaine, ...corrections].reduce((t, s) => t + baseDeLaSaisie(s), 0)

  /** Une photo de bordereau est une pièce justificative : en base (bucket) dès qu'on est connecté. */
  async function ajouterPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    if (!session) {
      const locaux = await lireFichiers(files)
      setJustificatifs((p) => [...p, ...locaux])
      return
    }
    const nouveaux: Justificatif[] = []
    for (const f of Array.from(files)) {
      if (f.type.startsWith('image/')) {
        const { blob, typeMime } = await compresserPhoto(f)
        const chemin = await televerserBordereau(session.user.id, blob, 'bordereau.jpg')
        nouveaux.push({ id: uid(), nom: `Bordereau ${jour}`, type: typeMime, taille: blob.size, chemin })
      } else {
        const chemin = await televerserBordereau(session.user.id, f, f.name)
        nouveaux.push({ id: uid(), nom: f.name, type: f.type, taille: f.size, chemin })
      }
    }
    setJustificatifs((p) => [...p, ...nouveaux])
  }

  function appliquerScan({ lecture, justificatif }: PropositionScan) {
    if (lecture.nbColis > 0) setColis(String(lecture.nbColis))
    if (lecture.kgFL > 0 && !flInclus) setKg(String(lecture.kgFL))
    if (lecture.association) {
      const connue = magasin?.collecteurs.find((c) => c.nom.toLowerCase() === lecture.association.toLowerCase())
      if (connue) setCollecteur(connue.nom)
    }
    setSigne(lecture.signe)
    const morceaux = [lecture.nomCollecteur ? `collecteur : ${lecture.nomCollecteur}` : '', lecture.refus ? `refus : ${lecture.refus}` : ''].filter(Boolean)
    if (morceaux.length) setNoteJour((n) => (n ? `${n} · ${morceaux.join(', ')}` : morceaux.join(', ')))
    setJustificatifs((prev) => [...prev, justificatif])
  }

  function enregistrerBordereau() {
    if (!bordereauValide || !magasin || !societe) return
    onSave({
      id: bordereauExistant?.id ?? uid(),
      magasinId: magasin.id,
      semaine: semaineDuBordereau,
      jour,
      type: 'don',
      origine: 'bordereau',
      pvEmballes: 0,
      kgFL: kgNum,
      flInclus: flInclus || undefined,
      colis: colisNum || undefined,
      signe,
      collecteur: collecteur || undefined,
      note: noteJour.trim() || undefined,
      justificatifs,
      horodatage: new Date().toISOString(),
      margePctAppliquee: societe.margePct,
      coutKgFLApplique: magasin.coutKgFL,
    })
    setConfirmationJour(true)
    setTimeout(() => setConfirmationJour(false), 2500)
  }

  function enregistrerReleve() {
    if (!releveValide || !magasin || !societe) return
    const horodatage = new Date().toISOString()
    const commun = {
      magasinId: magasin.id,
      type: 'don' as const,
      origine: 'releve' as const,
      justificatifs: [] as Justificatif[],
      horodatage,
      margePctAppliquee: societe.margePct,
      coutKgFLApplique: magasin.coutKgFL,
      flInclus: flInclus || undefined,
    }
    const noms = magasin.collecteurs.map((c) => c.nom)
    if (periode === 'mois') {
      const semaines = semainesDuMois(mois)
      const bordereaux = state.saisies
        .filter((s) => s.magasinId === magasin.id && s.type === 'don' && s.jour && semaines.includes(s.semaine))
        .map((s) => ({ semaine: s.semaine, collecteur: s.collecteur ?? '' }))
      const parts = repartirReleve(montantNum, semaines, bordereaux, noms)
      onSaveReleve(
        magasin.id,
        { mois },
        parts.map((p) => ({
          ...commun,
          id: uid(),
          semaine: p.semaine,
          pvEmballes: p.montant,
          kgFL: 0,
          collecteur: p.collecteur || undefined,
          releveMois: mois,
          note: `Relevé ${libelleMois(mois)} — ${fmtEUR(montantNum, 2)} répartis sur ${semaines.length} semaine${semaines.length > 1 ? 's' : ''} au prorata des bordereaux`,
        })),
      )
    } else {
      const bordereaux = bordereauxDeLaSemaineReleve.map((s) => ({ semaine: s.semaine, collecteur: s.collecteur ?? '' }))
      const parts = montantNum > 0 ? repartirReleve(montantNum, [semaine], bordereaux, noms) : [{ semaine, collecteur: noms.length === 1 ? noms[0] : '', montant: 0 }]
      onSaveReleve(
        magasin.id,
        { semaine },
        parts.map((p, i) => ({
          ...commun,
          id: uid(),
          semaine,
          pvEmballes: p.montant,
          // Le poids hebdo saisi ici ne concerne que les magasins sans bordereau quotidien
          kgFL: i === 0 && bordereauxDeLaSemaineReleve.length === 0 ? kgSemaineNum : 0,
          collecteur: p.collecteur || undefined,
          note: `Relevé de démarque ${weekLabel(semaine)}`,
        })),
      )
    }
    setConfirmationReleve(true)
    setTimeout(() => setConfirmationReleve(false), 2500)
  }

  function enregistrerCorrection() {
    if (!correctionValide || !magasin || !societe) return
    onSave({
      id: uid(),
      magasinId: magasin.id,
      semaine: semaineRecap,
      type: 'correction',
      pvEmballes: corrPvNum,
      kgFL: corrKgNum,
      note: corrNote.trim() || 'Dons refusés par l’association',
      justificatifs: corrPj,
      horodatage: new Date().toISOString(),
      margePctAppliquee: societe.margePct,
      coutKgFLApplique: magasin.coutKgFL,
    })
    setCorrPv('')
    setCorrKg('')
    setCorrNote('')
    setCorrPj([])
    setModeCorrection(false)
  }

  return (
    <div className="etroit">
      <h2>Saisie</h2>

      {magasins.length > 1 && (
        <div className="chips">
          {magasins.map((m) => (
            <button key={m.id} className={`chip ${m.id === magasin.id ? 'active' : ''}`} onClick={() => setMagasinId(m.id)}>
              {m.nom}
            </button>
          ))}
        </div>
      )}

      {magasin.collecteurs.length === 0 && (
        <div className="info-banner">
          <strong>Pas encore de collecte en place ?</strong> Suivez l’assistant : association, calendrier, tri, pesée.{' '}
          <button className="btn btn-ambre btn-sm" style={{ marginTop: 8, display: 'flex' }} onClick={onAllerCollecte}>
            Organiser ma collecte
          </button>
        </div>
      )}
      {agg?.plafondAtteint && (
        <div className="info-banner vert">
          <strong>Plafond fiscal atteint — vos prochains dons ne sont plus facturés.</strong> Continuez à documenter vos
          dons (conformité et impact) : le compteur repart au 1<sup>er</sup> jour de l’exercice suivant.
        </div>
      )}
      {agg?.alerteCA && !agg.plafondAtteint && (
        <div className="info-banner alerte">
          Volume de dons inhabituel par rapport au CA déclaré (plus de 2,5 % du CA) — un justificatif complémentaire
          sera demandé. Les semaines concernées sont marquées au registre.
        </div>
      )}

      {/* ============ 1. Bordereau du jour ============ */}
      <div className="card">
        <h3>1. Bordereau du jour</h3>
        <p className="muted">
          Un par passage de l’association. C’est la <strong>preuve</strong> en cas de contrôle : photo du bordereau signé
          archivée dans votre compte, colis comptés, fruits &amp; légumes pesés. Il ne vaut rien en euros par lui-même —
          la valeur vient du relevé de démarque, en dessous.
        </p>

        <div className="semaine-nav">
          <button className="btn btn-ghost" onClick={() => setJour(addJours(jour, -1))} aria-label="Jour précédent">
            ‹
          </button>
          <div className="titre">
            {labelJour(jour)}
            <small>
              {weekLabel(semaineDuBordereau)} · {bordereauExistant ? 'bordereau enregistré — modifiable' : 'aucun bordereau ce jour'}
            </small>
          </div>
          <button className="btn btn-ghost" onClick={() => setJour(addJours(jour, 1))} aria-label="Jour suivant">
            ›
          </button>
        </div>

        <ScanBordereau magasin={magasin} session={session} jour={jour} onAppliquer={appliquerScan} />

        {plusieursCollecteurs && (
          <label className="field">
            <span>Association passée ce jour *</span>
            <div className="chips" style={{ marginBottom: 0 }}>
              {magasin.collecteurs.map((c) => (
                <button key={c.nom} type="button" className={`chip ${collecteur === c.nom ? 'active' : ''}`} onClick={() => setCollecteur(c.nom)}>
                  {c.nom}
                </button>
              ))}
            </div>
          </label>
        )}

        <div className="colonnes-2">
          <label className="field">
            <span>Colis remis (bacs, cartons ou sacs)</span>
            <input type="number" inputMode="numeric" min={0} step={1} value={colis} onChange={(e) => setColis(e.target.value)} placeholder="Ex. 4" />
          </label>
          {!flInclus && (
            <label className="field">
              <span>Fruits &amp; légumes pesés (net)</span>
              <div className="suffixe">
                <input type="number" inputMode="decimal" min={0} step={0.5} value={kg} onChange={(e) => setKg(e.target.value)} placeholder="Ex. 12,5" />
                <em>kg</em>
              </div>
            </label>
          )}
        </div>
        {flInclus && (
          <p className="muted" style={{ marginTop: -4 }}>
            Fruits &amp; légumes inclus dans le montant scanné pour ce magasin — pas de pesée à saisir.
          </p>
        )}

        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={signe} onChange={(e) => setSigne(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--vert)' }} />
          <span style={{ marginBottom: 0, fontWeight: 600, fontSize: 14 }}>Bordereau signé par le magasin et par l’association</span>
        </label>

        <label className="field">
          <span>Photo du bordereau (si non scannée ci-dessus)</span>
          <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => void ajouterPhotos(e.target.files)} />
          <span className="aide">{session ? 'Archivée dans votre compte Mana (pièce justificative).' : 'Hors connexion : gardée sur cet appareil seulement — connectez-vous pour l’archiver.'}</span>
          {justificatifs.length > 0 && (
            <span className="justif-list">
              {justificatifs.map((j) => (
                <span className="pj" key={j.id}>
                  📎 {j.nom}
                  <button aria-label={`Retirer ${j.nom}`} onClick={(e) => { e.preventDefault(); setJustificatifs(justificatifs.filter((x) => x.id !== j.id)) }}>
                    ✕
                  </button>
                </span>
              ))}
            </span>
          )}
        </label>

        <label className="field">
          <span>Remarque (facultatif)</span>
          <input type="text" value={noteJour} onChange={(e) => setNoteJour(e.target.value)} placeholder="Ex. 2 cagettes refusées, chaîne du froid" />
        </label>

        <div className="row-actions">
          <button className="btn btn-primary" disabled={!bordereauValide} style={{ opacity: bordereauValide ? 1 : 0.5, flex: 1 }} onClick={enregistrerBordereau}>
            {bordereauExistant ? 'Mettre à jour le bordereau' : 'Enregistrer le bordereau du jour'}
          </button>
          {bordereauExistant && (
            <button className="btn btn-danger" onClick={() => { if (confirm('Supprimer le bordereau de ce jour ?')) onDelete(bordereauExistant.id) }}>
              Supprimer
            </button>
          )}
        </div>
        {confirmationJour && (
          <p style={{ textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
            <span className="badge vert">✓ Bordereau archivé au registre</span>
          </p>
        )}
      </div>

      {/* ============ 2. Relevé de démarque ============ */}
      <div className="card">
        <h3>2. Relevé de démarque « don »</h3>
        <p className="muted">
          Le montant en prix de vente lu dans l’export de votre back-office (motif « don »), quand vous voulez :
          chaque semaine ou chaque mois. Un relevé mensuel est réparti sur les semaines du mois au prorata des
          bordereaux enregistrés{plusieursCollecteurs ? ', et entre vos associations de la même façon' : ''}.
        </p>

        <div className="chips" style={{ marginBottom: 10 }}>
          <button type="button" className={`chip ${periode === 'semaine' ? 'active' : ''}`} onClick={() => setPeriode('semaine')}>
            Par semaine
          </button>
          <button type="button" className={`chip ${periode === 'mois' ? 'active' : ''}`} onClick={() => setPeriode('mois')}>
            Par mois
          </button>
        </div>

        {periode === 'semaine' ? (
          <div className="semaine-nav">
            <button className="btn btn-ghost" onClick={() => setSemaine(addWeeks(semaine, -1))} aria-label="Semaine précédente">
              ‹
            </button>
            <div className="titre">
              {weekLabel(semaine)}
              <small>
                {bordereauxDeLaSemaineReleve.length} bordereau{bordereauxDeLaSemaineReleve.length > 1 ? 'x' : ''} ·{' '}
                {releveExistant && releveExistant.length > 0 ? 'relevé enregistré — modifiable' : 'aucun relevé'}
              </small>
            </div>
            <button className="btn btn-ghost" onClick={() => setSemaine(addWeeks(semaine, 1))} aria-label="Semaine suivante">
              ›
            </button>
          </div>
        ) : (
          <div className="semaine-nav">
            <button className="btn btn-ghost" onClick={() => setMois(addMois(mois, -1))} aria-label="Mois précédent">
              ‹
            </button>
            <div className="titre">
              {libelleMois(mois)}
              <small>
                {semainesDuMois(mois).length} semaines ·{' '}
                {releveExistant && releveExistant.length > 0 ? 'relevé enregistré — modifiable' : 'aucun relevé'}
              </small>
            </div>
            <button className="btn btn-ghost" onClick={() => setMois(addMois(mois, 1))} aria-label="Mois suivant">
              ›
            </button>
          </div>
        )}

        <label className="field">
          <span>Fruits &amp; légumes</span>
          <div className="chips" style={{ marginBottom: 0 }}>
            <button type="button" className={`chip ${!flInclus ? 'active' : ''}`} onClick={() => setFlInclus(false)}>
              Pesés sur les bordereaux
            </button>
            <button type="button" className={`chip ${flInclus ? 'active' : ''}`} onClick={() => setFlInclus(true)}>
              Inclus dans le montant
            </button>
          </div>
        </label>

        <label className="field">
          <span>{flInclus ? 'Démarque « don » — tous produits, F&L compris (prix de vente)' : 'Démarque « don » — produits emballés (prix de vente)'}</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} step={1} value={montant} onChange={(e) => setMontant(e.target.value)} placeholder={periode === 'mois' ? 'Ex. 4 800' : 'Ex. 1 150'} />
            <em>€</em>
          </div>
        </label>

        {periode === 'semaine' && !flInclus && bordereauxDeLaSemaineReleve.length === 0 && (
          <label className="field">
            <span>Fruits &amp; légumes de la semaine (pas de bordereau quotidien)</span>
            <div className="suffixe">
              <input type="number" inputMode="decimal" min={0} step={0.5} value={kgSemaine} onChange={(e) => setKgSemaine(e.target.value)} placeholder="Ex. 55" />
              <em>kg</em>
            </div>
            <span className="aide">Si vous enregistrez des bordereaux jour par jour, leurs poids sont déjà comptés — laissez vide.</span>
          </label>
        )}

        <button className="btn btn-primary btn-block" disabled={!releveValide} style={{ opacity: releveValide ? 1 : 0.5 }} onClick={enregistrerReleve}>
          {releveExistant && releveExistant.length > 0 ? 'Mettre à jour le relevé' : periode === 'mois' ? 'Enregistrer le relevé du mois' : 'Enregistrer le relevé de la semaine'}
        </button>
        {confirmationReleve && (
          <p style={{ textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
            <span className="badge vert">✓ Relevé enregistré au registre</span>
          </p>
        )}
      </div>

      {/* ============ 3. Récapitulatif de la semaine ============ */}
      <div className="card accent">
        <h3>{weekLabel(semaineRecap)}</h3>
        <div className="detail-lignes">
          <div className="ligne">
            <span>Bordereaux · colis · F&amp;L</span>
            <strong>
              {bordereauxDeLaSemaine.length} · {colisSemaine} · {fmtNum(kgTotalSemaine, 1)} kg
            </strong>
          </div>
          <div className="ligne">
            <span>Coût de revient emballés</span>
            <Amount
              titre="Coût de revient — produits emballés"
              lignes={['coût_emballés = démarque_PV × (1 − marge)', `= ${fmtEUR(pvSemaine, 2)} × (1 − ${fmtPct(societe.margePct)})`, `= ${fmtEUR(cEmbSemaine, 2)}`]}
            >
              <strong>{fmtEUR(cEmbSemaine, 2)}</strong>
            </Amount>
          </div>
          <div className="ligne">
            <span>Valorisation F&amp;L</span>
            <Amount titre="Coût de revient — fruits & légumes" lignes={['coût_FL = kg × coût_kg', `= ${fmtNum(kgTotalSemaine, 1)} kg × ${fmtEUR(magasin.coutKgFL, 2)}/kg`, `= ${fmtEUR(cFLSemaine, 2)}`]}>
              <strong>{fmtEUR(cFLSemaine, 2)}</strong>
            </Amount>
          </div>
          <div className="ligne">
            <span>Base fiscale de la semaine{corrections.length > 0 ? ' (corrections déduites)' : ''}</span>
            <Amount
              titre="Base de la semaine"
              lignes={['base = coût_emballés + coût_FL − corrections', `= ${fmtEUR(baseSemaineTotale, 2)}`, `Réduction d’impôt correspondante (hors plafond) : 60 % × ${fmtEUR(baseSemaineTotale, 2)} = ${fmtEUR(0.6 * baseSemaineTotale, 2)}`]}
            >
              <strong style={{ fontSize: 18 }} className="montant-serif">{fmtEUR(baseSemaineTotale, 2)}</strong>
            </Amount>
          </div>
        </div>
        {relevesDeLaSemaine.length === 0 && bordereauxDeLaSemaine.length > 0 && (
          <p className="muted" style={{ marginTop: 10, marginBottom: 0, color: 'var(--papier)', opacity: 0.85 }}>
            Bordereaux enregistrés, mais pas encore de relevé de démarque pour cette semaine : la valeur des produits
            emballés est à 0 € tant que le montant n’est pas saisi.
          </p>
        )}
      </div>

      {/* Liste des bordereaux et relevés de la semaine */}
      {(bordereauxDeLaSemaine.length > 0 || relevesDeLaSemaine.length > 0) && (
        <div className="card">
          <h3>Lignes de la semaine</h3>
          {bordereauxDeLaSemaine.map((s) => (
            <div className="facture-ligne" key={s.id}>
              <div className="infos">
                <strong>
                  {labelJour(s.jour!)}
                  {s.collecteur ? ` · ${s.collecteur}` : ''}
                </strong>
                <small>
                  {[s.colis ? `${s.colis} colis` : '', s.kgFL ? `${fmtNum(s.kgFL, 1)} kg F&L` : '', s.signe ? 'signé' : 'signature non confirmée', s.justificatifs.length ? `${s.justificatifs.length} photo${s.justificatifs.length > 1 ? 's' : ''}` : 'pas de photo']
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setJour(s.jour!)}>
                Ouvrir
              </button>
            </div>
          ))}
          {relevesDeLaSemaine.map((s) => (
            <div className="facture-ligne" key={s.id}>
              <div className="infos">
                <strong>
                  Relevé {fmtEUR(s.pvEmballes, 2)}
                  {s.collecteur ? ` · ${s.collecteur}` : ''}
                </strong>
                <small>{s.note ?? (s.origine ? 'relevé de démarque' : 'saisie hebdomadaire (ancien format)')}{s.kgFL ? ` · ${fmtNum(s.kgFL, 1)} kg F&L` : ''}</small>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Supprimer cette ligne ?')) onDelete(s.id) }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Corrections */}
      <div className="card">
        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: modeCorrection ? 10 : 0 }}>
          <input type="checkbox" checked={modeCorrection} onChange={(e) => setModeCorrection(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--vert)' }} />
          <span style={{ marginBottom: 0, fontWeight: 600, fontSize: 14 }}>Correction : retrancher des dons refusés par l’association ({weekLabel(semaineRecap)})</span>
        </label>
        {modeCorrection && (
          <>
            <div className="info-banner">
              Montants <strong>en négatif</strong> (ex. −120 € / −8 kg), sur une <strong>semaine passée</strong>, avec le
              justificatif du refus joint. Le cumul, le plafond et la prochaine facture se recalculent.
            </div>
            <div className="colonnes-2">
              <label className="field">
                <span>Produits emballés (prix de vente)</span>
                <div className="suffixe">
                  <input type="number" inputMode="decimal" max={0} step={1} value={corrPv} onChange={(e) => setCorrPv(e.target.value)} placeholder="Ex. −120" />
                  <em>€</em>
                </div>
              </label>
              <label className="field">
                <span>Fruits &amp; légumes (poids)</span>
                <div className="suffixe">
                  <input type="number" inputMode="decimal" max={0} step={0.5} value={corrKg} onChange={(e) => setCorrKg(e.target.value)} placeholder="Ex. −8" />
                  <em>kg</em>
                </div>
              </label>
            </div>
            <label className="field">
              <span>Justificatif du refus *</span>
              <input type="file" accept="image/*,application/pdf" multiple onChange={async (e) => { const n = await lireFichiers(e.target.files); setCorrPj((p) => [...p, ...n]) }} />
              {corrPj.length > 0 && <span className="aide">{corrPj.map((j) => j.nom).join(', ')}</span>}
            </label>
            <label className="field">
              <span>Motif</span>
              <input type="text" value={corrNote} onChange={(e) => setCorrNote(e.target.value)} placeholder="Ex. 3 cagettes refusées (chaîne du froid)" />
            </label>
            {!semainePasseeCorr && <p className="muted">Une correction ne peut porter que sur une semaine passée.</p>}
            <button className="btn btn-primary btn-block" disabled={!correctionValide} style={{ opacity: correctionValide ? 1 : 0.5 }} onClick={enregistrerCorrection}>
              Enregistrer la correction
            </button>
          </>
        )}
        {corrections.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {corrections.map((c) => (
              <div className="facture-ligne" key={c.id}>
                <div className="infos">
                  <strong>{fmtEUR(c.pvEmballes, 2)} · {fmtNum(c.kgFL, 1)} kg</strong>
                  <small>{c.note}</small>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Supprimer cette correction ?')) onDelete(c.id) }}>
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
