import type { AnalyseAssociation, Collecteur, CriteresAssociation } from '../types'

/**
 * Règle de verdict — fixe, lisible, la même côté serveur et ici.
 *
 * Le reçu fiscal de fin d'année n'est opposable que si l'association est
 * d'intérêt général (article 238 bis du CGI). Personne ne peut le garantir
 * « à 100 % » à la place de l'administration : seul un rescrit (article
 * L. 80 C du LPF) ou l'appartenance à un réseau notoire donne cette
 * certitude. D'où trois issues seulement :
 *
 *   refus        un critère éliminatoire est établi par les pièces ;
 *   validee      rescrit positif joint, ou réseau national, sans signal contraire ;
 *   a_securiser  tout le reste — plausible, mais il manque la position écrite
 *                de l'administration. Mana fournit alors la demande de rescrit
 *                préremplie et la convention de don à faire signer.
 */
export function verdictDepuisCriteres(c: CriteresAssociation): { verdict: AnalyseAssociation['verdict']; motifs: string[]; actions: string[] } {
  const motifs: string[] = []
  const actions: string[] = []

  const eliminatoires: [boolean, string][] = [
    [c.cercleRestreint === 'oui', 'Les pièces montrent une action réservée à un cercle restreint (membres, groupe fermé) : pas d’intérêt général possible.'],
    [c.gestionDesinteressee === 'non', 'Les statuts n’assurent pas une gestion désintéressée (distribution de bénéfices ou rémunération libre des dirigeants).'],
    [c.activiteNonLucrative === 'non', 'L’activité est lucrative ou concurrence le secteur marchand dans des conditions similaires.'],
    [c.declarationPrefecture === 'non', 'L’association n’est pas déclarée : elle n’a pas la capacité juridique de recevoir des dons ni de délivrer des reçus.'],
    [c.rescritPositif === 'non', 'L’administration a répondu par écrit que l’association ne peut pas délivrer de reçus fiscaux.'],
    [c.gratuiteBeneficiaires === 'non', 'Les denrées sont revendues au prix du marché : le don ne finance pas une œuvre d’intérêt général.'],
  ]
  for (const [vrai, texte] of eliminatoires) if (vrai) motifs.push(texte)
  if (motifs.length > 0) {
    actions.push('Ne pas donner à cette association dans le cadre du 238 bis : le reçu serait contestable et la réduction d’impôt remise en cause.')
    actions.push('Choisir une association d’un réseau national (Banque Alimentaire, Restos du Cœur, Secours populaire…) ou une épicerie solidaire munie d’un rescrit.')
    return { verdict: 'refus', motifs, actions }
  }

  if (c.rescritPositif === 'oui') {
    motifs.push(`Rescrit mécénat positif de l’administration${c.dateRescrit ? ` du ${c.dateRescrit}` : ''} : le reçu fiscal est opposable.`)
    actions.push('Vérifier que l’activité n’a pas changé depuis le rescrit ; le renouveler si les statuts sont modifiés.')
    return { verdict: 'validee', motifs, actions }
  }
  if (c.reseauNational === 'oui') {
    motifs.push('Antenne d’un réseau national dont l’éligibilité est notoire : les reçus sont délivrés sous la responsabilité du réseau.')
    actions.push('Faire signer la convention de don pour tracer les enlèvements ; rien d’autre à demander.')
    return { verdict: 'validee', motifs, actions }
  }

  // À sécuriser : on dit ce qui est acquis, ce qui manque, et ce que Mana fournit.
  if (c.declarationPrefecture === 'oui') motifs.push('Association déclarée (récépissé, JO ou RNA).')
  if (c.gestionDesinteressee === 'oui') motifs.push('Statuts conformes sur la gestion désintéressée.')
  if (c.devolutionBoni === 'oui') motifs.push('Dévolution de l’actif à un organisme similaire en cas de dissolution.')
  if (c.objetEligible === 'oui') motifs.push('Objet social à caractère social ou d’aide alimentaire.')
  if (c.habilitationAideAlimentaire === 'oui') motifs.push('Habilitée pour l’aide alimentaire (L. 266-1 CASF) : indice fort d’intérêt général.')
  if (c.gratuiteBeneficiaires === 'oui') motifs.push('Denrées remises gratuitement ou contre participation symbolique.')

  const manquants: string[] = []
  if (c.declarationPrefecture !== 'oui') manquants.push('le récépissé de déclaration en préfecture (ou l’extrait du JO)')
  if (c.gestionDesinteressee !== 'oui' || c.devolutionBoni !== 'oui' || c.objetEligible !== 'oui') manquants.push('les statuts complets et signés')
  if (manquants.length > 0) actions.push(`Demander à l’association : ${manquants.join(' ; ')}.`)
  actions.push('Faire déposer par l’association la demande de rescrit mécénat préremplie par Mana (réponse sous 6 mois ; sans réponse, l’association peut délivrer des reçus sans encourir l’amende).')
  actions.push('Faire signer la convention de don fournie par Mana : elle engage l’association sur son statut, la gratuité et la délivrance des reçus.')
  actions.push('En attendant le rescrit, les dons restent possibles : le reçu de fin d’année reposera sur la convention et les pièces réunies.')
  return { verdict: 'a_securiser', motifs, actions }
}

/** Le verdict se traduit dans le statut d'éligibilité affiché partout. */
export function eligibiliteDepuisVerdict(analyse: AnalyseAssociation): NonNullable<Collecteur['eligibilite']> {
  if (analyse.verdict === 'validee') return analyse.criteres.rescritPositif === 'oui' ? 'rescrit' : 'reseau_national'
  if (analyse.verdict === 'a_securiser') return 'a_verifier'
  return 'inconnue'
}

export const LIBELLES_VERDICT: Record<AnalyseAssociation['verdict'], { titre: string; classe: string; explication: string }> = {
  validee: {
    titre: 'Association validée',
    classe: 'vert',
    explication: 'Le reçu fiscal généré par Mana en fin d’année sera opposable : l’éligibilité est établie par l’administration ou par le réseau.',
  },
  a_securiser: {
    titre: 'À sécuriser avant de compter sur le reçu',
    classe: 'ambre',
    explication:
      'Rien n’exclut cette association, mais rien ne garantit encore son reçu. Sans rescrit, un contrôle peut le contester et la réduction d’impôt tomber. Mana vous fournit les deux documents qui ferment ce risque.',
  },
  refus: {
    titre: 'Association à refuser pour le 238 bis',
    classe: 'rouge',
    explication:
      'Un point éliminatoire ressort des pièces. Donner à cette association, c’est donner toute l’année pour un reçu qui ne tiendra pas. Mana ne facturera pas de commission sur ces dons.',
  },
}
