import { jsPDF } from 'jspdf'
import type { Facture, Magasin, Societe } from '../types'
import { fmtDate, fmtDateHeure, fmtEUR, fmtNum, fmtPct, montantEnLettres, pdfSafe } from './format'
import { weekLabel } from './iso'
import { baseDeLaSaisie, type AggSociete } from './selectors'
import { coutEmballes, coutFL, kgDetournes } from './calc'
import { libelleMois, moisDeLaSemaine } from './facturation'
import { denomination } from './identite'
import { resumePassages } from './annuaire'

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
  doc.text('Mana SAS', 14, y)
  doc.setFont('InstrumentSans', 'normal')
  doc.text(t('[Adresse Mana — à compléter]'), 14, y + 5)
  doc.text(t('SIREN : [SIREN Mana] — TVA : [N° TVA Mana]'), 14, y + 10)

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
    doc.text(lines, 14, y)
    y += lines.length * 4.4 + 1.5
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

  piedDePage(doc, 'Facture établie par Mana SAS. Pas d’économie d’impôt = pas de facture.')
  doc.save(`${facture.numero.toLowerCase()}-${slug(denomination(societe))}.pdf`)
}

/** Affiche A4 « Le bac don — règles de tri » à imprimer pour la réserve. */
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
  doc.text(
    t(
      'Ce bordereau prouve la remise — il ne fixe pas la valeur fiscale. Produits emballés : valorisés dans Mana par la ' +
        'démarque scannée en magasin (en €) — comptez les colis (bacs, cartons ou sacs), pas besoin de peser. ' +
        'Fruits & légumes : valorisés au poids — la pesée ci-dessous est la référence à reporter dans Mana.',
    ),
    17,
    y + 5,
    { maxWidth: 176 },
  )
  y += 24

  // Section 1 — produits emballés (comptage)
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('1. Produits emballés (démarque scannée en magasin)'), 14, y)
  y += 8
  champ('Nombre de colis remis (bacs, cartons ou sacs) :', 112, 14)
  champ('Poids indicatif (kg) :', 196, 120)
  y += 9
  champ('Produits refusés / remarques :', 196, 14)
  y += 12

  // Section 2 — fruits & légumes (pesée obligatoire)
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('2. Fruits & légumes (pesée obligatoire)'), 14, y)
  y += 5
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(120, 113, 100)
  doc.text(
    t('Sac : pesez et notez directement en net (tare nulle). Cagette ou bac : notez le brut, la tare du contenant (~1 kg pour une cagette bois), et le net.'),
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
  doc.text(t('Contenant (cagette, sac…)'), 17, y + 5.5)
  doc.text(t('Poids brut (kg)'), 92, y + 5.5)
  doc.text(t('Tare (kg)'), 130, y + 5.5)
  doc.text(t('Poids net (kg)'), 160, y + 5.5)
  y += 8
  doc.setFont('InstrumentSans', 'normal')
  for (let i = 1; i <= 5; i++) {
    doc.setDrawColor(210, 200, 180)
    doc.rect(14, y, 182, 9)
    doc.line(88, y, 88, y + 9)
    doc.line(126, y, 126, y + 9)
    doc.line(156, y, 156, y + 9)
    doc.text(t(`${i}.`), 17, y + 6)
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
  doc.text(t(`Période au cours de laquelle les dons ont été effectués : du 01/01/${exercice} au 31/12/${exercice}.`), 14, y)
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
