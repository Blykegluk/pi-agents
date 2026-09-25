import { jsPDF } from 'jspdf'
import type { Collecteur, Facture, Magasin, Societe } from '../types'
import { fmtDate, fmtDateHeure, fmtEUR, fmtNum, fmtPct, montantEnLettres, pdfSafe } from './format'
import { mondayOfWeek, weekLabel } from './iso'
import { baseDeLaSaisie, type AggSociete } from './selectors'
import { coutEmballes, coutFL, kgDetournes } from './calc'
import { libelleMois, moisDeLaSemaine } from './facturation'
import { denomination } from './identite'
import { resumePassages } from './annuaire'
import { profilDeMagasin } from './bordereau'
import { EDITEUR, VERSION_CONTRAT, articlesContrat } from './contrat'

const MENTION_LEGALE =
  'Mana n’est pas un conseil fiscal ; ce document est destiné à validation par votre expert-comptable.'

function t(s: string): string {
  return pdfSafe(s)
}

let logoCourant = ''

/** Charge la marque Mana dans le document : polices officielles + logo épi. */
async function marque(doc: jsPDF): Promise<void> {
  const b = await import('./brandingPdf')
  doc.addFileToVFS('YoungSerif.ttf', b.YOUNG_SERIF)
  doc.addFont('YoungSerif.ttf', 'YoungSerif', 'normal')
  doc.addFileToVFS('InstrumentSans.ttf', b.INSTRUMENT_SANS)
  doc.addFont('InstrumentSans.ttf', 'InstrumentSans', 'normal')
  doc.addFileToVFS('InstrumentSans-Gras.ttf', b.INSTRUMENT_SANS_GRAS)
  doc.addFont('InstrumentSans-Gras.ttf', 'InstrumentSans', 'bold')
  logoCourant = b.LOGO_CREME
}

function entete(doc: jsPDF, titre: string, sousTitre: string) {
  doc.setFillColor(26, 59, 46)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F')
  doc.setTextColor(255, 255, 255)
  if (logoCourant) doc.addImage(logoCourant, 'PNG', 14, 3, 7.7, 16)
  doc.setFont('YoungSerif', 'normal')
  doc.setFontSize(15)
  doc.text('mana', 26, 12)
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10.5)
  doc.text(t(titre), 26, 18.5)
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9)
  doc.text(t(sousTitre), doc.internal.pageSize.getWidth() - 14, 14, { align: 'right' })
  doc.setTextColor(43, 38, 32)
}

function piedDePage(doc: jsPDF, mention: string = MENTION_LEGALE) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFontSize(7.5)
    doc.setTextColor(120, 113, 100)
    doc.text(t(mention), 14, h - 8)
    doc.text(t(`Page ${i}/${pages}`), w - 14, h - 8, { align: 'right' })
    doc.setTextColor(43, 38, 32)
  }
}

/** Registre des dons — tableau chronologique horodaté (format paysage). */
export async function pdfRegistre(agg: AggSociete, exercice: number) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  await marque(doc)
  entete(doc, 'Registre des dons', `${denomination(agg.societe)} — Exercice ${exercice}`)

  const cols = [
    { x: 14, w: 38, label: 'Semaine' },
    { x: 52, w: 40, label: 'Magasin' },
    { x: 92, w: 24, label: 'PV emballés', right: true },
    { x: 116, w: 16, label: 'Marge', right: true },
    { x: 132, w: 26, label: 'Coût emballés', right: true },
    { x: 158, w: 16, label: 'F&L (kg)', right: true },
    { x: 174, w: 18, label: 'Coût/kg', right: true },
    { x: 192, w: 20, label: 'Coût F&L', right: true },
    { x: 212, w: 24, label: 'Base semaine', right: true },
    { x: 236, w: 30, label: 'Horodatage', right: false },
    { x: 266, w: 18, label: 'Justif.', right: true },
  ]

  let y = 32
  doc.setFontSize(8)
  doc.setFont('InstrumentSans', 'bold')
  for (const c of cols) doc.text(t(c.label), c.right ? c.x + c.w : c.x, y, c.right ? { align: 'right' } : undefined)
  doc.setFont('InstrumentSans', 'normal')
  y += 2
  doc.setDrawColor(26, 59, 46)
  doc.line(14, y, 284, y)
  y += 5

  const magasinDe = (id: string) => agg.magasins.find((m) => m.id === id)?.nom ?? '—'

  for (const s of agg.saisies) {
    if (y > 182) {
      doc.addPage()
      entete(doc, 'Registre des dons (suite)', `${denomination(agg.societe)} — Exercice ${exercice}`)
      y = 32
    }
    const enAlerte = agg.saisiesEnAlerte.has(s.id)
    const vals = [
      `${weekLabel(s.semaine)}${s.jour ? ` · ${s.jour.slice(8, 10)}/${s.jour.slice(5, 7)}` : ''}${s.type === 'correction' ? ' (corr.)' : ''}${enAlerte ? ' *' : ''}`,
      magasinDe(s.magasinId),
      fmtEUR(s.pvEmballes, 2),
      fmtPct(s.margePctAppliquee),
      fmtEUR(coutEmballes(s.pvEmballes, s.margePctAppliquee), 2),
      fmtNum(s.kgFL, 1),
      fmtEUR(s.coutKgFLApplique, 2),
      fmtEUR(coutFL(s.kgFL, s.coutKgFLApplique), 2),
      fmtEUR(baseDeLaSaisie(s), 2),
      fmtDateHeure(s.horodatage),
      String(s.justificatifs.length),
    ]
    doc.setFontSize(8)
    vals.forEach((v, i) => {
      const c = cols[i]
      doc.text(t(v), c.right ? c.x + c.w : c.x, y, c.right ? { align: 'right', maxWidth: c.w } : { maxWidth: c.w })
    })
    if (s.note) {
      y += 4
      doc.setTextColor(120, 113, 100)
      doc.text(t(`Note : ${s.note}`), 52, y, { maxWidth: 220 })
      doc.setTextColor(43, 38, 32)
    }
    y += 6
  }

  y += 2
  doc.line(14, y, 284, y)
  y += 6
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9)
  doc.text(t(`Base cumulée de l'exercice : ${fmtEUR(agg.baseBrute, 2)}`), 284, y, { align: 'right' })
  doc.setFont('InstrumentSans', 'normal')
  y += 6
  doc.setFontSize(8)
  doc.text(
    t(
      'Méthode appliquée : coût de revient = prix de vente × (1 − marge brute de la liasse fiscale) pour les produits emballés ; ' +
        'poids × coût de revient moyen au kg pour les fruits & légumes. Coefficients figés à la date de chaque saisie. ' +
        'Les lignes « (corr.) » retranchent des dons refusés par l’association.',
    ),
    14,
    y,
    { maxWidth: 270 },
  )
  if (agg.saisiesEnAlerte.size > 0) {
    y += 8
    doc.setTextColor(150, 90, 20)
    doc.text(
      t('* Volume de dons inhabituel par rapport au CA déclaré (base cumulée > 2,5 % du CA) — un justificatif complémentaire sera demandé.'),
      14,
      y,
      { maxWidth: 270 },
    )
    doc.setTextColor(43, 38, 32)
  }

  piedDePage(doc)
  doc.save(`mana-registre-${slug(denomination(agg.societe))}-${exercice}.pdf`)
}

/** Note de méthode — 1 page par magasin, datée et versionnée. */
export async function pdfNoteDeMethode(societe: Societe, magasin: Magasin, exercice: number) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  const version = magasin.versionsParametres[magasin.versionsParametres.length - 1]
  entete(doc, 'Note de méthode de valorisation', `${denomination(societe)} — ${magasin.nom}`)

  let y = 34
  const p = (txt: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    doc.setFont('InstrumentSans', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(opts?.size ?? 10)
    const lines = doc.splitTextToSize(t(txt), 182)
    doc.text(lines, 14, y)
    y += lines.length * ((opts?.size ?? 10) * 0.45) + (opts?.gap ?? 3)
  }

  p(`Version ${version?.version ?? 1} — établie le ${fmtDate(version?.date ?? magasin.creeLe)} — Exercice ${exercice}`, {
    bold: true,
    gap: 6,
  })
  p('1. Objet', { bold: true })
  p(
    'La présente note décrit la méthode de valorisation des dons de denrées alimentaires consentis par la société au sens ' +
      'de l’article 238 bis du Code général des impôts. Les biens donnés sont valorisés à leur coût de revient, ' +
      'selon une méthode constante, documentée et auditable.',
    { gap: 5 },
  )
  p('2. Produits emballés (épicerie, frais, DLC/DDM)', { bold: true })
  p(
    `Le coût de revient est obtenu en appliquant au prix de vente enregistré en démarque « don » le coefficient issu de la ` +
      `marge brute de la dernière liasse fiscale : coût de revient = prix de vente × (1 − marge brute). ` +
      `Marge brute retenue : ${fmtPct(societe.margePct)}${societe.verification.caSource ? ` — source : ${societe.verification.caSource}${societe.verification.caVerifieLe ? `, vérifiée le ${fmtDate(societe.verification.caVerifieLe)}` : ''}` : ''}. ` +
      `Par prudence, la marge est calée sur la liasse ou arrondie au-dessus (jamais en dessous), ce qui minore la base de réduction.`,
    { gap: 5 },
  )
  p('3. Fruits & légumes (don au poids)', { bold: true })
  p(
    `Les fruits et légumes sont donnés au poids global, sans détail unitaire. Ils sont valorisés au coût de revient moyen ` +
      `au kilogramme : ${fmtEUR(magasin.coutKgFL, 2)}/kg. Source : total des achats F&L annuels divisé par le tonnage acheté ` +
      `(ou échantillonnage représentatif sur deux semaines).`,
    { gap: 5 },
  )
  p('4. Constance de la méthode', { bold: true })
  p(
    'La méthode et ses coefficients sont appliqués de manière constante sur l’exercice. Tout changement de paramètre ' +
      'donne lieu à une nouvelle version de la présente note, datée, l’historique étant conservé dans le registre Mana. ' +
      'Les coefficients en vigueur à la date de chaque saisie sont figés ligne à ligne dans le registre des dons.',
    { gap: 5 },
  )
  if (magasin.versionsParametres.length > 1) {
    p('Historique des versions', { bold: true })
    for (const v of magasin.versionsParametres) {
      p(`Version ${v.version} du ${fmtDate(v.date)} — marge ${fmtPct(v.margePct)}, F&L ${fmtEUR(v.coutKgFL, 2)}/kg`, {
        size: 9,
        gap: 1.5,
      })
    }
    y += 3
  }
  p('5. Plafonnement et taux', { bold: true })
  p(
    'Les versements sont retenus dans la limite de 20 000 € ou de 0,5 % du chiffre d’affaires HT lorsque ce dernier ' +
      'montant est plus élevé, le plafond s’appréciant au niveau de la société. La réduction d’impôt est égale à 60 % ' +
      'des versements retenus ; l’excédent éventuel est reportable sur les cinq exercices suivants.',
  )

  piedDePage(doc)
  doc.save(`mana-note-methode-${slug(magasin.nom)}-v${version?.version ?? 1}.pdf`)
}

