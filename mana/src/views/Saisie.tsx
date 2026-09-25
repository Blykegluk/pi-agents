import { MaSemaine } from '../components/MaSemaine'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AppState, Justificatif, Saisie } from '../types'
import { coutEmballes, coutFL } from '../lib/calc'
import { fmtDate, fmtEUR, fmtNum, fmtPct } from '../lib/format'
import { pdfBordereau } from '../lib/pdf'
import { compareWeekIds, currentWeekId, isoWeekOf, mondayOfWeek, weekId, weekLabel } from '../lib/iso'
import { joursEntre, normaliserEnPVHT, repartirRelevePeriode, TVA_ALIMENTAIRE } from '../lib/releves'
import { Amount } from '../components/Formula'
import { IconSaisie } from '../components/Icons'
import { ScanBordereau, type PropositionScan } from '../components/ScanBordereau'
import { ImportBordereaux, type BordereauImporte } from '../components/ImportBordereaux'
import { Calendrier, joursCouvertsParReleves } from '../components/Calendrier'
import { Pieces } from '../components/Pieces'
import { uid } from '../lib/storage'
import { compresserPhoto, lireFichiers } from '../lib/fichiers'
import { creerDemande, lireReleve, televerserBordereau, type LectureReleve, compteId } from '../lib/cloud'
import { categorieFL, coutPesee, libellePoids, poidsDeSaisie, profilDeMagasin } from '../lib/bordereau'
import { VERSION_CONTRAT } from '../lib/contrat'
import { analyserTableur, estUnTableur, tableurEnTexte, texteEnBase64, type AnalyseTableur } from '../lib/tableur'
import { denomination } from '../lib/identite'
import { aggParSociete, baseDeLaSaisie } from '../lib/selectors'

/** Jusqu'à ce nombre, les magasins tiennent en pastilles côte à côte ; au-delà, menu déroulant. */
const MAX_MAGASINS_EN_PASTILLES = 4

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
const addMois = (mois: string, n: number) => {
  const [y, m] = mois.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}
const bornesSemaine = (semaine: string) => {
  const lundi = mondayOfWeek(semaine)
  const dim = new Date(lundi)
  dim.setUTCDate(lundi.getUTCDate() + 6)
  return { du: lundi.toISOString().slice(0, 10), au: dim.toISOString().slice(0, 10) }
}
const bornesMois = (mois: string) => {
  const [y, m] = mois.split('-').map(Number)
  return { du: `${mois}-01`, au: `${mois}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}` }
}
const fichierEnBase64 = (f: File) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader()
    r.onload = () => ok((r.result as string).split(',')[1])
    r.onerror = () => ko(new Error('Fichier illisible.'))
    r.readAsDataURL(f)
  })

type SaisiEn = NonNullable<Saisie['saisiEn']>
const LIBELLES_SAISI: Record<SaisiEn, string> = { pv_ht: 'prix de vente HT', pv_ttc: 'prix de vente TTC', pa_ht: 'prix d’achat HT', pa_ttc: 'prix d’achat TTC' }

