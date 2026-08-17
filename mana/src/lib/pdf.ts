import { jsPDF } from 'jspdf'
import type { Magasin } from '../types'
import { fmtDate, fmtDateHeure, fmtEUR, fmtNum, fmtPct, pdfSafe } from './format'
import { TAUX_REDUCTION } from './calc'
import { weekLabel } from './iso'
import { baseDeLaSaisie, type AggSociete } from './selectors'
import { coutEmballes, coutFL } from './calc'

const MENTION_LEGALE =
  'Mana n’est pas un conseil fiscal ; ce document est destiné à validation par votre expert-comptable.'

function t(s: string): string {
  return pdfSafe(s)
}

function entete(doc: jsPDF, titre: string, sousTitre: string) {
  doc.setFillColor(23, 68, 58)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Mana', 14, 10)
  doc.setFontSize(11)
  doc.text(t(titre), 14, 17)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(t(sousTitre), doc.internal.pageSize.getWidth() - 14, 14, { align: 'right' })
  doc.setTextColor(38, 36, 31)
}

function piedDePage(doc: jsPDF) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFontSize(7.5)
    doc.setTextColor(120, 115, 105)
    doc.text(t(MENTION_LEGALE), 14, h - 8)
    doc.text(t(`Page ${i}/${pages}`), w - 14, h - 8, { align: 'right' })
    doc.setTextColor(38, 36, 31)
  }
}