/** État annuel de valorisation — récapitulatif par société pour l'expert-comptable. */
export async function pdfEtatAnnuel(agg: AggSociete, exercice: number) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  const societe = agg.societe
  entete(doc, 'État annuel de valorisation des dons', `${denomination(societe)} — Exercice ${exercice}`)

  let y = 30
  doc.setFontSize(9)
  doc.setTextColor(120, 113, 100)
  doc.text(
    t(
      `SIREN ${societe.siren}${societe.verification.caSource ? ` — CA vérifié le ${societe.verification.caVerifieLe ? fmtDate(societe.verification.caVerifieLe) : '—'} (source : ${societe.verification.caSource})` : ''}`,
    ),
    14,
    y,
    { maxWidth: 182 },
  )
  doc.setTextColor(43, 38, 32)
  y += 10

  const ligne = (label: string, valeur: string, bold = false) => {
    doc.setFont('InstrumentSans', 'normal')
    doc.setFontSize(10)
    doc.text(t(label), 14, y)
    doc.setFont('InstrumentSans', bold ? 'bold' : 'normal')
    doc.text(t(valeur), 196, y, { align: 'right' })
    y += 7
  }

  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('Synthèse fiscale (article 238 bis du CGI)'), 14, y)
  y += 8

  const r = agg.resultat
  const rep = agg.reports
  ligne('Chiffre d’affaires HT de référence (vérifié)', fmtEUR(societe.caHT))
  ligne('Dons de l’exercice valorisés au coût de revient (total des reçus fiscaux)', fmtEUR(r.baseBrute, 2))
  ligne('Plafond annuel — max(20 000 € ; 0,5 % × CA HT)', fmtEUR(r.plafond))
  ligne('Dons de l’exercice retenus dans la limite du plafond', fmtEUR(r.basePlafonnee, 2))
  if (rep.imputeCetExercice > 0) ligne('Excédents d’exercices antérieurs imputés cette année', fmtEUR(rep.imputeCetExercice, 2))
  ligne('Base totale ouvrant droit à réduction', fmtEUR(agg.baseRetenueTotale, 2), true)
  ligne(`Réduction d’impôt sur les sociétés (60 %)`, fmtEUR(agg.reductionISTotale, 2), true)
  if (rep.nouvelExcedent > 0) ligne(`Excédent ${exercice} au-delà du plafond — à reporter (jusqu’à ${exercice + 5})`, fmtEUR(rep.nouvelExcedent, 2))
  y += 2
  ligne(`Commissions Mana facturées sur l'exercice (HT)`, fmtEUR(agg.commissionsHT, 2))
  ligne('Gain net pour la société (réduction − commissions)', fmtEUR(agg.reductionISTotale - agg.commissionsHT, 2), true)

  y += 4
  doc.setDrawColor(26, 59, 46)
  doc.line(14, y, 196, y)
  y += 8

  // --- Suivi des excédents reportables — ce que l'expert-comptable porte sur la 2069-RCI ---
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('Excédents reportables — suivi pour l’imprimé 2069-RCI'), 14, y)
  y += 6
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 113, 100)
  doc.text(
    t(
      'L’excédent de dons au-delà du plafond n’apparaît sur aucun reçu fiscal : il se suit dans la déclaration de ' +
        'l’entreprise (imprimé 2069-RCI-SD, cadre mécénat) et s’impute sur les cinq exercices suivants, dans la limite ' +
        'du plafond de chaque année, après les dons de l’année, au plus ancien d’abord. Le tableau ci-dessous tient ce ' +
        'suivi ; il se reconduit d’un état annuel à l’autre.',
    ),
    14,
    y,
    { maxWidth: 182 },
  )
  doc.setTextColor(43, 38, 32)
  y += 15
  if (rep.soldesFin.length === 0 && rep.imputeCetExercice === 0) {
    doc.setFontSize(9.5)
    doc.text(t(`Aucun excédent en stock au ${31}/12/${exercice}.`), 14, y)
    y += 8
  } else {
    const cols = [
      { x: 14, w: 34, label: 'Origine', right: false },
      { x: 48, w: 36, label: 'Excédent initial', right: true },
      { x: 84, w: 36, label: `Imputé jusqu’en ${exercice}`, right: true },
      { x: 120, w: 36, label: `Solde au 31/12/${exercice}`, right: true },
      { x: 156, w: 40, label: 'Imputable jusqu’en', right: true },
    ]
    doc.setFont('InstrumentSans', 'bold')
    doc.setFontSize(8)
    for (const c of cols) doc.text(t(c.label), c.right ? c.x + c.w : c.x, y, c.right ? { align: 'right' } : undefined)
    doc.setFont('InstrumentSans', 'normal')
    y += 2
    doc.line(14, y, 196, y)
    y += 5
    // On liste les soldes de fin, plus les origines totalement imputées cette année
    const lignesReports = [...rep.soldesFin]
    for (const d of rep.disponibles) {
      if (!lignesReports.some((x) => x.origine === d.origine)) lignesReports.push({ ...d, impute: d.initial, solde: 0 })
    }
    lignesReports.sort((a, b) => a.origine - b.origine)
    doc.setFontSize(9)
    for (const l of lignesReports) {
      const vals = [`Exercice ${l.origine}`, fmtEUR(l.initial, 2), fmtEUR(l.impute, 2), fmtEUR(l.solde, 2), String(l.expire)]
      vals.forEach((v, i) => {
        const c = cols[i]
        doc.text(t(v), c.right ? c.x + c.w : c.x, y, c.right ? { align: 'right' } : undefined)
      })
      y += 6
    }
    y += 3
  }

  doc.setDrawColor(26, 59, 46)
  doc.line(14, y, 196, y)
  y += 8

  // --- Reçus fiscaux : un par association, pour le montant qu'elle a reçu ---
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('Reçus fiscaux 2041-MEC-SD — un par organisme bénéficiaire'), 14, y)
  y += 7
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(10)
  const parCollecteur = new Map<string, number>()
  for (const sa of agg.saisies) {
    const k = sa.collecteur ?? ''
    parCollecteur.set(k, (parCollecteur.get(k) ?? 0) + baseDeLaSaisie(sa))
  }
  if (parCollecteur.size === 0) {
    doc.text(t('Aucun don enregistré sur l’exercice.'), 14, y)
    y += 7
  } else {
    for (const [nomC, montant] of [...parCollecteur.entries()].sort((a, b) => b[1] - a[1])) {
      const libelle = nomC || (agg.magasins.flatMap((m) => m.collecteurs).length === 1 ? agg.magasins.flatMap((m) => m.collecteurs)[0].nom : 'Association non précisée à la saisie')
      const lines = doc.splitTextToSize(t(`• ${libelle} — reçu attendu pour ${fmtEUR(montant, 2)} (généré prérempli par Mana, à faire signer)`), 182)
      doc.text(lines, 14, y)
      y += lines.length * 5 + 2
    }
  }

  y += 4
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('Rappel des obligations'), 14, y)
  y += 7
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9.5)
  const obligations = [
    'Faire signer à chaque association bénéficiaire le reçu fiscal 2041-MEC-SD prérempli par Mana, pour la valeur totale qu’elle a reçue.',
    'Reporter sur l’imprimé 2069-RCI joint à la liasse : dons de l’exercice, excédents antérieurs imputés, base retenue, excédent à reporter.',
    'Au-delà de 10 000 € de dons sur l’exercice : déclaration des montants, dates, bénéficiaires et contreparties ' +
      '(déclaration spécifique dématérialisée).',
    'Conserver le registre des dons, la note de méthode et les bordereaux d’enlèvement signés à l’appui de la valorisation.',
    'Obligation contractuelle : fournir à Mana la liasse fiscale du nouvel exercice sous 60 jours après son dépôt, ' +
      'pour la régularisation annuelle (plafond et marge réels).',
  ]
  for (const o of obligations) {
    const lines = doc.splitTextToSize(t(`• ${o}`), 182)
    doc.text(lines, 14, y)
    y += lines.length * 4.6 + 2
  }

  piedDePage(doc)
  doc.save(`mana-etat-annuel-${slug(denomination(societe))}-${exercice}.pdf`)
}

