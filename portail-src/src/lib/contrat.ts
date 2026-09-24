import type { Societe } from '../types'
import { SUCCESS_FEE_PCT, TAUX_REDUCTION } from './calc'
import { denomination } from './identite'

/**
 * L'éditeur de Mana. Le service est exploité par LAB SAS tant que Mana n'a pas
 * sa propre société : les factures, le contrat et les CGV le disent, et le
 * contrat prévoit la cession à la société qui reprendra l'activité.
 */
export const EDITEUR = {
  denomination: 'LAB',
  forme: 'SAS',
  capital: '1 000 €',
  siren: '891926552',
  siret: '89192655200045',
  tva: 'FR39891926552',
  rcs: 'RCS Nanterre 891 926 552',
  adresse: '14 avenue de la Criolla, 92150 Suresnes',
  president: 'Anthony Bouskila',
  email: 'anthony.bouskila@gmail.com',
  iban: 'FR76 1695 8000 0109 6489 6160 743',
  bic: 'QNTOFRP1XXX',
  banque: 'Qonto (Olinda SAS)',
  marque: 'Mana',
  /** Mention à porter sur tout document sortant. */
  mention: 'Mana est un service édité par LAB SAS, au capital de 1 000 €, RCS Nanterre 891 926 552, TVA FR39891926552, 14 avenue de la Criolla, 92150 Suresnes.',
} as const

/** Version du contrat : toute modification du texte doit l'incrémenter (les signatures y renvoient). */
export const VERSION_CONTRAT = '2026-09 v1'

export interface ArticleContrat {
  titre: string
  corps: string
}

const PCT_BASE = (SUCCESS_FEE_PCT * TAUX_REDUCTION).toLocaleString('fr-FR')

/**
 * Le contrat de service et les conditions générales, en un seul document.
 * Le même texte alimente l'écran de signature et le PDF, pour que ce qui
 * est signé soit exactement ce qui est archivé.
 */