/** Registre des dons — tableau chronologique horodaté (format paysage). */
export function pdfRegistre(agg: AggSociete, exercice: number) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  entete(doc, 'Registre des dons', `${agg.societe} — Exercice ${exercice}`)

  const cols = [
    { x: 14, w: 40, label: 'Semaine' },
    { x: 54, w: 42, label: 'Magasin' },
    { x: 96, w: 24, label: 'PV emballés', right: true },
    { x: 120, w: 16, label: 'Marge', right: true },
    { x: 136, w: 26, label: 'Coût emballés', right: true },
    { x: 162, w: 16, label: 'F&L (kg)', right: true },
    { x: 178, w: 18, label: 'Coût/kg', right: true },
    { x: 196, w: 20, label: 'Coût F&L', right: true },
    { x: 216, w: 24, label: 'Base semaine', right: true },
    { x: 240, w: 30, label: 'Horodatage', right: false },
    { x: 270, w: 14, label: 'Justif.', right: true },
  ]

  let y = 32
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  for (const c of cols) doc.text(t(c.label), c.right ? c.x + c.w : c.x, y, c.right ? { align: 'right' } : undefined)
  doc.setFont('helvetica', 'normal')
  y += 2
  doc.setDrawColor(23, 68, 58)
  doc.line(14, y, 284, y)
  y += 5

  const magasinDe = (id: string) => agg.magasins.find((m) => m.id === id)?.nom ?? '—'

  for (const s of agg.saisies) {
    if (y > 185) {
      doc.addPage()
      entete(doc, 'Registre des dons (suite)', `${agg.societe} — Exercice ${exercice}`)
      y = 32
    }
    const vals = [
      weekLabel(s.semaine),
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
      doc.setTextColor(120, 115, 105)
      doc.text(t(`Note : ${s.note}`), 54, y, { maxWidth: 220 })
      doc.setTextColor(38, 36, 31)
    }
    y += 6
  }

  y += 2
  doc.line(14, y, 284, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(t(`Base cumulée de l'exercice : ${fmtEUR(agg.baseBrute, 2)}`), 284, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += 6
  doc.setFontSize(8)
  doc.text(
    t(
      'Méthode appliquée : coût de revient = prix de vente × (1 − marge brute de la liasse fiscale) pour les produits emballés ; ' +
        'poids × coût de revient moyen au kg pour les fruits & légumes. Coefficients figés à la date de chaque saisie (colonne Marge et Coût/kg).',
    ),
    14,
    y,
    { maxWidth: 270 },
  )

  piedDePage(doc)
  doc.save(`mana-registre-${slug(agg.societe)}-${exercice}.pdf`)
}

/** Note de méthode — 1 page par magasin, datée et versionnée. */
export function pdfNoteDeMethode(magasin: Magasin, exercice: number) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const version = magasin.versionsParametres[magasin.versionsParametres.length - 1]
  entete(doc, 'Note de méthode de valorisation', `${magasin.societe} — ${magasin.nom}`)

  let y = 34
  const p = (txt: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
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
      `Marge brute retenue : ${fmtPct(magasin.margePct)}. Par prudence, la marge est calée sur la liasse ou arrondie ` +
      `au-dessus (jamais en dessous), ce qui minore la base de réduction.`,
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
export function pdfEtatAnnuel(agg: AggSociete, exercice: number) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  entete(doc, 'État annuel de valorisation des dons', `${agg.societe} — Exercice ${exercice}`)

  let y = 34
  const ligne = (label: string, valeur: string, bold = false) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(t(label), 14, y)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(t(valeur), 196, y, { align: 'right' })
    y += 7
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(t('Synthèse fiscale (article 238 bis du CGI)'), 14, y)
  y += 8

  const r = agg.resultat
  ligne('Chiffre d’affaires HT de référence', fmtEUR(agg.caHT))
  ligne('Base de dons valorisée au coût de revient', fmtEUR(r.baseBrute, 2))
  ligne('Plafond annuel — max(20 000 € ; 0,5 % × CA HT)', fmtEUR(r.plafond))
  ligne('Base retenue (plafonnée)', fmtEUR(r.basePlafonnee, 2), true)
  if (r.excedent > 0) ligne('Excédent au-delà du plafond — reportable 5 exercices', fmtEUR(r.excedent, 2))
  ligne(`Réduction d’impôt sur les sociétés (60 %)`, fmtEUR(r.reductionIS, 2), true)
  y += 2
  ligne(`Honoraires Mana (${fmtNum(agg.successFeePct)} % de la réduction constatée)`, fmtEUR(r.factureMana, 2))
  ligne('Gain net pour la société', fmtEUR(r.gainNetClient, 2), true)

  y += 4
  doc.setDrawColor(23, 68, 58)
  doc.line(14, y, 196, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(t('Reçus fiscaux attendus des associations'), 14, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const collecteurs = agg.magasins.flatMap((m) => m.collecteurs.map((c) => ({ magasin: m.nom, ...c })))
  if (collecteurs.length === 0) {
    doc.text(t('Aucun collecteur renseigné.'), 14, y)
    y += 7
  } else {
    for (const c of collecteurs) {
      const lines = doc.splitTextToSize(t(`• ${c.nom} (${c.magasin}) — reçu 2041-MEC-SD à obtenir pour l’exercice ${exercice}`), 182)
      doc.text(lines, 14, y)
      y += lines.length * 5 + 2
    }
  }

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(t('Rappel des obligations déclaratives'), 14, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const obligations = [
    'Obtenir de chaque association bénéficiaire le reçu fiscal 2041-MEC-SD couvrant les dons de l’exercice.',
    'Reporter la réduction d’impôt sur l’imprimé 2069-RCI joint à la liasse fiscale.',
    'Au-delà de 10 000 € de dons sur l’exercice : déclaration des montants, dates, bénéficiaires et contreparties ' +
      '(déclaration spécifique dématérialisée).',
    'Conserver le registre des dons, la note de méthode et les bordereaux d’enlèvement signés à l’appui de la valorisation.',
  ]
  for (const o of obligations) {
    const lines = doc.splitTextToSize(t(`• ${o}`), 182)
    doc.text(lines, 14, y)
    y += lines.length * 4.6 + 2
  }

  piedDePage(doc)
  doc.save(`mana-etat-annuel-${slug(agg.societe)}-${exercice}.pdf`)
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