/** Facture (commission mensuelle, complément ou avoir) — mentions légales françaises. */
export async function pdfFacture(facture: Facture, societe: Societe) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  const estAvoir = facture.type === 'avoir'
  entete(doc, estAvoir ? `Avoir ${facture.numero}` : `Facture ${facture.numero}`, `Émise le ${fmtDate(facture.emiseLe)}`)

  let y = 34
  // Émetteur / client
  doc.setFontSize(9)
  doc.setFont('InstrumentSans', 'bold')
  doc.text(t(`${EDITEUR.denomination} ${EDITEUR.forme} — service Mana`), 14, y)
  doc.setFont('InstrumentSans', 'normal')
  doc.text(t(EDITEUR.adresse), 14, y + 5)
  doc.text(t(`${EDITEUR.rcs} — capital ${EDITEUR.capital} — TVA ${EDITEUR.tva}`), 14, y + 10)

  doc.setFont('InstrumentSans', 'bold')
  doc.text(t(denomination(societe)), 196, y, { align: 'right' })
  doc.setFont('InstrumentSans', 'normal')
  doc.text(t(`SIREN : ${societe.siren}`), 196, y + 5, { align: 'right' })
  if (facture.periode.length === 7) {
    doc.text(t(`Période : ${libelleMois(facture.periode)}`), 196, y + 10, { align: 'right' })
  } else {
    doc.text(t(`Régularisation — exercice ${facture.exercice}`), 196, y + 10, { align: 'right' })
  }
  y += 22

  // Tableau
  doc.setDrawColor(26, 59, 46)
  doc.setFillColor(233, 223, 201)
  doc.rect(14, y, 182, 8, 'F')
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9)
  doc.text('Désignation', 17, y + 5.5)
  doc.text('Montant HT', 193, y + 5.5, { align: 'right' })
  y += 8
  doc.setFont('InstrumentSans', 'normal')
  const libLines = doc.splitTextToSize(t(facture.libelle), 145)
  doc.text(libLines, 17, y + 5.5)
  doc.text(t(fmtEUR(facture.montantHT, 2)), 193, y + 5.5, { align: 'right' })
  y += libLines.length * 4.5 + 4
  doc.line(14, y, 196, y)
  y += 6

  const totaux: [string, string, boolean][] = [
    ['Total HT', fmtEUR(facture.montantHT, 2), false],
    [`TVA ${fmtNum(facture.tauxTVAPct)} %`, fmtEUR(facture.montantTVA, 2), false],
    ['Total TTC', fmtEUR(facture.montantTTC, 2), true],
  ]
  for (const [label, valeur, bold] of totaux) {
    doc.setFont('InstrumentSans', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 11 : 9.5)
    doc.text(t(label), 140, y)
    doc.text(t(valeur), 196, y, { align: 'right' })
    y += bold ? 8 : 6
  }

  y += 4
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10)
  doc.text(t('Détail du calcul (transparence)'), 14, y)
  y += 6
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9)
  for (const l of facture.detail) {
    const lines = doc.splitTextToSize(t(`• ${l}`), 182)
    // Réseau de plusieurs dizaines de magasins : le détail continue sur la page suivante.
    if (y + lines.length * 4.4 > 262) {
      doc.addPage()
      y = 20
    }
    doc.text(lines, 14, y)
    y += lines.length * 4.4 + 1.5
  }
  if (y > 225) {
    doc.addPage()
    y = 20
  }

  y += 6
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10)
  doc.text(t('Conditions de règlement'), 14, y)
  y += 6
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(8.5)
  const mentions = estAvoir
    ? ['Avoir imputable sur la prochaine facture ou remboursable sur demande.']
    : [
        'Règlement par prélèvement SEPA B2B — échéance : 30 jours à compter de la date d’émission.',
        'Pénalités de retard : taux BCE majoré de 10 points ; indemnité forfaitaire de recouvrement : 40 €.',
        'Pas d’escompte pour paiement anticipé. TVA sur les débits.',
        'La facturation cesse automatiquement lorsque la base de dons cumulée atteint le plafond fiscal de la société.',
      ]
  for (const m of mentions) {
    const lines = doc.splitTextToSize(t(`• ${m}`), 182)
    doc.text(lines, 14, y)
    y += lines.length * 4.2 + 1.5
  }

    // Conditions de paiement et coordonnées bancaires
  y += 6
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9)
  doc.text(t('Règlement'), 14, y)
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(8.5)
  doc.text(
    t(
      `Payable à 30 jours par prélèvement SEPA (mandat signé) ou par virement : IBAN ${EDITEUR.iban} — BIC ${EDITEUR.bic} (${EDITEUR.banque}). ` +
        'Pénalités de retard : trois fois le taux d’intérêt légal ; indemnité forfaitaire de recouvrement : 40 € (art. L. 441-10 et D. 441-5 du code de commerce). Pas d’escompte pour paiement anticipé.',
    ),
    14,
    y + 5,
    { maxWidth: 182 },
  )
  piedDePage(doc, EDITEUR.mention)
  doc.save(`${facture.numero.toLowerCase()}-${slug(denomination(societe))}.pdf`)
}

/** Affiche A4 « Le bac don — règles de tri » à imprimer pour la réserve. */
/** Résumé consolidé du groupe : une ligne par société, totaux, impact — pour la holding et l'expert-comptable. */
export async function pdfResumeGroupe(aggs: AggSociete[], exercice: number) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  await marque(doc)
  entete(doc, 'Résumé du groupe — dons d’invendus', `${aggs.length} sociétés — Exercice ${exercice} — édité le ${fmtDate(new Date().toISOString().slice(0, 10))}`)
  const W = doc.internal.pageSize.getWidth()
  let y = 32
  doc.setFontSize(9)
  doc.setTextColor(120, 113, 100)
  doc.text(t('Le plafond de dons (20 000 € ou 0,5 % du CA HT) s’apprécie société par société. Réduction d’impôt : 60 % du coût de revient des denrées données (article 238 bis du CGI). Commission Mana : 30 % de la réduction acquise, charge déductible.'), 14, y, { maxWidth: W - 28 })
  doc.setTextColor(43, 38, 32)
  y += 12
  const cols = [
    { x: 14, w: 58, label: 'Société', right: false },
    { x: 72, w: 26, label: 'Magasins', right: false },
    { x: 98, w: 28, label: 'Base de dons', right: true },
    { x: 126, w: 24, label: 'Plafond', right: true },
    { x: 150, w: 28, label: 'Réduction d’IS', right: true },
    { x: 178, w: 28, label: 'Commission HT', right: true },
    { x: 206, w: 26, label: 'Facturé HT', right: true },
    { x: 232, w: 30, label: 'Résultat net*', right: true },
    { x: 262, w: 21, label: 'Repas', right: true },
  ]
  const enTeteTableau = () => {
    doc.setFillColor(237, 227, 204)
    doc.rect(14, y - 4.5, W - 28, 7, 'F')
    doc.setFont('InstrumentSans', 'bold')
    doc.setFontSize(8)
    for (const c of cols) doc.text(t(c.label), c.right ? c.x + c.w : c.x, y, c.right ? { align: 'right' } : undefined)
    doc.setFont('InstrumentSans', 'normal')
    y += 7
  }
  enTeteTableau()
  doc.setFontSize(8.5)
  const cellule = (i: number, texte: string, gras = false) => {
    const c = cols[i]
    doc.setFont('InstrumentSans', gras ? 'bold' : 'normal')
    doc.text(t(texte), c.right ? c.x + c.w : c.x, y, { align: c.right ? 'right' : 'left', maxWidth: c.w - 1 })
  }
  const tot = { base: 0, reduction: 0, commission: 0, facture: 0, avantage: 0, repas: 0, kg: 0, co2: 0 }
  for (const a of aggs) {
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      y = 20
      enTeteTableau()
    }
    const r = a.resultat
    cellule(0, denomination(a.societe))
    cellule(1, a.magasins.map((m) => m.nom).join(', ') || '—')
    cellule(2, fmtEUR(r.baseBrute, 0))
    cellule(3, fmtEUR(r.plafond, 0))
    cellule(4, fmtEUR(a.reductionISTotale, 0), true)
    cellule(5, fmtEUR(r.factureMana, 0))
    cellule(6, fmtEUR(a.commissionsHT, 0))
    cellule(7, fmtEUR(r.avantageReel, 0), true)
    cellule(8, fmtNum(a.repas, 0))
    tot.base += r.baseBrute; tot.reduction += a.reductionISTotale; tot.commission += r.factureMana; tot.facture += a.commissionsHT; tot.avantage += r.avantageReel; tot.repas += a.repas; tot.kg += a.kgTotal; tot.co2 += a.co2
    y += 7
    doc.setDrawColor(226, 215, 192)
    doc.line(14, y - 3, W - 14, y - 3)
  }
  doc.setFillColor(35, 79, 62)
  doc.rect(14, y - 4.5, W - 28, 7.5, 'F')
  doc.setTextColor(248, 243, 233)
  cellule(0, 'Total groupe', true)
  cellule(1, `${aggs.reduce((n, a) => n + a.magasins.length, 0)} magasins`)
  cellule(2, fmtEUR(tot.base, 0), true)
  cellule(4, fmtEUR(tot.reduction, 0), true)
  cellule(5, fmtEUR(tot.commission, 0), true)
  cellule(6, fmtEUR(tot.facture, 0), true)
  cellule(7, fmtEUR(tot.avantage, 0), true)
  cellule(8, fmtNum(tot.repas, 0), true)
  doc.setTextColor(43, 38, 32)
  y += 14
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(120, 113, 100)
  doc.text(t(`* Résultat net après impôt (IS à 25 %), par rapport à la destruction : pour chaque société sur sa ligne, pour le groupe sur la ligne Total. Calcul : (60 % − 25 %) × base retenue − 75 % × commission Mana. Jeter est déductible, donner est réintégré ; la commission est une charge déductible. PME au taux réduit de 15 % : résultat net plus élevé.`), 14, y, { maxWidth: W - 28 })
  y += 10
  doc.text(t(`Impact du groupe : ${fmtNum(tot.kg, 0)} kg détournés de la poubelle, ${fmtNum(tot.repas, 0)} repas, ${fmtNum(tot.co2, 0)} kg de CO₂ évités. En intégration fiscale, la société mère impute la réduction de chaque filiale sur l’IS du groupe (article 223 O du CGI).`), 14, y, { maxWidth: W - 28 })
  doc.setTextColor(43, 38, 32)
  piedDePage(doc)
  doc.save(`mana-resume-groupe-${exercice}.pdf`)
}