export function articlesContrat(societe: Societe): ArticleContrat[] {
  const client = `${denomination(societe)} (SIREN ${societe.siren})`
  return [
    {
      titre: 'Parties',
      corps:
        `Entre ${EDITEUR.denomination} ${EDITEUR.forme}, au capital de ${EDITEUR.capital}, ${EDITEUR.rcs}, dont le siège est ${EDITEUR.adresse}, éditeur du service Mana, ci-après « Mana », ` +
        `et ${client}, ci-après « le Client ». Le Client déclare agir pour les besoins de son activité professionnelle.`,
    },
    {
      titre: 'Article 1 — Objet',
      corps:
        'Mana fournit au Client un service de gestion des dons d’invendus alimentaires ouvrant droit à la réduction d’impôt prévue à l’article 238 bis du code général des impôts : ' +
        'application en ligne de saisie et de suivi (bordereaux d’enlèvement, relevés de démarque, registre horodaté), accompagnement à la mise en place de la collecte, ' +
        'production des documents de fin d’exercice (état annuel, annexe fiscale, reçus à faire signer par l’association bénéficiaire), et assistance. ' +
        'Mana n’est ni un conseil fiscal ni un conseil juridique : les montants sont validés par l’expert-comptable du Client, qui reste seul responsable de ses déclarations.',
    },
    {
      titre: 'Article 2 — Obligations du Client',
      corps:
        'Le Client fournit des informations exactes (identité, chiffre d’affaires et marge justifiés), tient ses bordereaux et relevés dans l’application au fil de l’eau, ' +
        'conserve les pièces originales, s’assure que l’association bénéficiaire est éligible (statuts, récépissé, rescrit quand Mana le recommande) et informe Mana de tout changement.',
    },
    {
      titre: 'Article 3 — Rémunération',
      corps:
        `Aucun abonnement ni frais fixe. Mana perçoit ${SUCCESS_FEE_PCT} % de la réduction d’impôt acquise par le Client au titre des dons documentés dans l’application, ` +
        `soit ${PCT_BASE} % de la base des dons retenue (coût de revient des denrées, dans la limite du plafond légal de 20 000 € ou 0,5 % du chiffre d’affaires hors taxes). ` +
        'La rémunération est due sur la réduction acquise, indépendamment de l’impôt effectivement payé par le Client au cours de l’exercice ; la fraction d’excédent reportée est facturée l’exercice où elle est utilisée. ' +
        'Les montants s’entendent hors taxes ; la TVA s’ajoute au taux en vigueur.',
    },
    {
      titre: 'Article 4 — Facturation et régularisation',
      corps:
        'Une facture est émise chaque mois échu sur la base des dons documentés du mois. À la clôture de l’exercice, sur la liasse fiscale du Client (chiffre d’affaires et marge réels), ' +
        'Mana recalcule la réduction acquise sur l’année et émet un complément ou un avoir, de sorte que le total facturé corresponde exactement à la rémunération de l’article 3. ' +
        'Le détail du calcul figure sur chaque facture et dans le registre de l’application.',
    },
    {
      titre: 'Article 5 — Paiement',
      corps:
        'Les factures sont payables à 30 jours par prélèvement SEPA, sur mandat signé par le Client, ou par virement sur le compte indiqué sur la facture. ' +
        'Tout retard entraîne de plein droit des pénalités égales à trois fois le taux d’intérêt légal et l’indemnité forfaitaire de recouvrement de 40 € (articles L. 441-10 et D. 441-5 du code de commerce).',
    },
    {
      titre: 'Article 6 — Durée et résiliation',
      corps:
        'Le contrat prend effet à sa signature pour une durée d’un an, renouvelable tacitement. Chaque partie peut y mettre fin par écrit avec un préavis d’un mois. ' +
        'La résiliation n’affecte pas la rémunération due au titre des dons documentés avant sa prise d’effet, ni la régularisation de clôture de l’exercice en cours. ' +
        'Le Client conserve l’accès en lecture à son registre et l’export de ses données pendant douze mois après la fin du contrat.',
    },
    {
      titre: 'Article 7 — Données et confidentialité',
      corps:
        'Le Client reste propriétaire de ses données. Mana les héberge dans l’Union européenne, ne les utilise que pour l’exécution du service et ne les communique qu’à la demande du Client, de son expert-comptable ou d’une autorité. ' +
        'Les parties gardent confidentielles les informations échangées. Les traitements de données personnelles (contacts du Client et des associations) respectent le RGPD ; le Client peut demander leur suppression à la fin du contrat.',
    },
    {
      titre: 'Article 8 — Responsabilité',
      corps:
        'Mana s’engage sur les moyens : exactitude des calculs à partir des données saisies, conformité des documents produits aux textes en vigueur, disponibilité raisonnable du service. ' +
        'Mana ne garantit pas l’acceptation de la réduction par l’administration, qui dépend de l’éligibilité de l’association et des déclarations du Client. ' +
        'La responsabilité de Mana est limitée au montant de la rémunération perçue au titre de l’exercice concerné.',
    },
    {
      titre: 'Article 9 — Cession',
      corps:
        `Le Client accepte que ${EDITEUR.denomination} ${EDITEUR.forme} cède le présent contrat, sans autre formalité qu’une information écrite, à toute société qui reprendra l’exploitation du service Mana, ` +
        'aux mêmes conditions. Le Client ne peut céder le contrat sans l’accord de Mana.',
    },
    {
      titre: 'Article 10 — Signature électronique et loi applicable',
      corps:
        'Le contrat est conclu par acceptation en ligne : Mana enregistre l’identité du signataire, la date et l’heure, la version du texte et l’adresse depuis laquelle il a été accepté, ' +
        'et remet au Client un exemplaire portant ces mentions. Les parties reconnaissent à cette acceptation la valeur d’une signature (articles 1366 et 1367 du code civil). ' +
        'Le contrat est soumis au droit français ; à défaut d’accord amiable, le tribunal de commerce de Nanterre est compétent.',
    },
  ]
}

/** Empreinte du texte signé : change dès qu'un mot change, sans avoir à archiver le texte lui-même dans chaque ligne. */
export async function empreinteContrat(societe: Societe): Promise<string> {
  const texte = VERSION_CONTRAT + '\n' + articlesContrat(societe).map((a) => `${a.titre}\n${a.corps}`).join('\n\n')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