/**
 * Saisie — deux objets distincts, additionnés par semaine :
 *
 *  1. Le BORDEREAU DU JOUR : un par passage (colis, poids des F&L, photo
 *     signée). C'est la preuve — jamais valorisée en euros par elle-même.
 *  2. Le RELEVÉ DE DÉMARQUE : le montant lu dans l'export du back-office, sur
 *     la période qu'on veut (semaine, mois, ou dates libres). Il prime toujours ;
 *     les bordereaux ne servent qu'à le ventiler entre semaines et associations.
 *
 * Le montant du relevé est ramené en prix de vente HT avant calcul : le magasin
 * dit s'il a saisi du HT ou du TTC, du prix de vente ou du prix d'achat — et
 * Mana le lui demande tant qu'il ne l'a pas dit.
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
  onSaveReleve: (magasinId: string, periode: { semaine?: string; mois?: string; du?: string; au?: string }, nouvelles: Saisie[]) => void
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
  const [moisCal, setMoisCal] = useState(jourAujourdhui().slice(0, 7))
  const [colis, setColis] = useState('')
  const [kg, setKg] = useState('')
  const [collecteur, setCollecteur] = useState('')
  const [signe, setSigne] = useState(false)
  const [poids, setPoids] = useState<Record<string, string>>({})
  const [precisionPoids, setPrecisionPoids] = useState('')
  const [noteJour, setNoteJour] = useState('')
  const [justificatifs, setJustificatifs] = useState<Justificatif[]>([])
  const [confirmationJour, setConfirmationJour] = useState(false)

  // ---- Relevé de démarque ----
  const [mode, setMode] = useState<'semaine' | 'mois' | 'libre'>('semaine')
  const [semaineSel, setSemaineSel] = useState(currentWeekId())
  const [moisSel, setMoisSel] = useState(jourAujourdhui().slice(0, 7))
  const [duLibre, setDuLibre] = useState(addJours(jourAujourdhui(), -6))
  const [auLibre, setAuLibre] = useState(jourAujourdhui())
  const [montant, setMontant] = useState('')
  // Nature (prix de vente / d'achat) et unité (HT / TTC) se choisissent séparément :
  // une lecture peut connaître l'une sans l'autre, et il ne faut pas perdre ce qu'elle sait.
  const [nature, setNature] = useState<'pv' | 'pa' | ''>('')
  const [unite, setUnite] = useState<'ht' | 'ttc' | ''>('')
  const saisiEn: SaisiEn | '' = nature && unite ? (`${nature}_${unite}` as SaisiEn) : ''
  const setSaisiEn = (v: SaisiEn | '') => {
    setNature(v ? (v.slice(0, 2) as 'pv' | 'pa') : '')
    setUnite(v ? (v.slice(3) as 'ht' | 'ttc') : '')
  }
  const [analyseLocale, setAnalyseLocale] = useState<AnalyseTableur | null>(null)
  const [tauxTVA, setTauxTVA] = useState(String(TVA_ALIMENTAIRE))
  const [kgPeriode, setKgPeriode] = useState('')
  const [flInclus, setFlInclus] = useState(false)
  const [lectureReleve, setLectureReleve] = useState<LectureReleve | null>(null)
  const [lectureEnCours, setLectureEnCours] = useState(false)
  const [survolReleve, setSurvolReleve] = useState(false)
  const [messageReleve, setMessageReleve] = useState('')
  const [confirmationReleve, setConfirmationReleve] = useState(false)

  // ---- Correction (dons refusés) ----
  const [modeCorrection, setModeCorrection] = useState(false)
  const [corrPv, setCorrPv] = useState('')
  const [corrKg, setCorrKg] = useState('')
  const [corrNote, setCorrNote] = useState('')
  const [corrPj, setCorrPj] = useState<Justificatif[]>([])

  const { du, au } = mode === 'semaine' ? bornesSemaine(semaineSel) : mode === 'mois' ? bornesMois(moisSel) : { du: duLibre, au: auLibre }
  const periodeValide = Boolean(du && au && du <= au)
  const semaineRecap = semaineDuJour(jour)

  const saisiesMagasin = useMemo(() => state.saisies.filter((s) => s.magasinId === magasin?.id), [state.saisies, magasin])
  const bordereauxMagasin = useMemo(() => saisiesMagasin.filter((s) => s.type === 'don' && s.jour), [saisiesMagasin])
  const relevesMagasin = useMemo(() => saisiesMagasin.filter((s) => s.type === 'don' && !s.jour), [saisiesMagasin])
  const bordereauExistant = useMemo(() => bordereauxMagasin.find((s) => s.jour === jour), [bordereauxMagasin, jour])
  const bordereauxDeLaSemaine = useMemo(
    () => bordereauxMagasin.filter((s) => s.semaine === semaineRecap).sort((a, b) => (a.jour ?? '').localeCompare(b.jour ?? '')),
    [bordereauxMagasin, semaineRecap],
  )
  const relevesDeLaSemaine = useMemo(() => relevesMagasin.filter((s) => s.semaine === semaineRecap), [relevesMagasin, semaineRecap])
  const corrections = useMemo(
    () => saisiesMagasin.filter((s) => s.semaine === semaineRecap && s.type === 'correction').sort((a, b) => a.horodatage.localeCompare(b.horodatage)),
    [saisiesMagasin, semaineRecap],
  )
  const releveExistant = useMemo(
    () => relevesMagasin.filter((s) => s.origine === 'releve' && s.releveDu === du && s.releveAu === au),
    [relevesMagasin, du, au],
  )
  const bordereauxDeLaPeriode = useMemo(() => bordereauxMagasin.filter((s) => s.jour! >= du && s.jour! <= au), [bordereauxMagasin, du, au])
  /** Relevés sur une autre période qui recouvrent en partie celle-ci (à signaler, pas à écraser). */
  const relevesChevauchants = useMemo(
    () => relevesMagasin.filter((s) => s.origine === 'releve' && !(s.releveDu === du && s.releveAu === au) && [...joursCouvertsParReleves([s])].some((j) => j >= du && j <= au)),
    [relevesMagasin, du, au],
  )
  const dernierReleve = useMemo(() => [...relevesMagasin].filter((s) => s.saisiEn).sort((a, b) => b.horodatage.localeCompare(a.horodatage))[0], [relevesMagasin])

  // Recharge le bordereau quand on change de jour / de magasin
  useEffect(() => {
    setColis(bordereauExistant?.colis ? String(bordereauExistant.colis) : '')
    setKg(bordereauExistant?.kgFL ? String(bordereauExistant.kgFL) : '')
    setPoids(bordereauExistant ? Object.fromEntries(Object.entries(poidsDeSaisie(bordereauExistant)).map(([k, v]) => [k, v ? String(v) : ''])) : {})
    setPrecisionPoids(bordereauExistant?.precisionPoids ?? '')
    setCollecteur(bordereauExistant?.collecteur ?? (magasin?.collecteurs.length === 1 ? magasin.collecteurs[0].nom : ''))
    setSigne(bordereauExistant?.signe ?? false)
    setNoteJour(bordereauExistant?.note ?? '')
    setJustificatifs(bordereauExistant?.justificatifs ?? [])
    setConfirmationJour(false)
  }, [bordereauExistant, magasinId, jour, magasin])

  // Recharge le relevé quand la période change : ce qui a été saisi tel quel, pas la valeur normalisée.
  // Sauf quand c'est une lecture de document qui vient de déplacer la période : ses valeurs priment.
  const periodeDeplaceeParLecture = useRef(false)
  const periodeCourante = useRef({ du, au })
  periodeCourante.current = { du, au }
  useEffect(() => {
    if (periodeDeplaceeParLecture.current) {
      periodeDeplaceeParLecture.current = false
      return
    }
    const premiere = releveExistant[0]
    if (premiere?.montantSaisi !== undefined) {
      setMontant(String(premiere.montantSaisi))
      setSaisiEn(premiere.saisiEn ?? '')
      setTauxTVA(String(premiere.tauxTVA ?? TVA_ALIMENTAIRE))
    } else {
      const total = releveExistant.reduce((t, s) => t + s.pvEmballes, 0)
      setMontant(total > 0 ? String(Math.round(total * 100) / 100) : '')
      setSaisiEn(total > 0 ? 'pv_ht' : (dernierReleve?.saisiEn ?? ''))
      setTauxTVA(String(dernierReleve?.tauxTVA ?? TVA_ALIMENTAIRE))
    }
    const kgs = releveExistant.reduce((t, s) => t + s.kgFL, 0)
    setKgPeriode(kgs > 0 ? String(kgs) : '')
    setFlInclus(releveExistant.some((s) => s.flInclus) || (releveExistant.length === 0 && magasin?.modeFL === 'inclus'))
    setLectureReleve(null)
    setAnalyseLocale(null)
    // (la confirmation « ✓ enregistré » n'est pas effacée ici : l'enregistrement lui-même
    // recharge le relevé, et le badge doit rester visible quelques secondes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const profil = profilDeMagasin(magasin)
  const catFL = categorieFL(profil)
  const flValoriseAuKilo = catFL?.valorisation === 'cout_kg'
  const poidsNum: Record<string, number> = Object.fromEntries(profil.categories.map((c) => [c.id, Number(poids[c.id]) || 0]))
  const kgNum = poidsNum.fl ?? 0
  const poidsTotalNum = Object.values(poidsNum).reduce((t, v) => t + v, 0)
  const bordereauValide = (colisNum > 0 || poidsTotalNum > 0 || justificatifs.length > 0) && !(plusieursCollecteurs && !collecteur)

  const montantNum = Number(montant) || 0
  const tvaNum = Number(tauxTVA) || 0
  const kgPeriodeNum = Number(kgPeriode) || 0
  const pvHT = saisiEn ? normaliserEnPVHT(montantNum, saisiEn, societe.margePct, tvaNum) : 0
  const releveValide = periodeValide && ((montantNum > 0 && saisiEn !== '') || kgPeriodeNum > 0)
  const doutesReleve: string[] = []
  if (montantNum > 0 && !unite) doutesReleve.push(lectureReleve || analyseLocale ? 'Le document ne dit pas si le montant est HT ou TTC : choisissez.' : 'Précisez si le montant est HT ou TTC.')
  if (montantNum > 0 && !nature) doutesReleve.push(lectureReleve || analyseLocale ? 'Le document ne dit pas s’il s’agit du prix de vente ou du prix d’achat : choisissez.' : 'Précisez s’il s’agit du prix de vente ou du prix d’achat.')

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

  const socle = () => ({
    magasinId: magasin.id,
    margePctAppliquee: societe.margePct,
    coutKgFLApplique: magasin.coutKgFL,
  })

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
        const chemin = await televerserBordereau(compteId(session), blob, 'bordereau.jpg')
        nouveaux.push({ id: uid(), nom: `Bordereau ${jour}`, type: typeMime, taille: blob.size, chemin })
      } else {
        const chemin = await televerserBordereau(compteId(session), f, f.name)
        nouveaux.push({ id: uid(), nom: f.name, type: f.type, taille: f.size, chemin })
      }
    }
    setJustificatifs((p) => [...p, ...nouveaux])
  }

  function appliquerScan({ lecture, justificatif }: PropositionScan) {
    if (lecture.nbColis > 0) setColis(String(lecture.nbColis))
    setPoids((p) => ({
      ...p,
      ...(lecture.kgFL > 0 ? { fl: String(lecture.kgFL) } : {}),
      ...(lecture.kgPain > 0 ? { pain: String(lecture.kgPain) } : {}),
      ...(lecture.kgAutres > 0 ? { autres: String(lecture.kgAutres) } : {}),
    }))
    if (lecture.autresPrecision) setPrecisionPoids(lecture.autresPrecision)
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
      ...socle(),
      semaine: semaineDuJour(jour),
      jour,
      type: 'don',
      origine: 'bordereau',
      pvEmballes: 0,
      kgFL: kgNum,
      flInclus: !flValoriseAuKilo || undefined,
      poids: poidsNum,
      precisionPoids: precisionPoids.trim() || undefined,
      coutPeseeApplique: coutPesee(poidsNum, profil),
      colis: colisNum || undefined,
      signe,
      collecteur: collecteur || undefined,
      note: noteJour.trim() || undefined,
      justificatifs,
      horodatage: new Date().toISOString(),
    })
    setConfirmationJour(true)
    setTimeout(() => setConfirmationJour(false), 2500)
  }

  function enregistrerImport(lignes: BordereauImporte[]) {
    const horodatage = new Date().toISOString()
    for (const l of lignes) {
      onSave({
        id: uid(),
        ...socle(),
        semaine: semaineDuJour(l.jour),
        jour: l.jour,
        type: 'don',
        origine: 'bordereau',
        pvEmballes: 0,
        kgFL: l.kgFL,
        flInclus: !flValoriseAuKilo || undefined,
        poids: { fl: l.kgFL, pain: l.kgPain, autres: l.kgAutres },
        precisionPoids: l.autresPrecision || undefined,
        coutPeseeApplique: coutPesee({ fl: l.kgFL, pain: l.kgPain, autres: l.kgAutres }, profil),
        colis: l.colis || undefined,
        signe: l.signe,
        collecteur: l.collecteur || undefined,
        note: l.lecture?.refus ? `refus : ${l.lecture.refus}` : undefined,
        justificatifs: [l.justificatif],
        horodatage,
      })
    }
    setMoisCal(lignes[lignes.length - 1]?.jour.slice(0, 7) ?? moisCal)
  }

  async function lireDocumentReleve(files: FileList | null) {
    const f = files?.[0]
    if (!f || !session) return
    setLectureEnCours(true)
    setMessageReleve('')
    setAnalyseLocale(null)
    let analyse: AnalyseTableur | null = null
    try {
      let base64: string
      let typeMime: string
      if (estUnTableur(f)) {
        // Excel, CSV, ODS : le tableur devient un texte tabulaire que la lecture comprend…
        const texte = await tableurEnTexte(f)
        base64 = texteEnBase64(texte)
        typeMime = 'text/csv'
        // …et on additionne nous-mêmes les lignes produit, sans attendre la lecture automatique
        analyse = analyserTableur(texte, f.name)
        setAnalyseLocale(analyse)
        appliquerAnalyseLocale(analyse)
      } else if (f.type === 'application/pdf') {
        base64 = await fichierEnBase64(f)
        typeMime = 'application/pdf'
      } else if (f.type.startsWith('image/')) {
        const c = await compresserPhoto(f, 2000, 0.8)
        base64 = c.base64
        typeMime = c.typeMime
      } else {
        throw new Error(`Format non pris en charge (${f.name}) : déposez une photo, une capture d’écran, un PDF ou un fichier Excel / CSV.`)
      }
      const periodeConnue = analyse?.du && analyse.au ? `${analyse.du} → ${analyse.au}` : periodeValide ? `${du} → ${au}` : undefined
      const lecture = await lireReleve(base64, typeMime, { magasin: magasin.nom, periodeAttendue: periodeConnue, nomFichier: f.name })
      setLectureReleve(lecture)
      if (!lecture.estUnReleve && !analyse?.sommeLignes) {
        setMessageReleve('Ce document ne ressemble pas à un relevé de démarque — rien n’a été repris.')
        return
      }
      if (lecture.du && lecture.au) {
        if (lecture.du !== periodeCourante.current.du || lecture.au !== periodeCourante.current.au) periodeDeplaceeParLecture.current = true
        setMode('libre')
        setDuLibre(lecture.du)
        setAuLibre(lecture.au)
      }
      if (lecture.montant > 0) setMontant(String(lecture.montant))
      if (lecture.tauxTVA > 0) setTauxTVA(String(lecture.tauxTVA))
      // On ne décide HT/TTC et PV/PA que si le document l'écrit : sinon la question reste posée au magasin.
      // Ce que la lecture sait complète ce que l'analyse locale a trouvé, sans l'effacer.
      if (lecture.nature !== 'inconnu') setNature(lecture.nature === 'prix_vente' ? 'pv' : 'pa')
      if (lecture.unite !== 'inconnu') setUnite(lecture.unite)
      setMessageReleve(analyse?.sommeLignes ? `${messageAnalyse(analyse)} Lecture automatique confirmée — vérifiez puis enregistrez.` : 'Lecture reportée — vérifiez la période, le montant et sa nature, puis enregistrez.')
    } catch (e) {
      // Un tableur déjà additionné localement reste exploitable même si la lecture automatique échoue
      setMessageReleve(analyse?.sommeLignes ? `${messageAnalyse(analyse)} (Lecture automatique indisponible : ${(e as Error).message})` : (e as Error).message)
    } finally {
      setLectureEnCours(false)
    }
  }

  /** Reporte dans le formulaire ce que le tableur dit de lui-même, avant toute lecture automatique. */
  function appliquerAnalyseLocale(a: AnalyseTableur) {
    const total = a.sommeLignes ?? a.totalFichier
    if (total && total > 0) setMontant(String(total))
    if (a.du && a.au) {
      if (a.du !== periodeCourante.current.du || a.au !== periodeCourante.current.au) periodeDeplaceeParLecture.current = true
      setMode('libre')
      setDuLibre(a.du)
      setAuLibre(a.au)
    }
    setNature(a.nature ?? '')
    setUnite(a.unite ?? '')
  }

  function messageAnalyse(a: AnalyseTableur): string {
    const total = a.sommeLignes ?? 0
    let m = `Somme des ${a.nbLignes} lignes produit (colonne « ${a.colonneMontant} ») : ${fmtEUR(total, 2)}`
    if (a.totalFichier !== undefined) m += Math.abs(a.totalFichier - total) < 0.01 ? ', égale au total du fichier.' : ` ; le fichier indique un total de ${fmtEUR(a.totalFichier, 2)}.`
    else m += '.'
    if (a.du && a.au) m += a.sourceDates === 'nom' ? ' Période lue dans le nom du fichier.' : ' Période lue dans la colonne des dates.'
    return m
  }

  function enregistrerReleve() {
    if (!releveValide || !magasin || !societe || !saisiEn && montantNum > 0) return
    const horodatage = new Date().toISOString()
    const noms = magasin.collecteurs.map((c) => c.nom)
    const parts = montantNum > 0
      ? repartirRelevePeriode(pvHT, du, au, bordereauxDeLaPeriode.map((b) => ({ jour: b.jour!, collecteur: b.collecteur ?? '' })), noms)
      : [{ semaine: semaineDuJour(du), collecteur: noms.length === 1 ? noms[0] : '', montant: 0 }]
    const nbJours = joursEntre(du, au).length
    const libelle = du === au ? `du ${fmtDate(du)}` : `du ${fmtDate(du)} au ${fmtDate(au)}`
    const nouvelles: Saisie[] = parts.map((p, i) => ({
      id: uid(),
      ...socle(),
      semaine: p.semaine,
      type: 'don',
      origine: 'releve',
      pvEmballes: p.montant,
      // Le poids saisi au relevé ne concerne que les périodes sans bordereau
      kgFL: i === 0 && bordereauxDeLaPeriode.length === 0 ? kgPeriodeNum : 0,
      flInclus: flInclus || undefined,
      collecteur: p.collecteur || undefined,
      releveDu: du,
      releveAu: au,
      montantSaisi: montantNum || undefined,
      saisiEn: saisiEn || undefined,
      tauxTVA: saisiEn === 'pv_ttc' || saisiEn === 'pa_ttc' ? tvaNum : undefined,
      justificatifs: [],
      horodatage,
      note:
        `Relevé ${libelle} (${nbJours} j) — ${fmtEUR(montantNum, 2)} ${saisiEn ? LIBELLES_SAISI[saisiEn] : ''}` +
        (saisiEn && saisiEn !== 'pv_ht' ? ` → ${fmtEUR(pvHT, 2)} PV HT` : '') +
        (parts.length > 1 ? `, réparti sur ${parts.length} ligne${parts.length > 1 ? 's' : ''} au prorata des bordereaux` : ''),
    }))
    onSaveReleve(magasin.id, { du, au }, nouvelles)
    setConfirmationReleve(true)
    setTimeout(() => setConfirmationReleve(false), 5000)
  }

  function enregistrerCorrection() {
    if (!correctionValide || !magasin || !societe) return
    onSave({
      id: uid(),
      ...socle(),
      semaine: semaineRecap,
      type: 'correction',
      pvEmballes: corrPvNum,
      kgFL: corrKgNum,
      note: corrNote.trim() || 'Dons refusés par l’association',
      justificatifs: corrPj,
      horodatage: new Date().toISOString(),
    })
    setCorrPv('')
    setCorrKg('')
    setCorrNote('')
    setCorrPj([])
    setModeCorrection(false)
  }

  return (
    <div className="saisie">
      <h2>Saisie</h2>

      <MaSemaine state={state} onAllerAssociations={onAllerCollecte} />

      {/* Barre figée : on voit toujours pour quel magasin on saisit, même en bas de page. */}
      <div className="barre-magasins">
        <span className="barre-magasins-libelle">Magasin</span>
        {magasins.length <= MAX_MAGASINS_EN_PASTILLES ? (
          <div className="chips" style={{ marginBottom: 0 }}>
            {magasins.map((m) => (
              <button key={m.id} className={`chip ${m.id === magasin.id ? 'active' : ''}`} onClick={() => setMagasinId(m.id)}>
                {m.nom}
              </button>
            ))}
          </div>
        ) : (
          /* Un groupe à 5 magasins et plus : un menu déroulant, regroupé par société. */
          <select className="barre-magasins-select" value={magasin.id} onChange={(e) => setMagasinId(e.target.value)} aria-label="Magasin en cours de saisie">
            {state.societes.length > 1
              ? state.societes.map((s) => {
                  const siens = magasins.filter((m) => m.societeId === s.id)
                  if (siens.length === 0) return null
                  return (
                    <optgroup key={s.id} label={denomination(s)}>
                      {siens.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                    </optgroup>
                  )
                })
              : magasins.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        )}
      </div>

      {(!societe.contrat || societe.contrat.version !== VERSION_CONTRAT) && (
        <div className="info-banner alerte" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            <strong>{societe.contrat ? 'Nouvelle version du contrat à signer' : 'Contrat à signer'} pour {denomination(societe)}.</strong>{' '}
            Sans lui, pas de reçu ni de document de fin d’année.
          </span>
          <button className="btn btn-primary btn-sm" onClick={onAllerCollecte}>Signer dans Magasins</button>
        </div>
      )}

      {magasin.collecteurs.length === 0 && (
        <div className="info-banner">
          <strong>Collecte pas encore en place.</strong>{' '}
          <button className="btn btn-ambre btn-sm" style={{ marginTop: 8, display: 'flex' }} onClick={onAllerCollecte}>
            Terminer la mise en place
          </button>
        </div>
      )}
      {agg?.plafondAtteint && (
        <div className="info-banner vert">
          <strong>Plafond fiscal atteint :</strong> les prochains dons ne sont plus facturés. Continuez à les saisir.
        </div>
      )}
      {agg?.alerteCA && !agg.plafondAtteint && (
        <div className="info-banner alerte">
          Dons supérieurs à 2,5 % du CA : un justificatif complémentaire sera demandé.
        </div>
      )}

      {/* Deux colonnes dès 1 100 px : bordereau + relevé à gauche, calendrier + récapitulatif à droite.
          En dessous, `.saisie-col { display: contents }` et `.saisie-cal { order: -1 }` gardent l'ordre mobile. */}
      <div className="saisie-grille">
      <div className="saisie-col">
      {/* ============ 1. Bordereau du jour ============ */}
      <ImportBordereaux magasin={magasin} session={session} joursDejaPris={bordereauxMagasin.map((b) => b.jour!).filter(Boolean)} onEnregistrer={enregistrerImport} />

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>1. Bordereau du jour</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void pdfBordereau(magasin, denomination(societe))} title="Télécharger un bordereau d’enlèvement vierge à imprimer et faire signer">
            ⬇ Bordereau vierge (PDF)
          </button>
        </div>
        <p className="muted">Un par passage : c’est la preuve du don. La valeur en euros vient du relevé, plus bas.</p>

        <div className="semaine-nav">
          <button className="btn btn-ghost" onClick={() => { const j = addJours(jour, -1); setJour(j); setMoisCal(j.slice(0, 7)) }} aria-label="Jour précédent">‹</button>
          <div className="titre">
            {labelJour(jour)}
            <small>
              {weekLabel(semaineRecap)} · {bordereauExistant ? 'bordereau enregistré — modifiable' : 'aucun bordereau ce jour'}
            </small>
          </div>
          <button className="btn btn-ghost" onClick={() => { const j = addJours(jour, 1); setJour(j); setMoisCal(j.slice(0, 7)) }} aria-label="Jour suivant">›</button>
        </div>

        {bordereauExistant && (
          <div className="info-banner" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 0 }}>
            <span style={{ flex: 1, minWidth: 200 }}>
              <strong>Mauvaise date ?</strong> Déplacez ce bordereau (photo comprise) au bon jour :
            </span>
            <input
              type="date"
              value={jour}
              max={new Date().toISOString().slice(0, 10)}
              style={{ width: 'auto', padding: 8 }}
              onChange={(e) => {
                const nouveau = e.target.value
                if (!nouveau || nouveau === jour) return
                if (bordereauxMagasin.some((b) => b.jour === nouveau)) {
                  alert(`Il y a déjà un bordereau le ${fmtDate(nouveau)} : supprimez-le d’abord, ou choisissez un autre jour.`)
                  return
                }
                onSave({ ...bordereauExistant, jour: nouveau, semaine: semaineDuJour(nouveau) })
                setJour(nouveau)
                setMoisCal(nouveau.slice(0, 7))
              }}
            />
          </div>
        )}

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
          {profil.categories.map((c) => (
            <label className="field" key={c.id}>
              <span>{c.libelle} pesé{c.libelle.endsWith('s') ? 's' : ''} (net){c.valorisation === 'cout_kg' ? ` · ${fmtEUR(c.coutKg ?? 0, 2)}/kg` : ''}</span>
              <div className="suffixe">
                <input type="number" inputMode="decimal" min={0} step={0.5} value={poids[c.id] ?? ''} onChange={(e) => setPoids((p) => ({ ...p, [c.id]: e.target.value }))} placeholder="Ex. 12,5" />
                <em>kg</em>
              </div>
            </label>
          ))}
          {profil.categories.some((c) => c.preciser && (Number(poids[c.id]) || 0) > 0) && (
            <label className="field">
              <span>Précisez ce qui a été pesé en « Autres »</span>
              <input type="text" value={precisionPoids} onChange={(e) => setPrecisionPoids(e.target.value)} placeholder="Ex. fromage à la coupe, vrac" />
            </label>
          )}
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          {profil.categories.every((c) => c.valorisation === 'releve')
            ? 'Tout est scanné dans ce magasin : ces poids servent de preuve et de tonnage, la valeur vient du relevé.'
            : `Valorisé au poids : ${profil.categories.filter((c) => c.valorisation === 'cout_kg').map((c) => c.libelle.toLowerCase()).join(', ')}. Le reste vient du relevé.`}
        </p>

        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={signe} onChange={(e) => setSigne(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--vert)' }} />
          <span style={{ marginBottom: 0, fontWeight: 600, fontSize: 14 }}>Bordereau signé par le magasin et par l’association</span>
        </label>

        <label className="field">
          <span>Photo du bordereau (si non scannée ci-dessus)</span>
          <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => void ajouterPhotos(e.target.files)} />
          <span className="aide">{session ? 'Archivée dans votre compte Mana (pièce justificative).' : 'Hors connexion : gardée sur cet appareil seulement — connectez-vous pour l’archiver.'}</span>
          <Pieces
            justificatifs={justificatifs}
            onChange={(liste) => {
              setJustificatifs(liste)
              if (bordereauExistant) onSave({ ...bordereauExistant, justificatifs: liste })
            }}
          />
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
        <p className="muted">Le montant « don » de votre back-office, sur une semaine, un mois ou des dates libres. C’est lui qui fixe la valeur des dons.</p>

        <label
          className={`zone-depot ${survolReleve ? 'survol' : ''} ${session && !lectureEnCours ? '' : 'inactive'}`}
          style={{ padding: '16px 14px', marginBottom: 10 }}
          onDragOver={(e) => { e.preventDefault(); if (session && !lectureEnCours) setSurvolReleve(true) }}
          onDragLeave={() => setSurvolReleve(false)}
          onDrop={(e) => { e.preventDefault(); setSurvolReleve(false); if (session && !lectureEnCours) void lireDocumentReleve(e.dataTransfer.files) }}
        >
          <input type="file" accept="image/*,application/pdf,.xlsx,.xlsm,.xls,.csv,.tsv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" disabled={!session || lectureEnCours} onChange={(e) => { void lireDocumentReleve(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
          <span className="zone-depot-icone" aria-hidden="true">📄</span>
          {!session ? (
            <>
              <strong>Connectez-vous pour déposer votre relevé</strong>
              <span className="muted">Mana lit l’export et remplit la période et le montant.</span>
            </>
          ) : lectureEnCours ? (
            <strong>Lecture en cours…</strong>
          ) : (
            <>
              <strong>Glissez ici l’export de démarque « don », ou cliquez</strong>
              <span className="muted">Excel, CSV, PDF ou photo · Mana remplit la période et le montant</span>
            </>
          )}
        </label>
        {messageReleve && <p className="muted" style={{ marginTop: -4, color: lectureReleve?.estUnReleve ? 'var(--vert)' : 'var(--ambre-texte)' }}>{messageReleve}</p>}
        {lectureReleve?.estUnReleve && lectureReleve.doutes.length > 0 && (
          <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, color: 'var(--encre-2)' }}>
            {lectureReleve.doutes.map((d) => <li key={d}>{d}</li>)}
          </ul>
        )}

        <div className="chips" style={{ marginBottom: 10 }}>
          <button type="button" className={`chip ${mode === 'semaine' ? 'active' : ''}`} onClick={() => setMode('semaine')}>Une semaine</button>
          <button type="button" className={`chip ${mode === 'mois' ? 'active' : ''}`} onClick={() => setMode('mois')}>Un mois</button>
          <button type="button" className={`chip ${mode === 'libre' ? 'active' : ''}`} onClick={() => setMode('libre')}>Dates libres</button>
        </div>

        {mode === 'semaine' && (
          <div className="semaine-nav">
            <button className="btn btn-ghost" onClick={() => setSemaineSel(addWeeksLocal(semaineSel, -1))} aria-label="Semaine précédente">‹</button>
            <div className="titre">{weekLabel(semaineSel)}<small>{etatPeriode(bordereauxDeLaPeriode.length, releveExistant.length, relevesChevauchants)}</small></div>
            <button className="btn btn-ghost" onClick={() => setSemaineSel(addWeeksLocal(semaineSel, 1))} aria-label="Semaine suivante">›</button>
          </div>
        )}
        {mode === 'mois' && (
          <div className="semaine-nav">
            <button className="btn btn-ghost" onClick={() => setMoisSel(addMois(moisSel, -1))} aria-label="Mois précédent">‹</button>
            <div className="titre" style={{ textTransform: 'capitalize' }}>
              {new Date(Date.UTC(Number(moisSel.slice(0, 4)), Number(moisSel.slice(5, 7)) - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              <small style={{ textTransform: 'none' }}>{etatPeriode(bordereauxDeLaPeriode.length, releveExistant.length, relevesChevauchants)}</small>
            </div>
            <button className="btn btn-ghost" onClick={() => setMoisSel(addMois(moisSel, 1))} aria-label="Mois suivant">›</button>
          </div>
        )}
        {mode === 'libre' && (
          <div className="colonnes-2">
            <label className="field"><span>Du</span><input type="date" value={duLibre} onChange={(e) => setDuLibre(e.target.value)} /></label>
            <label className="field"><span>Au (inclus)</span><input type="date" value={auLibre} onChange={(e) => setAuLibre(e.target.value)} /></label>
            <p className="muted" style={{ gridColumn: '1 / -1', marginTop: -6 }}>
              {periodeValide ? `${joursEntre(du, au).length} jour${joursEntre(du, au).length > 1 ? 's' : ''} · ${etatPeriode(bordereauxDeLaPeriode.length, releveExistant.length, relevesChevauchants)}` : 'La date de fin doit suivre la date de début.'}
            </p>
          </div>
        )}

        <label className="field">
          <span>Montant de la démarque « don » sur la période</span>
          <div className="suffixe">
            <input type="number" inputMode="decimal" min={0} step={1} value={montant} onChange={(e) => setMontant(e.target.value)} placeholder={mode === 'mois' ? 'Ex. 4 800' : 'Ex. 1 150'} />
            <em>€</em>
          </div>
        </label>

        <div className="colonnes-2">
          <label className="field">
            <span>Ce montant est…</span>
            <div className="chips" style={{ marginBottom: 0 }}>
              {(['ht', 'ttc'] as const).map((u) => {
                const actif = unite === u
                return (
                  <button key={u} type="button" className={`chip ${actif ? 'active' : ''}`} onClick={() => setUnite(u)}>
                    {u === 'ht' ? 'Hors taxes (HT)' : 'Toutes taxes (TTC)'}
                  </button>
                )
              })}
            </div>
          </label>
          <label className="field">
            <span>…exprimé en</span>
            <div className="chips" style={{ marginBottom: 0 }}>
              {(['pv', 'pa'] as const).map((n) => {
                const actif = nature === n
                return (
                  <button key={n} type="button" className={`chip ${actif ? 'active' : ''}`} onClick={() => setNature(n)}>
                    {n === 'pv' ? 'Prix de vente' : 'Prix d’achat (coût)'}
                  </button>
                )
              })}
            </div>
          </label>
        </div>
        {(saisiEn === 'pv_ttc' || saisiEn === 'pa_ttc') && (
          <label className="field">
            <span>Taux de TVA appliqué</span>
            <div className="suffixe" style={{ maxWidth: 160 }}>
              <input type="number" inputMode="decimal" min={0} step={0.1} value={tauxTVA} onChange={(e) => setTauxTVA(e.target.value)} />
              <em>%</em>
            </div>
            <span className="aide">5,5 % sur l’alimentaire ; 20 % sur les rares produits taxés au taux normal.</span>
          </label>
        )}
        {doutesReleve.length > 0 && (
          <div className="info-banner alerte">
            <strong>À confirmer avant d’enregistrer.</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{doutesReleve.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
        )}
        {montantNum > 0 && saisiEn && (
          <p className="muted" style={{ marginTop: -4 }}>
            Retenu pour le calcul : <strong>{fmtEUR(pvHT, 2)} en prix de vente HT</strong>
            {saisiEn !== 'pv_ht' ? ` (${fmtEUR(montantNum, 2)} ${LIBELLES_SAISI[saisiEn]}${saisiEn.endsWith('ttc') ? `, TVA ${tvaNum} %` : ''}${saisiEn.startsWith('pa') ? `, marge ${fmtPct(societe.margePct)}` : ''})` : ''}
            {' '}→ coût de revient {fmtEUR(coutEmballes(pvHT, societe.margePct), 2)}.
          </p>
        )}

        <label className="field">
          <span>Fruits &amp; légumes</span>
          <div className="chips" style={{ marginBottom: 0 }}>
            <button type="button" className={`chip ${!flInclus ? 'active' : ''}`} onClick={() => setFlInclus(false)}>Pesés sur les bordereaux</button>
            <button type="button" className={`chip ${flInclus ? 'active' : ''}`} onClick={() => setFlInclus(true)}>Inclus dans le montant</button>
          </div>
        </label>
        {!flInclus && bordereauxDeLaPeriode.length === 0 && periodeValide && (
          <label className="field">
            <span>Fruits &amp; légumes de la période (pas de bordereau enregistré)</span>
            <div className="suffixe">
              <input type="number" inputMode="decimal" min={0} step={0.5} value={kgPeriode} onChange={(e) => setKgPeriode(e.target.value)} placeholder="Ex. 55" />
              <em>kg</em>
            </div>
            <span className="aide">Si vous enregistrez des bordereaux jour par jour, leurs poids sont déjà comptés — laissez vide.</span>
          </label>
        )}

        <button className="btn btn-primary btn-block" disabled={!releveValide} style={{ opacity: releveValide ? 1 : 0.5 }} onClick={enregistrerReleve}>
          {releveExistant.length > 0 ? 'Mettre à jour le relevé de cette période' : 'Enregistrer le relevé'}
        </button>
        {confirmationReleve ? (
          <p style={{ textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
            <span className="badge vert">✓ Relevé enregistré au registre — rien d’autre à faire</span>
          </p>
        ) : releveExistant.length > 0 ? (
          <p className="muted" style={{ textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
            Relevé déjà enregistré le {fmtDate(releveExistant[0].horodatage.slice(0, 10))}. « Mettre à jour » le remplace.
          </p>
        ) : null}
      </div>

      </div>
      <aside className="saisie-col">
      {/* ============ Calendrier ============ */}
      <div className="card saisie-cal">
        <Calendrier
          mois={moisCal}
          bordereaux={bordereauxMagasin}
          releves={relevesMagasin}
          collecteurs={magasin.collecteurs}
          jourActif={jour}
          onChoisirJour={(j) => {
            setJour(j)
            setMoisCal(j.slice(0, 7))
          }}
          onChangerMois={(d) => setMoisCal(addMois(moisCal, d))}
          onSignaler={
            session
              ? async (texte) => {
                  await creerDemande(
                    compteId(session),
                    session.user.email ?? '',
                    'support',
                    `Alerte calendrier à vérifier — ${magasin.nom} (${moisCal})`,
                    { magasin: magasin.nom, magasinId: magasin.id, mois: moisCal, ecran: 'saisie/calendrier' },
                    texte,
                  )
                }
              : undefined
          }
        />
      </div>

      {/* ============ 3. Récapitulatif de la semaine ============ */}
      <div className="card accent">
        <h3>{weekLabel(semaineRecap)}</h3>
        <div className="detail-lignes">
          <div className="ligne">
            <span>Bordereaux · colis · F&amp;L</span>
            <strong>{bordereauxDeLaSemaine.length} · {colisSemaine} · {fmtNum(kgTotalSemaine, 1)} kg</strong>
          </div>
          <div className="ligne">
            <span>Coût de revient emballés</span>
            <Amount titre="Coût de revient — produits emballés" lignes={['coût_emballés = démarque_PV_HT × (1 − marge)', `= ${fmtEUR(pvSemaine, 2)} × (1 − ${fmtPct(societe.margePct)})`, `= ${fmtEUR(cEmbSemaine, 2)}`]}>
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
            <Amount titre="Base de la semaine" lignes={['base = coût_emballés + coût_FL − corrections', `= ${fmtEUR(baseSemaineTotale, 2)}`, `Réduction d’impôt correspondante (hors plafond) : 60 % × ${fmtEUR(baseSemaineTotale, 2)} = ${fmtEUR(0.6 * baseSemaineTotale, 2)}`]}>
              <strong style={{ fontSize: 18 }} className="montant-serif">{fmtEUR(baseSemaineTotale, 2)}</strong>
            </Amount>
          </div>
        </div>
        {relevesDeLaSemaine.length === 0 && bordereauxDeLaSemaine.length > 0 && (
          <p className="muted" style={{ marginTop: 10, marginBottom: 0, color: 'var(--papier)', opacity: 0.85 }}>
            Pas encore de relevé pour cette semaine : les emballés comptent 0 € en attendant.
          </p>
        )}
      </div>

      {(bordereauxDeLaSemaine.length > 0 || relevesDeLaSemaine.length > 0) && (
        <div className="card">
          <h3>Ce qui compose cette semaine</h3>
          {bordereauxDeLaSemaine.map((s) => (
            <div className="facture-ligne" key={s.id}>
              <div className="infos">
                <strong>{labelJour(s.jour!)}{s.collecteur ? ` · ${s.collecteur}` : ''}</strong>
                <small>
                  {[s.colis ? `${s.colis} colis` : '', libellePoids(s, profil), s.signe ? 'signé' : 'signature non confirmée', s.justificatifs.length ? `${s.justificatifs.length} photo${s.justificatifs.length > 1 ? 's' : ''}` : 'pas de photo'].filter(Boolean).join(' · ')}
                </small>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setJour(s.jour!); setMoisCal(s.jour!.slice(0, 7)) }}>Ouvrir</button>
            </div>
          ))}
          {relevesDeLaSemaine.map((s) => (
            <div className="facture-ligne" key={s.id}>
              <div className="infos">
                <strong>Relevé {fmtEUR(s.pvEmballes, 2)} PV HT{s.collecteur ? ` · ${s.collecteur}` : ''}</strong>
                <small>{s.note ?? (s.origine ? 'relevé de démarque' : 'saisie hebdomadaire (ancien format)')}{s.kgFL ? ` · ${fmtNum(s.kgFL, 1)} kg F&L` : ''}</small>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Supprimer cette ligne ?')) onDelete(s.id) }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Corrections : rare, donc replié derrière une ligne discrète. */}
      {(modeCorrection || corrections.length > 0 || semainePasseeCorr) && (
      <div className="card" style={modeCorrection || corrections.length > 0 ? undefined : { padding: '10px 16px' }}>
        {!modeCorrection && corrections.length === 0 ? (
          <button type="button" className="lien" style={{ fontSize: 13.5 }} onClick={() => setModeCorrection(true)}>
            Une association a refusé des produits déjà comptés cette semaine ? Enregistrer une correction
          </button>
        ) : (
          <h3 style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
            <span>Corrections — {weekLabel(semaineRecap)}</span>
            {modeCorrection && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModeCorrection(false)}>Annuler</button>}
            {!modeCorrection && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModeCorrection(true)}>+ Correction</button>}
          </h3>
        )}
        {modeCorrection && (
          <>
            <div className="info-banner">Montants <strong>en négatif</strong> (ex. −120 € ou −8 kg), avec le justificatif du refus.</div>
            <div className="colonnes-2">
              <label className="field">
                <span>Produits emballés (prix de vente HT)</span>
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
                <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Supprimer cette correction ?')) onDelete(c.id) }}>Supprimer</button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
      </aside>
      </div>
    </div>
  )
}

function addWeeksLocal(id: string, n: number): string {
  const lundi = mondayOfWeek(id)
  lundi.setUTCDate(lundi.getUTCDate() + n * 7)
  const { year, week } = isoWeekOf(lundi)
  return weekId(year, week)
}

function etatPeriode(nbBordereaux: number, nbReleve: number, chevauchants: Saisie[]): string {
  const base = `${nbBordereaux} bordereau${nbBordereaux > 1 ? 'x' : ''}`
  if (nbReleve > 0) return `${base} · relevé enregistré — modifiable`
  if (chevauchants.length > 0) {
    const r = chevauchants[0]
    const periode = r.releveDu && r.releveAu ? `du ${fmtDate(r.releveDu)} au ${fmtDate(r.releveAu)}` : r.releveMois ? `du mois ${r.releveMois}` : `de la ${r.semaine}`
    return `${base} · un relevé ${periode} recouvre en partie cette période`
  }
  return `${base} · aucun relevé`
}