/** Affiche « tri des invendus » à imprimer pour la réserve du magasin. */
export async function pdfAfficheTri(nomMagasin: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  doc.setFillColor(26, 59, 46)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setTextColor(255, 255, 255)
  if (logoCourant) doc.addImage(logoCourant, 'PNG', 18, 6, 13, 27)
  doc.setFont('YoungSerif', 'normal')
  doc.setFontSize(26)
  doc.text(t('LE BAC « DON »'), 105, 18, { align: 'center' })
  doc.setFontSize(12)
  doc.setFont('InstrumentSans', 'normal')
  doc.text(t(`${nomMagasin} — pendant la tournée DLC, au lieu de la poubelle`), 105, 28, { align: 'center' })
  doc.setTextColor(43, 38, 32)

  let y = 52
  const bloc = (titre: string, items: string[], vert: boolean) => {
    doc.setFont('InstrumentSans', 'bold')
    doc.setFontSize(15)
    if (vert) doc.setTextColor(26, 59, 46)
    else doc.setTextColor(150, 45, 30)
    doc.text(t(titre), 16, y)
    doc.setTextColor(43, 38, 32)
    y += 8
    doc.setFont('InstrumentSans', 'normal')
    doc.setFontSize(11.5)
    for (const i of items) {
      // Pas de ✓/✗ : les polices PDF standard (WinAnsi) ne les contiennent pas
      const lines = doc.splitTextToSize(t(`•  ${i}`), 178)
      doc.text(lines, 18, y)
      y += lines.length * 5.6 + 1.8
    }
    y += 6
  }

  bloc('ON DONNE', [
    'Produits à DLC du jour, de demain ou d’après-demain (« à consommer jusqu’au ») — donnables jusqu’à la date incluse. DLC du jour : l’association distribue le jour même.',
    'DDM dépassée (« à consommer de préférence avant ») : biscuits, conserves, épicerie — donnables sans limite stricte.',
    'Fruits & légumes moches, tachés, mûrs — mais sains.',
    'Pain de la veille, emballages abîmés mais intacts (boîte cabossée, carton déchiré).',
  ], true)

  bloc('ON NE DONNE JAMAIS', [
    'DLC dépassée — dès le lendemain de la date. C’est la règle d’or.',
    'Produits entamés, déconditionnés ou sans étiquette.',
    'Chaîne du froid rompue (produit resté hors frigo).',
    'Alcool.',
  ], false)

  doc.setFillColor(243, 228, 198)
  doc.roundedRect(14, y, 182, 30, 3, 3, 'F')
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('Les 3 gestes'), 20, y + 8)
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(10.5)
  doc.text(t('1. Scanner la démarque avec le motif « DON » (comme d’habitude).'), 20, y + 15)
  doc.text(t('2. Poser dans le bac ou le sac « don » — frais au froid (0–4 °C) jusqu’au passage du collecteur.'), 20, y + 21)
  doc.text(t('3. F&L : peser chaque cagette ou sac, noter le poids sur le bordereau.'), 20, y + 27)

  doc.setFontSize(8.5)
  doc.setTextColor(120, 113, 100)
  doc.text(t('Généré par Mana — mana, la manne cachée de vos invendus'), 105, 288, { align: 'center' })
  doc.save(`mana-affiche-tri-${slug(nomMagasin)}.pdf`)
}

/**
 * Bordereau d'enlèvement vierge — preuve de remise signée à chaque passage.
 * Deux circuits distincts, alignés sur la méthode de valorisation Mana :
 * les emballés se COMPTENT (leur valeur vient de la démarque scannée),
 * les fruits & légumes se PÈSENT (leur valeur vient du poids).
 */
export async function pdfBordereau(magasin: Magasin, raisonSociale: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  entete(doc, 'Bordereau d’enlèvement de denrées', `${raisonSociale} — ${magasin.nom}`)

  let y = 32
  doc.setFontSize(10)
  const champ = (label: string, finX: number, x: number, valeur?: string) => {
    doc.setFont('InstrumentSans', 'normal')
    doc.setFontSize(10)
    doc.text(t(label), x, y)
    const debut = x + doc.getTextWidth(t(label)) + 2
    if (valeur) {
      doc.setFont('InstrumentSans', 'bold')
      doc.text(t(valeur), debut, y)
      doc.setFont('InstrumentSans', 'normal')
    }
    doc.setDrawColor(180, 172, 155)
    doc.line(debut + (valeur ? doc.getTextWidth(t(valeur)) + 2 : 0), y + 0.5, finX, y + 0.5)
  }
  // Un seul collecteur pour ce magasin (cas d'une collecte quotidienne confiée
  // à une seule association) : on préremplit, ça évite de l'écrire chaque jour.
  const seulCollecteur = magasin.collecteurs.length === 1 ? magasin.collecteurs[0].nom : undefined
  champ('Date :', 88, 14)
  champ('Heure :', 196, 110)
  y += 9
  champ('Association bénéficiaire :', 196, 14, seulCollecteur)
  y += 9
  champ('Nom du collecteur :', 196, 14)
  y += 9

  // Rappel de la méthode : ce bordereau prouve la remise, il ne valorise pas
  doc.setFillColor(243, 228, 198)
  doc.roundedRect(14, y, 182, 17, 2, 2, 'F')
  doc.setFontSize(8.5)
  const profil = profilDeMagasin(magasin)
  const auKilo = profil.categories.filter((c) => c.valorisation === 'cout_kg').map((c) => c.libelle.toLowerCase())
  doc.text(
    t(
      'Ce bordereau atteste la remise : il ne fixe pas la valeur fiscale. ' +
        (auKilo.length > 0
          ? `Dans ce magasin, la valeur vient du relevé de démarque pour tout ce qui a été scanné, et du poids pour ${auKilo.join(', ')} (la pesée ci-dessous fait foi pour ces catégories).`
          : 'Dans ce magasin, tout est pesé puis scanné en démarque : la valeur de tous les produits, emballés ou pesés, vient du relevé du back-office. Les colis et les poids ci-dessous sont la preuve et le tonnage.'),
    ),
    17,
    y + 5,
    { maxWidth: 176 },
  )
  y += 24

  // Section 1 — colis remis (comptage)
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('1. Colis remis (produits emballés)'), 14, y)
  y += 8
  champ('Nombre de colis remis (bacs, cartons ou sacs) :', 112, 14)
  champ('Poids indicatif (kg) :', 196, 120)
  y += 9
  champ('Produits refusés / remarques :', 196, 14)
  y += 12

  // Section 2 — poids par catégorie (selon le profil du magasin)
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t(`2. Poids par catégorie (net, en kg) : ${profil.categories.map((c) => c.libelle.toLowerCase()).join(', ')}`), 14, y)
  y += 5
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(120, 113, 100)
  doc.text(
    t('Sac : pesez et notez directement en net (tare nulle). Cagette ou bac : notez le brut, la tare du contenant (~1 kg pour une cagette bois), et le net. Une ligne par catégorie, plusieurs contenants s’additionnent.'),
    14,
    y,
    { maxWidth: 182 },
  )
  doc.setTextColor(43, 38, 32)
  y += 9
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9)
  doc.setFillColor(233, 223, 201)
  doc.rect(14, y, 182, 8, 'F')
  doc.text(t('Catégorie'), 17, y + 5.5)
  doc.text(t('Poids brut (kg)'), 92, y + 5.5)
  doc.text(t('Tare (kg)'), 130, y + 5.5)
  doc.text(t('Poids net (kg)'), 160, y + 5.5)
  y += 8
  doc.setFont('InstrumentSans', 'normal')
  const lignesPesee = [...profil.categories.map((c) => (c.preciser ? `${c.libelle} (préciser) : ` : c.libelle)), '']
  for (const libelle of lignesPesee) {
    doc.setDrawColor(210, 200, 180)
    doc.rect(14, y, 182, 9)
    doc.line(88, y, 88, y + 9)
    doc.line(126, y, 126, y + 9)
    doc.line(156, y, 156, y + 9)
    doc.text(t(libelle), 17, y + 6)
    y += 9
  }
  y += 7
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10.5)
  doc.text(t('Total net F&L : ______________ kg   →  à reporter dans la saisie Mana de la semaine'), 14, y)
  y += 13

  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10)
  doc.text(t('Signature du magasin'), 30, y)
  doc.text(t('Signature du collecteur'), 130, y)
  doc.setDrawColor(180, 172, 155)
  doc.rect(14, y + 3, 80, 26)
  doc.rect(114, y + 3, 82, 26)
  y += 37

  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(8.5)
  doc.text(
    t(
      'Conservez ce bordereau (photo à joindre à la saisie Mana) : il appuie le registre des dons et le reçu fiscal ' +
        '2041-MEC-SD délivré par l’association en fin d’exercice. Rappel : jamais de DLC dépassée ; DDM dépassée ' +
        'donnable ; frais maintenu à 0–4 °C jusqu’à l’enlèvement.',
    ),
    14,
    y,
    { maxWidth: 182 },
  )

  piedDePage(doc, 'Bordereau généré par Mana — à faire signer à chaque passage du collecteur.')
  doc.save(`mana-bordereau-${slug(magasin.nom)}.pdf`)
}

/**
 * Modèle d'attestation CA & marge à faire compléter et signer par
 * l'expert-comptable — une seule demande, les deux valeurs.
 */
