import { jsPDF } from 'jspdf'
import type { Facture, Magasin, Societe } from '../types'
import { fmtDate, fmtDateHeure, fmtEUR, fmtNum, fmtPct, pdfSafe } from './format'
import { weekLabel } from './iso'
import { baseDeLaSaisie, type AggSociete } from './selectors'
import { coutEmballes, coutFL } from './calc'
import { libelleMois } from './facturation'

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
  if (logoCourant) doc.addImage(logoCourant, 'PNG', 13.5, 4.5, 11, 11)
  doc.setFont('YoungSerif', 'normal')
  doc.setFontSize(15)
  doc.text('mana', 27, 12)
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(10.5)
  doc.text(t(titre), 27, 18.5)
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
  entete(doc, 'Registre des dons', `${agg.societe.raisonSociale} — Exercice ${exercice}`)

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
      entete(doc, 'Registre des dons (suite)', `${agg.societe.raisonSociale} — Exercice ${exercice}`)
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
  doc.save(`mana-registre-${slug(agg.societe.raisonSociale)}-${exercice}.pdf`)
}

/** Note de méthode — 1 page par magasin, datée et versionnée. */
export async function pdfNoteDeMethode(societe: Societe, magasin: Magasin, exercice: number) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  const version = magasin.versionsParametres[magasin.versionsParametres.length - 1]
  entete(doc, 'Note de méthode de valorisation', `${societe.raisonSociale} — ${magasin.nom}`)

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
  entete(doc, 'État annuel de valorisation des dons', `${societe.raisonSociale} — Exercice ${exercice}`)

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
  ligne('Chiffre d’affaires HT de référence (vérifié)', fmtEUR(societe.caHT))
  ligne('Base de dons valorisée au coût de revient', fmtEUR(r.baseBrute, 2))
  ligne('Plafond annuel — max(20 000 € ; 0,5 % × CA HT)', fmtEUR(r.plafond))
  ligne('Base retenue (plafonnée)', fmtEUR(r.basePlafonnee, 2), true)
  if (r.excedent > 0) ligne('Excédent au-delà du plafond — reportable 5 exercices', fmtEUR(r.excedent, 2))
  ligne(`Réduction d’impôt sur les sociétés (60 %)`, fmtEUR(r.reductionIS, 2), true)
  y += 2
  ligne(`Commissions Mana facturées sur l'exercice (HT)`, fmtEUR(agg.commissionsHT, 2))
  ligne('Gain net pour la société (réduction − commissions)', fmtEUR(r.reductionIS - agg.commissionsHT, 2), true)

  y += 4
  doc.setDrawColor(26, 59, 46)
  doc.line(14, y, 196, y)
  y += 8

  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('Reçus fiscaux attendus des associations'), 14, y)
  y += 7
  doc.setFont('InstrumentSans', 'normal')
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
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('Rappel des obligations'), 14, y)
  y += 7
  doc.setFont('InstrumentSans', 'normal')
  doc.setFontSize(9.5)
  const obligations = [
    'Obtenir de chaque association bénéficiaire le reçu fiscal 2041-MEC-SD couvrant les dons de l’exercice.',
    'Reporter la réduction d’impôt sur l’imprimé 2069-RCI joint à la liasse fiscale.',
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
  doc.save(`mana-etat-annuel-${slug(societe.raisonSociale)}-${exercice}.pdf`)
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
  doc.text(t(societe.raisonSociale), 196, y, { align: 'right' })
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
  doc.save(`${facture.numero.toLowerCase()}-${slug(societe.raisonSociale)}.pdf`)
}

/** Affiche A4 « Le bac don — règles de tri » à imprimer pour la réserve. */
export async function pdfAfficheTri(nomMagasin: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await marque(doc)
  doc.setFillColor(26, 59, 46)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setTextColor(255, 255, 255)
  if (logoCourant) doc.addImage(logoCourant, 'PNG', 16, 8, 24, 24)
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
    'Produits à DLC demain ou après-demain (« à consommer jusqu’au ») — à sortir la veille, jamais après la date.',
    'DDM dépassée (« à consommer de préférence avant ») : biscuits, conserves, épicerie — donnables sans limite stricte.',
    'Fruits & légumes moches, tachés, mûrs — mais sains.',
    'Pain de la veille, emballages abîmés mais intacts (boîte cabossée, carton déchiré).',
  ], true)

  bloc('ON NE DONNE JAMAIS', [
    'DLC dépassée — même d’un jour. C’est la règle d’or.',
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
  const champ = (label: string, largeur: number, x: number) => {
    doc.setFont('InstrumentSans', 'normal')
    doc.setFontSize(10)
    doc.text(t(label), x, y)
    doc.setDrawColor(180, 172, 155)
    doc.line(x + doc.getTextWidth(t(label)) + 2, y + 0.5, x + largeur, y + 0.5)
  }
  champ('Date :', 88, 14)
  champ('Heure :', 196, 110)
  y += 9
  champ('Association bénéficiaire :', 196, 14)
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
  champ('Nombre de colis remis (bacs, cartons ou sacs) :', 110, 14)
  champ('Poids indicatif (facultatif, pour l’association) :        kg', 196, 118)
  y += 9
  champ('Produits refusés / remarques :', 196, 14)
  y += 12

  // Section 2 — fruits & légumes (pesée obligatoire)
  doc.setFont('InstrumentSans', 'bold')
  doc.setFontSize(11)
  doc.text(t('2. Fruits & légumes (pesée obligatoire)'), 14, y)
  y += 6
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
      'plafond de versements de 20 000 € ou 5 ‰ du chiffre d’affaires). Ces valeurs servent de référence constante ' +
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
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