export async function pdfModeleAttestation(raisonSociale?: string, siren?: string, exercice?: number) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  entete(doc, 'Attestation de chiffre d’affaires et de marge brute', 'Modèle à compléter par l’expert-comptable')

  let y = 38
  const p = (txt: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    doc.setFont('InstrumentSans', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(opts?.size ?? 11)
    const lines = doc.splitTextToSize(t(txt), 182)
    doc.text(lines, 14, y)
    y += lines.length * ((opts?.size ?? 11) * 0.5) + (opts?.gap ?? 4)
  }
  const champ = (label: string) => {
    doc.setFont('InstrumentSans', 'normal')
    doc.setFontSize(11)
    doc.text(t(label), 14, y)
    doc.setDrawColor(150, 143, 128)
    doc.line(14 + doc.getTextWidth(t(label)) + 3, y + 0.8, 196, y + 0.8)
    y += 11
  }

  p('Je soussigné(e) :', { gap: 1 })
  champ('Nom, cabinet :')
  p('expert-comptable inscrit(e) à l’Ordre des experts-comptables, atteste que, d’après la comptabilité et la ' +
    'dernière liasse fiscale de la société :', { gap: 1 })
  champ(`Raison sociale : ${raisonSociale ?? ''}`)
  champ(`SIREN : ${siren ?? ''}`)
  champ(`Exercice clos le : ${exercice ? `31/12/${exercice - 1}` : ''}`)
  y += 2
  p('les valeurs suivantes sont exactes :', { bold: true, gap: 6 })
  champ('1. Chiffre d’affaires hors taxes de l’exercice :                                              € HT')
  champ('2. Taux de marge brute (marge commerciale / chiffre d’affaires HT) :                %')
  y += 2
  p(
    'Cette attestation est établie à la demande de la société pour la mise en œuvre de la réduction d’impôt ' +
      'mécénat prévue à l’article 238 bis du CGI (valorisation des dons de denrées au coût de revient et calcul du ' +
      'plafond de versements de 20 000 € ou 0,5 % du chiffre d’affaires). Ces valeurs servent de référence constante ' +
      'pour l’exercice en cours, jusqu’à production de la liasse fiscale suivante.',
    { size: 10, gap: 8 },
  )
  champ('Fait à :                                                      Le :')
  y += 4
  doc.setFont('InstrumentSans', 'bold')
  doc.text(t('Signature et cachet du cabinet'), 14, y)
  doc.setDrawColor(150, 143, 128)
  doc.rect(14, y + 4, 90, 32)

  y += 46
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120, 113, 100)
  doc.text(
    t('Une fois signée, téléversez cette attestation dans Mana (onglet Magasins → votre société → justificatif) : ' +
      'elle déverrouille la saisie du CA et de la marge, calcule votre plafond de dons et date la vérification.'),
    14,
    y,
    { maxWidth: 182 },
  )
  doc.setTextColor(43, 38, 32)

  piedDePage(doc, 'Modèle fourni par Mana — l’attestation engage son signataire, pas Mana.')
  doc.save(`mana-modele-attestation-ca-marge${raisonSociale ? '-' + slug(raisonSociale) : ''}.pdf`)
}

function slug(s: string): string {
  return s
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/* ------------------------------------------------------------------ *
 * Reçu fiscal de mécénat — article 238 bis du CGI
 *
 * Modèle conforme au formulaire 2041-MEC-SD (Cerfa n° 16216*03). Le BOFiP
 * admet un document de forme différente dès lors qu'il porte les mêmes
 * mentions que le modèle officiel. Mana préremplit tout ce qu'il connaît
 * (donateur, valeur au coût de revient, période, description des biens) ;
 * l'organisme bénéficiaire complète son bloc, date et signe — c'est lui qui
 * délivre le reçu. La note 5 du formulaire prévoit expressément que
 * l'organisme reporte la valeur des dons en nature indiquée par l'entreprise.
 * ------------------------------------------------------------------ */

/** Trait pointillé à compléter à la main. */
function ligneAComplerer(doc: jsPDF, label: string, x: number, y: number, finX: number, valeur?: string) {
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9.5)
  doc.text(t(label), x, y)
  const debut = x + doc.getTextWidth(t(label)) + 2
  if (valeur) {
    doc.setFont('InstrumentSans', 'bold')
    doc.text(t(valeur), debut, y)
    doc.setFont('InstrumentSans', 'normal')
  }
  doc.setDrawColor(190, 182, 165)
  doc.setLineDashPattern([0.6, 0.9], 0)
  doc.line(debut + (valeur ? doc.getTextWidth(t(valeur)) + 2 : 0), y + 1, finX, y + 1)
  doc.setLineDashPattern([], 0)
}

/** Titre de rubrique sur fond vert, comme les rubriques du Cerfa. */
function rubrique(doc: jsPDF, titre: string, y: number): number {
  doc.setFillColor(26, 59, 46)
  doc.rect(14, y, 182, 6.6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9.5)
  doc.text(t(titre), 17, y + 4.6)
  doc.setTextColor(43, 38, 32)
  doc.setFont('InstrumentSans', 'normal')
  return y + 11
}

function caseACocher(doc: jsPDF, texte: string, x: number, y: number, largeur: number): number {
  doc.setDrawColor(120, 113, 100)
  doc.rect(x, y - 2.6, 3.2, 3.2)
  doc.setFontSize(8.5)
  const lignes = doc.splitTextToSize(t(texte), largeur - 6)
  doc.text(lignes, x + 5.5, y)
  return y + lignes.length * 3.9 + 2
}

/**
 * Un reçu par organisme bénéficiaire : chaque association atteste de ce qu'elle
 * a reçu, elle. `collecteur` restreint aux saisies attribuées à cette
 * association ; sans argument, le reçu couvre toutes les saisies (cas d'un
 * seul collecteur). Le montant est la valeur TOTALE remise — le plafond de
 * l'article 238 bis et le report de l'excédent sont l'affaire de l'entreprise
 * (imprimé 2069-RCI), jamais du reçu.
 */
export async function pdfRecuFiscal(agg: AggSociete, exercice: number, collecteur?: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  const societe = agg.societe
  const nom = denomination(societe)
  const saisies = collecteur ? agg.saisies.filter((s) => (s.collecteur ?? '') === collecteur) : agg.saisies
  const valeur = saisies.reduce((t, s) => t + baseDeLaSaisie(s), 0)
  const sousTitre = `${nom} — Exercice ${exercice}${collecteur ? ` — ${collecteur}` : ''}`
  entete(doc, 'Reçu de dons — article 238 bis du CGI', sousTitre)

  let y = 28
  doc.setFontSize(8)
  doc.setTextColor(120, 113, 100)
  doc.text(
    t(
      'Modèle conforme au formulaire 2041-MEC-SD (Cerfa n° 16216*03). L’administration admet un document dont la forme ' +
        'diffère du formulaire dès lors qu’il comporte les mêmes mentions. Reçu délivré, daté et signé par l’organisme bénéficiaire.',
    ),
    14,
    y,
    { maxWidth: 182 },
  )
  doc.setTextColor(43, 38, 32)
  y += 8
  ligneAComplerer(doc, 'Numéro d’ordre du reçu :', 14, y, 90)
  y += 7

  // --- Organisme bénéficiaire : complété par l'association (nom prérempli si connu) ---
  y = rubrique(doc, 'Organisme bénéficiaire des dons et versements  (à compléter par l’organisme)', y)
  const ficheAsso = collecteur ? agg.magasins.flatMap((m) => m.collecteurs).find((c) => c.nom === collecteur) : undefined
  ligneAComplerer(doc, 'Dénomination :', 14, y, 196, collecteur)
  y += 7
  ligneAComplerer(doc, 'Numéro SIREN ou RNA :', 14, y, 100, ficheAsso?.siren || ficheAsso?.rna || undefined)
  ligneAComplerer(doc, 'Objet :', 104, y, 196)
  y += 7
  ligneAComplerer(doc, 'Adresse — N° :', 14, y, 70)
  ligneAComplerer(doc, 'Rue :', 74, y, 196)
  y += 7
  ligneAComplerer(doc, 'Code postal :', 14, y, 62)
  ligneAComplerer(doc, 'Commune :', 66, y, 160)
  ligneAComplerer(doc, 'Pays :', 164, y, 196)
  y += 8
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9)
  doc.text(t('Nature de l’organisme — cochez la case qui vous concerne :'), 14, y)
  doc.setFont('InstrumentSans', 'normal')
  y += 5
  y = caseACocher(
    doc,
    'Organisme sans but lucratif fournissant gratuitement une aide alimentaire, des soins médicaux ou des produits ' +
      'de première nécessité à des personnes en difficulté, ou favorisant leur logement.',
    16,
    y,
    182,
  )
  y = caseACocher(
    doc,
    'Œuvre ou organisme d’intérêt général ayant un caractère philanthropique, éducatif, scientifique, social, ' +
      'humanitaire, sportif, familial ou culturel — association loi 1901.',
    16,
    y,
    182,
  )
  y = caseACocher(
    doc,
    'Association ou fondation reconnue d’utilité publique, fonds de dotation, ou autre catégorie prévue à ' +
      'l’article 238 bis du CGI (préciser) : ……………………………………………………………………………………………',
    16,
    y,
    182,
  )
  y += 0.5

  // --- Entreprise donatrice : identité lue au registre national ---
  const v = societe.verification
  y = rubrique(doc, 'Entreprise donatrice  (identité du registre national, préremplie par Mana)', y)
  ligneAComplerer(doc, 'Dénomination :', 14, y, 130, nom)
  ligneAComplerer(doc, 'Forme juridique :', 134, y, 196, v.formeJuridique)
  y += 7
  ligneAComplerer(doc, 'Numéro SIREN :', 14, y, 90, societe.siren || undefined)
  y += 7
  ligneAComplerer(doc, 'Adresse :', 14, y, 196, v.adresseSiege?.voie)
  y += 7
  ligneAComplerer(doc, 'Code postal :', 14, y, 62, v.adresseSiege?.codePostal)
  ligneAComplerer(doc, 'Commune :', 66, y, 196, v.adresseSiege?.commune)
  y += 8

  // --- Dons et versements ---
  y = rubrique(doc, 'Dons et versements effectués par l’entreprise', y)
  doc.setFontSize(9.5)
  doc.text(
    t(
      'L’organisme bénéficiaire reconnaît avoir reçu, au titre de la réduction d’impôt prévue à l’article 238 bis du ' +
        'code général des impôts, des dons en nature pour une valeur en euros égale à :',
    ),
    14,
    y,
    { maxWidth: 182 },
  )
  y += 10
  doc.setFillColor(243, 228, 198)
  doc.roundedRect(14, y - 5.5, 74, 10, 2, 2, 'F')
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(13)
  doc.text(t(`${fmtEUR(valeur, 2)}`), 51, y + 1.2, { align: 'center' })
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9.5)
  y += 9
  doc.text(t('Valeur totale des dons en nature en toutes lettres :'), 14, y)
  y += 5
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9.5)
  doc.text(t(montantEnLettres(valeur)), 14, y, { maxWidth: 182 })
  doc.setFont('InstrumentSans', 'normal')
  y += 8

  doc.text(t('Description exhaustive des biens reçus et acceptés (nature et quantité) :'), 14, y, { maxWidth: 182 })
  y += 5
  doc.setFontSize(9)
  doc.text(
    t(
      'Denrées alimentaires invendues et consommables (produits emballés et fruits & légumes) remises à chaque ' +
        'enlèvement contre bordereau signé. Description détaillée : voir l’annexe jointe au présent reçu, établie à ' +
        'partir du registre des dons horodaté (note 7 du formulaire 2041-MEC-SD).',
    ),
    14,
    y,
    { maxWidth: 182 },
  )
  y += 12
  doc.setFontSize(9.5)
  doc.text(t('Versements en numéraire de l’entreprise : néant.'), 14, y)
  y += 7

  doc.setFont('InstrumentSans', 'bold')
  doc.text(t(`Montant total des dons et versements reçus par l’organisme : ${fmtEUR(valeur, 2)}`), 14, y)
  y += 5.5
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9)
  doc.text(t(`Soit, en toutes lettres : ${montantEnLettres(valeur)}`), 14, y, { maxWidth: 182 })
  y += 8
  doc.setFontSize(9.5)
  // Période réelle des dons : du premier au dernier enlèvement (bordereau daté, sinon semaine de la saisie), bornée à l'exercice.
  const bornes = saisies.reduce<{ debut: Date | null; fin: Date | null }>(
    (acc, s) => {
      const lundi = mondayOfWeek(s.semaine)
      const dimanche = new Date(lundi)
      dimanche.setUTCDate(lundi.getUTCDate() + 6)
      const d = s.jour ? new Date(`${s.jour}T00:00:00Z`) : s.releveDu ? new Date(`${s.releveDu}T00:00:00Z`) : lundi
      const f = s.jour ? new Date(`${s.jour}T00:00:00Z`) : s.releveAu ? new Date(`${s.releveAu}T00:00:00Z`) : dimanche
      return { debut: !acc.debut || d < acc.debut ? d : acc.debut, fin: !acc.fin || f > acc.fin ? f : acc.fin }
    },
    { debut: null, fin: null },
  )
  const borneMin = new Date(Date.UTC(exercice, 0, 1))
  const borneMax = new Date(Date.UTC(exercice, 11, 31))
  const debutPeriode = bornes.debut && bornes.debut > borneMin ? bornes.debut : borneMin
  const finPeriode = bornes.fin && bornes.fin < borneMax ? bornes.fin : borneMax
  const jj = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
  doc.text(t(`Période au cours de laquelle les dons ont été effectués : du ${jj(debutPeriode)} au ${jj(finPeriode)} (exercice ${exercice}).`), 14, y)
  y += 6

  // --- Date et signature ---
  y = rubrique(doc, 'Date et signature de l’organisme bénéficiaire', y)
  ligneAComplerer(doc, 'Fait à :', 14, y, 90)
  ligneAComplerer(doc, 'Le :', 96, y, 150)
  y += 5
  doc.setFontSize(8.5)
  doc.text(t('Signature et cachet de l’organisme bénéficiaire'), 14, y + 3.5)
  doc.setDrawColor(180, 172, 155)
  doc.rect(14, y + 5, 90, 20)

  doc.setFontSize(7.5)
  doc.setTextColor(120, 113, 100)
  doc.text(
    t(
      'Note 5 du formulaire 2041-MEC-SD : l’organisme bénéficiaire des dons en nature reporte sur le reçu fiscal le ' +
        'montant indiqué par l’entreprise donatrice. Ce montant est la valeur au coût de revient calculée par Mana ' +
        'et justifiée par le registre des dons et la note de méthode.',
    ),
    110,
    y + 8.5,
    { maxWidth: 86 },
  )
  doc.setTextColor(43, 38, 32)

  // ------------------------------------------------------------------
  // Annexe — description exhaustive des biens remis (note 7)
  // ------------------------------------------------------------------
  doc.addPage()
  entete(doc, 'Annexe au reçu fiscal — description des biens remis', sousTitre)
  y = 30
  doc.setFontSize(9)
  doc.setTextColor(120, 113, 100)
  doc.text(
    t(
      'Annexe prévue par la note 7 du formulaire 2041-MEC-SD. Récapitulatif mensuel établi à partir du registre des ' +
        'dons horodaté de Mana. Produits emballés : valeur au coût de revient issue de la démarque scannée en magasin ' +
        '(nombre de colis sur les bordereaux signés). Fruits & légumes : poids pesé à l’enlèvement, valorisé au coût ' +
        'moyen du kilo — ou inclus dans la valeur scannée lorsque le magasin ne les pèse pas séparément.',
    ),
    14,
    y,
    { maxWidth: 182 },
  )
  doc.setTextColor(43, 38, 32)
  y += 18

  // Regroupement par mois (un enlèvement quotidien ferait 365 lignes)
  const parMois = new Map<string, { emballes: number; kgFL: number; coutFLm: number; total: number; inclus: boolean }>()
  for (const s of saisies) {
    const mois = moisDeLaSemaine(s.semaine)
    const e = parMois.get(mois) ?? { emballes: 0, kgFL: 0, coutFLm: 0, total: 0, inclus: false }
    e.emballes += coutEmballes(s.pvEmballes, s.margePctAppliquee)
    e.kgFL += s.kgFL
    e.coutFLm += coutFL(s.kgFL, s.coutKgFLApplique)
    e.total += baseDeLaSaisie(s)
    if (s.flInclus) e.inclus = true
    parMois.set(mois, e)
  }

  const cols = [
    { x: 14, w: 36, label: 'Période', right: false },
    { x: 50, w: 44, label: 'Produits emballés (€)', right: true },
    { x: 94, w: 30, label: 'F&L pesés (kg)', right: true },
    { x: 124, w: 34, label: 'F&L (€)', right: true },
    { x: 158, w: 38, label: 'Total coût de revient (€)', right: true },
  ]
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(8)
  for (const c of cols) doc.text(t(c.label), c.right ? c.x + c.w : c.x, y, c.right ? { align: 'right', maxWidth: c.w } : { maxWidth: c.w })
  doc.setFont('InstrumentSans', 'normal')
  y += 2
  doc.setDrawColor(26, 59, 46)
  doc.line(14, y, 196, y)
  y += 5

  const mois = [...parMois.keys()].sort()
  let totEmb = 0
  let totKg = 0
  let totFL = 0
  for (const m of mois) {
    const e = parMois.get(m)!
    totEmb += e.emballes
    totKg += e.kgFL
    totFL += e.coutFLm
    const vals = [
      libelleMois(m),
      fmtEUR(e.emballes, 2) + (e.inclus ? ' *' : ''),
      e.kgFL > 0 ? fmtNum(e.kgFL, 1) : '—',
      e.coutFLm > 0 ? fmtEUR(e.coutFLm, 2) : '—',
      fmtEUR(e.total, 2),
    ]
    doc.setFontSize(8.5)
    vals.forEach((val, i) => {
      const c = cols[i]
      doc.text(t(val), c.right ? c.x + c.w : c.x, y, c.right ? { align: 'right', maxWidth: c.w } : { maxWidth: c.w })
    })
    y += 6
  }
  doc.setDrawColor(26, 59, 46)
  doc.line(14, y - 3.5, 196, y - 3.5)
  y += 1
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9)
  doc.text(t(`Total exercice ${exercice}`), 14, y)
  doc.text(t(fmtEUR(totEmb, 2)), 94, y, { align: 'right' })
  doc.text(t(totKg > 0 ? fmtNum(totKg, 1) : '—'), 124, y, { align: 'right' })
  doc.text(t(totFL > 0 ? fmtEUR(totFL, 2) : '—'), 158, y, { align: 'right' })
  doc.text(t(fmtEUR(valeur, 2)), 196, y, { align: 'right' })
  doc.setFont('InstrumentSans', 'normal')
  y += 7
  if ([...parMois.values()].some((e) => e.inclus)) {
    doc.setFontSize(8)
    doc.setTextColor(120, 113, 100)
    doc.text(t('* Fruits & légumes inclus dans la valeur scannée pour tout ou partie du mois (pas de pesée séparée).'), 14, y)
    doc.setTextColor(43, 38, 32)
    y += 6
  }
  y += 4

  doc.setFillColor(243, 228, 198)
  doc.roundedRect(14, y, 182, 15, 2, 2, 'F')
  doc.setFontSize(8.5)
  doc.text(
    t(
      'Le présent reçu atteste de la valeur totale reçue par l’organisme. La limite de l’article 238 bis ' +
        '(20 000 € ou 0,5 % du CA HT) et le report sur cinq exercices de l’éventuel excédent relèvent de la déclaration ' +
        'de l’entreprise donatrice (imprimé 2069-RCI) — voir l’état annuel de valorisation établi par Mana.',
    ),
    17,
    y + 5,
    { maxWidth: 176 },
  )
  y += 22

  // Magasins couverts par le reçu
  const idsMagasins = new Set(saisies.map((s) => s.magasinId))
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(9)
  doc.text(t('Établissements donateurs couverts par le présent reçu'), 14, y)
  doc.setFont('InstrumentSans', 'normal')
  y += 6
  doc.setFontSize(8.5)
  for (const m of agg.magasins.filter((x) => idsMagasins.has(x.id))) {
    const c = collecteur ? m.collecteurs.find((x) => x.nom === collecteur) : m.collecteurs[0]
    doc.text(t(`• ${m.nom}${c && resumePassages(c) ? ` — passages : ${resumePassages(c)}` : ''}`), 14, y, { maxWidth: 182 })
    y += 5.5
  }

  piedDePage(doc, 'Reçu prérempli par Mana — à faire dater, signer et cacheter par l’organisme bénéficiaire.')
  doc.save(`mana-recu-fiscal-238bis-${slug(nom)}${collecteur ? `-${slug(collecteur)}` : ''}-${exercice}.pdf`)
}

// ---------- Sécurisation de l'association : rescrit et convention ----------

function paragraphe(doc: jsPDF, texte: string, y: number, opts?: { bold?: boolean; size?: number; gap?: number; x?: number; largeur?: number }): number {
  const x = opts?.x ?? 14
  const largeur = opts?.largeur ?? 182
  const size = opts?.size ?? 10.5
  doc.setFont('InstrumentSans', opts?.bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  const lignes = doc.splitTextToSize(t(texte), largeur)
  if (y + lignes.length * size * 0.45 > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage()
    y = 30
  }
  doc.text(lignes, x, y)
  return y + lignes.length * size * 0.45 + (opts?.gap ?? 3.5)
}

function champLigne(doc: jsPDF, label: string, y: number, valeur?: string): number {
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(10.5)
  doc.text(t(label), 14, y)
  const debut = 14 + doc.getTextWidth(t(label)) + 2
  if (valeur) {
    doc.setFont('InstrumentSans', 'bold')
    doc.text(t(valeur), debut, y)
  }
  doc.setDrawColor(150, 143, 128)
  doc.line(debut, y + 0.8, 196, y + 0.8)
  return y + 8
}

/**
 * Demande de rescrit mécénat (article L. 80 C du LPF), préremplie pour
 * l'association. C'est ELLE qui la dépose auprès de la direction des finances
 * publiques de son siège ; l'administration a six mois pour répondre, et son
 * silence vaut protection contre l'amende de l'article 1740 A.
 * Contenu conforme au modèle de l'annexe du BOI-SJ-RES-10-20-20-40.
 */
export async function pdfDemandeRescrit(asso: Collecteur, societe?: Societe) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  entete(doc, 'Demande de rescrit « mécénat »', 'Article L. 80 C du livre des procédures fiscales')
  let y = 34
  y = paragraphe(doc, 'À adresser par l’association, en recommandé avec avis de réception, à la Direction départementale ou régionale des finances publiques du département de son siège (service juridique de la fiscalité / correspondant « associations »).', y, { size: 9.5, gap: 6 })

  y = paragraphe(doc, '1. Organisme demandeur', y, { bold: true, size: 12, gap: 5 })
  y = champLigne(doc, 'Dénomination :', y, asso.nom)
  y = champLigne(doc, 'N° RNA :', y, asso.rna)
  y = champLigne(doc, 'N° SIREN (le cas échéant) :', y, asso.siren)
  y = champLigne(doc, 'Adresse du siège :', y, asso.analyse?.association.siege)
  y = champLigne(doc, 'Date de déclaration en préfecture :', y, asso.analyse?.association.dateDeclaration ? fmtDate(asso.analyse.association.dateDeclaration) : undefined)
  y = champLigne(doc, 'Représentant légal (nom, qualité, téléphone, e-mail) :', y, [asso.contact, asso.telephone, asso.email].filter(Boolean).join(' · ') || undefined)
  y += 2

  y = paragraphe(doc, '2. Objet de la demande', y, { bold: true, size: 12, gap: 5 })
  y = paragraphe(doc,
    'L’association sollicite, sur le fondement de l’article L. 80 C du livre des procédures fiscales, la confirmation qu’elle relève des ' +
    'organismes visés aux articles 200 et 238 bis du code général des impôts et qu’elle peut, à ce titre, délivrer aux entreprises ' +
    'donatrices les reçus fiscaux (formulaire n° 2041-MEC-SD) ouvrant droit à la réduction d’impôt mécénat.', y)
  y = paragraphe(doc,
    `Contexte : l’association collecte les invendus alimentaires consommables de commerces de détail${societe ? ` (notamment de la société ${denomination(societe)})` : ''} ` +
    'pour les redistribuer à des personnes en situation de précarité. Le commerçant valorise ces dons au coût de revient et souhaite ' +
    's’assurer, avant la clôture de l’exercice, que les reçus délivrés seront opposables.', y, { gap: 6 })

  y = paragraphe(doc, '3. Présentation de l’organisme (à compléter par l’association)', y, { bold: true, size: 12, gap: 5 })
  const points = [
    `Objet statutaire : ${asso.analyse?.association.objet || '…'}`,
    'Activités effectivement exercées (nature, fréquence, nombre de bénéficiaires, territoire) : …',
    'Public bénéficiaire et conditions d’accès (critères sociaux, orientation par des travailleurs sociaux, participation financière symbolique éventuelle) : …',
    'Gestion désintéressée : dirigeants bénévoles (ou rémunération dans les limites légales), aucune distribution de bénéfices, dévolution de l’actif à un organisme similaire en cas de dissolution (préciser les articles des statuts) : …',
    'Absence de concurrence avec le secteur marchand (règle des « 4 P » : produit, public, prix, publicité) : …',
    'Ressources (subventions, dons, cotisations, ventes) et emploi des fonds : …',
    'Salariés (nombre, fonctions) et bénévoles : …',
  ]
  for (const p of points) y = paragraphe(doc, `• ${p}`, y, { x: 18, largeur: 178, gap: 2.5 })
  y += 4

  y = paragraphe(doc, '4. Pièces jointes', y, { bold: true, size: 12, gap: 5 })
  const pieces = ['Statuts à jour, datés et signés', 'Récépissé de déclaration en préfecture ou extrait du Journal officiel', 'Composition du bureau et du conseil d’administration', 'Derniers comptes annuels approuvés (ou budget de la première année)', 'Rapport d’activité ou tout document décrivant les actions menées', 'Habilitation aide alimentaire (article L. 266-1 du CASF), si elle existe']
  for (const p of pieces) y = paragraphe(doc, `☐ ${p}`, y, { x: 18, largeur: 178, gap: 2.5 })
  y += 4

  y = paragraphe(doc, 'Fait à ………………………, le ……/……/………        Signature du représentant légal :', y, { gap: 20 })
  y = paragraphe(doc,
    'Rappel des délais : l’administration dispose de six mois pour répondre. À défaut de réponse dans ce délai, l’organisme peut délivrer des reçus ' +
    'sans encourir l’amende prévue à l’article 1740 A du CGI (article L. 80 C du LPF). Une réponse positive vaut tant que la situation décrite ' +
    'n’a pas changé. Conservez la demande, l’accusé de réception et la réponse : ce sont les pièces que Mana archive pour le reçu de fin d’année.',
    y, { size: 9.5 })

  piedDePage(doc, 'Modèle prérempli par Mana d’après les pièces reçues — à compléter et signer par l’association. Mana n’est pas un conseil fiscal.')
  doc.save(`mana-demande-rescrit-${slug(asso.nom || 'association')}.pdf`)
}

/**
 * Convention de don de denrées entre le commerçant et l'association. Elle
 * ne remplace pas le rescrit, mais elle engage l'association par écrit sur
 * les points dont dépend le reçu (intérêt général, gratuité, délivrance des
 * reçus, information en cas de changement) et organise la traçabilité.
 */
export async function pdfConventionDon(asso: Collecteur, societe?: Societe, magasin?: Magasin) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  entete(doc, 'Convention de don de denrées alimentaires', 'Article 238 bis du CGI · loi n° 2016-138 du 11 février 2016')
  let y = 34
  y = paragraphe(doc, 'Entre les soussignés', y, { bold: true, size: 12, gap: 5 })
  const donateur = societe ? `${denomination(societe)}, SIREN ${societe.siren}${societe.verification.adresseSiege ? `, ${societe.verification.adresseSiege.voie}, ${societe.verification.adresseSiege.codePostal} ${societe.verification.adresseSiege.commune}` : ''}${magasin ? `, pour son magasin « ${magasin.nom} »` : ''}` : '……………………………………………… (société, SIREN, siège)'
  y = paragraphe(doc, `Le donateur : ${donateur}, représenté par ……………………………, ci-après « le Magasin » ;`, y)
  const beneficiaire = `${asso.nom || '………………………'}${asso.rna ? `, RNA ${asso.rna}` : ''}${asso.siren ? `, SIREN ${asso.siren}` : ''}${asso.analyse?.association.siege ? `, siège : ${asso.analyse.association.siege}` : ', siège : ………………………'}`
  y = paragraphe(doc, `Le bénéficiaire : l’association ${beneficiaire}, représentée par ${asso.contact || '……………………………'}, ci-après « l’Association ».`, y, { gap: 6 })

  const articles: [string, string][] = [
    ['Article 1 — Objet', 'Le Magasin remet gratuitement à l’Association des denrées alimentaires invendues mais propres à la consommation (produits emballés à date limite de consommation du jour ou à venir, produits à date de durabilité minimale dépassée, fruits et légumes, pain), pour distribution à des personnes en situation de précarité.'],
    ['Article 2 — Déclarations de l’Association', 'L’Association déclare être régulièrement déclarée, poursuivre un but non lucratif, être gérée de façon désintéressée, agir au profit d’un public ouvert et non d’un cercle restreint, et remettre les denrées gratuitement ou contre une participation symbolique sans lien avec leur valeur. Elle déclare relever des organismes visés à l’article 238 bis du CGI et s’engage à fournir au Magasin ses statuts, son récépissé de déclaration et, dès qu’elle en dispose, le rescrit mécénat obtenu de l’administration. Elle informe le Magasin sans délai de tout changement de ses statuts, de son activité ou de sa situation fiscale.'],
    ['Article 3 — Reçus fiscaux', 'L’Association délivre au Magasin, pour chaque année civile, le reçu fiscal (formulaire n° 2041-MEC-SD) mentionnant la valeur des dons en nature, telle qu’établie par le Magasin à partir de ses relevés de démarque et du coût de revient des produits, conformément à la doctrine administrative (BOI-BIC-RICI-20-30-10-20). Le Magasin fournit à l’Association l’état récapitulatif annuel et les bordereaux d’enlèvement correspondants.'],
    ['Article 4 — Modalités de collecte', `Les enlèvements ont lieu ${resumePassages(asso) || 'aux jours et heures convenus'}, au magasin. À chaque passage, un bordereau d’enlèvement est établi et signé par les deux parties : il mentionne la date, le nombre de colis, le poids des fruits et légumes, les éventuels refus. L’Association vient avec des contenants propres et, pour les produits frais, un moyen de transport permettant le respect de la chaîne du froid.`],
    ['Article 5 — Sécurité sanitaire', 'Le Magasin ne remet que des denrées conformes à la réglementation, retirées de la vente pour des raisons commerciales et non sanitaires. À compter de l’enlèvement, l’Association est responsable de la conservation, du transport et de la distribution des denrées, dans le respect des règles d’hygiène et des dates limites de consommation. Les produits à DLC dépassée, entamés ou dont la chaîne du froid a été rompue ne sont jamais remis.'],
    ['Article 6 — Gratuité et destination', 'Les denrées sont destinées exclusivement à l’aide alimentaire. Toute revente au prix du marché est interdite. L’Association tient une comptabilité matière (entrées, distributions) permettant au Magasin de justifier, en cas de contrôle, la destination des dons.'],
    ['Article 7 — Durée et résiliation', 'La convention est conclue pour une durée d’un an à compter de sa signature, renouvelable tacitement. Chaque partie peut y mettre fin à tout moment par écrit avec un préavis d’un mois. Elle prend fin de plein droit si l’Association perd la qualité d’organisme d’intérêt général ou reçoit une réponse négative à sa demande de rescrit.'],
    ['Article 8 — Mana', 'Le Magasin utilise le service Mana pour tenir le registre des dons, archiver les bordereaux et établir l’état annuel. L’Association accepte que ces pièces soient conservées à cette fin et communiquées à l’administration fiscale ou à l’expert-comptable du Magasin en cas de demande.'],
  ]
  for (const [titre, corps] of articles) {
    y = paragraphe(doc, titre, y, { bold: true, size: 11, gap: 2 })
    y = paragraphe(doc, corps, y, { gap: 5 })
  }
  y += 2
  y = paragraphe(doc, 'Fait en deux exemplaires à ………………………, le ……/……/………', y, { gap: 8 })
  if (y > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage()
    y = 30
  }
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10.5)
  doc.text(t('Pour le Magasin'), 14, y)
  doc.text(t('Pour l’Association'), 110, y)
  doc.setDrawColor(150, 143, 128)
  doc.rect(14, y + 3, 86, 30)
  doc.rect(110, y + 3, 86, 30)
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(120, 113, 100)
  doc.text(t('Nom, qualité, signature et cachet'), 16, y + 8)
  doc.text(t('Nom, qualité, signature et cachet'), 112, y + 8)
  doc.setTextColor(43, 38, 32)

  piedDePage(doc, 'Modèle fourni par Mana — à adapter avec votre conseil si nécessaire. Mana n’est pas un conseil juridique ni fiscal.')
  doc.save(`mana-convention-don-${slug(asso.nom || 'association')}.pdf`)
}


// ---------- Contrat de service (signé en ligne) et convention intra-groupe ----------

/** Exemplaire du contrat de service, avec les mentions de la signature électronique. */
export async function pdfContratService(societe: Societe, signature?: { nomSignataire: string; email: string; signeLe: string; adresseIp?: string | null; id: string }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  entete(doc, 'Contrat de service Mana', `Version ${VERSION_CONTRAT}`)
  let y = 32
  for (const a of articlesContrat(societe)) {
    y = paragraphe(doc, a.titre, y, { bold: true, size: 11, gap: 2 })
    y = paragraphe(doc, a.corps, y, { size: 9.5, gap: 4.5 })
  }
  y += 2
  if (y > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage()
    y = 30
  }
  doc.setFillColor(233, 223, 201)
  doc.roundedRect(14, y, 182, signature ? 34 : 24, 2, 2, 'F')
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10)
  doc.text(t(signature ? 'Signé électroniquement' : 'Non signé'), 18, y + 7)
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9)
  if (signature) {
    doc.text(t(`Pour ${denomination(societe)} : ${signature.nomSignataire} (${signature.email})`), 18, y + 13)
    doc.text(t(`Le ${fmtDateHeure(signature.signeLe)}${signature.adresseIp ? ` — depuis l’adresse ${signature.adresseIp}` : ''}`), 18, y + 18)
    doc.text(t(`Référence de signature : ${signature.id} — version du texte : ${VERSION_CONTRAT}`), 18, y + 23)
    doc.text(t(`Pour ${EDITEUR.denomination} ${EDITEUR.forme} : ${EDITEUR.president}, président — accepté par la mise à disposition du service.`), 18, y + 29)
  } else {
    doc.text(t('Ce contrat se signe en ligne, dans Mana (onglet Magasins, carte de la société).'), 18, y + 13)
    doc.text(t(`Pour ${EDITEUR.denomination} ${EDITEUR.forme} : ${EDITEUR.president}, président.`), 18, y + 18)
  }
  piedDePage(doc, EDITEUR.mention)
  doc.save(`mana-contrat-service-${slug(societe.raisonSociale)}.pdf`)
}

/**
 * Convention de prestations de services intra-groupe : LAB facture Mana à une
 * société qu'elle contrôle. Le prix est celui du marché (le même que pour tout
 * client), la convention l'établit noir sur blanc.
 */
export async function pdfConventionIntraGroupe(societe: Societe) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  entete(doc, 'Convention de prestations de services intra-groupe', `${EDITEUR.denomination} ${EDITEUR.forme} / ${denomination(societe)}`)
  let y = 32
  const parties = `Entre ${EDITEUR.denomination} ${EDITEUR.forme}, au capital de ${EDITEUR.capital}, ${EDITEUR.rcs}, siège ${EDITEUR.adresse}, représentée par son président ${EDITEUR.president}, ci-après « le Prestataire », ` +
    `et ${denomination(societe)}, SIREN ${societe.siren}, représentée par son représentant légal, ci-après « la Filiale ». Le Prestataire détient le contrôle de la Filiale.`
  y = paragraphe(doc, parties, y, { size: 10, gap: 6 })
  const articles: [string, string][] = [
    ['Article 1 — Objet', 'Le Prestataire fournit à la Filiale, par l’intermédiaire de son service Mana, la gestion des dons d’invendus alimentaires ouvrant droit à la réduction d’impôt de l’article 238 bis du CGI : application, accompagnement, registre, documents de fin d’exercice, dans les termes du contrat de service Mana signé en ligne par la Filiale, qui fait partie intégrante de la présente convention.'],
    ['Article 2 — Prix de marché', `La rémunération est identique à celle pratiquée par le service Mana envers tout client tiers : ${SUCCESS_FEE_TEXTE}. Elle est fixée à des conditions normales de marché, sans avantage ni désavantage lié aux liens capitalistiques entre les parties.`],
    ['Article 3 — Facturation', 'Les prestations sont facturées mensuellement sur les dons documentés, puis régularisées à la clôture sur la liasse fiscale de la Filiale, avec TVA au taux en vigueur. Chaque facture détaille la base retenue et le calcul, de sorte que la réalité et la valeur de la prestation puissent être justifiées auprès de l’administration.'],
    ['Article 4 — Réalité de la prestation', 'La Filiale dispose à tout moment, dans l’application, du registre horodaté des dons, des bordereaux archivés et des documents produits : ils constituent la preuve de l’exécution des prestations facturées.'],
    ['Article 5 — Durée', 'La convention prend effet à sa signature pour la durée du contrat de service Mana et suit son sort. Elle est soumise, le cas échéant, à la procédure des conventions réglementées applicable à la Filiale.'],
    ['Article 6 — Droit applicable', 'Droit français. Tribunal de commerce de Nanterre.'],
  ]
  for (const [titre, corps] of articles) {
    y = paragraphe(doc, titre, y, { bold: true, size: 11, gap: 2 })
    y = paragraphe(doc, corps, y, { size: 10, gap: 5 })
  }
  y = paragraphe(doc, 'Fait en deux exemplaires à ………………………, le ……/……/………', y, { gap: 8 })
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10.5)
  doc.text(t(`Pour ${EDITEUR.denomination} ${EDITEUR.forme}`), 14, y)
  doc.text(t(`Pour ${denomination(societe)}`), 110, y)
  doc.setDrawColor(150, 143, 128)
  doc.rect(14, y + 3, 86, 30)
  doc.rect(110, y + 3, 86, 30)
  piedDePage(doc, EDITEUR.mention)
  doc.save(`convention-intra-groupe-lab-${slug(societe.raisonSociale)}.pdf`)
}

const SUCCESS_FEE_TEXTE = '30 % de la réduction d’impôt acquise au titre des dons documentés, soit 18 % de la base retenue, sans abonnement ni frais fixe'
