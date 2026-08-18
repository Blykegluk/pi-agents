/**
 * Annuaire indicatif des réseaux collecteurs (spec §4.7 : liste en dur, pas de
 * matching automatique — le magasin choisit et garde SA relation directe).
 * Les rythmes réels dépendent de chaque antenne locale : toujours confirmer par téléphone.
 */

export interface ReseauCollecteur {
  nom: string
  profil: string
  produits: string
  rythme: string
  site: string
  commentContacter: string
}

export const RESEAUX_COLLECTEURS: ReseauCollecteur[] = [
  {
    nom: 'Banque Alimentaire',
    profil: 'Le plus grand réseau (79 banques départementales). Le réflexe n°1 pour un commerce alimentaire.',
    produits: 'Tous produits, y compris frais et surgelés (camions réfrigérés dans la plupart des antennes).',
    rythme: 'Tournées régulières, souvent 1 à 3 passages/semaine selon votre secteur.',
    site: 'banquealimentaire.org',
    commentContacter: 'Trouvez la banque de votre département sur le site, demandez le responsable « ramasse ».',
  },
  {
    nom: 'Les Restos du Cœur',
    profil: 'Centres locaux nombreux, très implantés en ville comme en zone rurale.',
    produits: 'Produits secs et frais selon l’équipement du centre local.',
    rythme: 'Variable selon les centres — certains passent plusieurs fois par semaine.',
    site: 'restosducoeur.org',
    commentContacter: 'Contactez l’antenne départementale et demandez le référent « approvisionnement ».',
  },
  {
    nom: 'Linkee',
    profil: 'Collecte urbaine agile (vélo-cargo/utilitaire), pensée pour les commerces de proximité.',
    produits: 'Frais, F&L, produits du jour — redistribution le soir même à des étudiants et précaires.',
    rythme: 'Peut être quotidien dans les grandes villes (Paris, Lyon, Bordeaux, Lille…).',
    site: 'linkee.co',
    commentContacter: 'Formulaire commerçant sur le site — réponse rapide.',
  },
  {
    nom: 'Le Chaînon Manquant',
    profil: 'Spécialiste de la collecte rapide de produits frais à courte durée de vie.',
    produits: 'Frais et ultra-frais, plats préparés, F&L — redistribués en moins de 2 h.',
    rythme: 'Tournées fréquentes en Île-de-France, à Lyon, Nantes…',
    site: 'lechainon-manquant.org',
    commentContacter: 'Formulaire donateur sur le site.',
  },
  {
    nom: 'Secours populaire français',
    profil: 'Permanences et libre-services alimentaires de proximité.',
    produits: 'Secs et frais selon les fédérations.',
    rythme: 'Selon les fédérations locales — souvent hebdomadaire.',
    site: 'secourspopulaire.fr',
    commentContacter: 'Contactez la fédération de votre département.',
  },
  {
    nom: 'Croix-Rouge française',
    profil: 'Unités locales et épiceries sociales.',
    produits: 'Secs, frais selon équipement.',
    rythme: 'Selon les unités locales.',
    site: 'croix-rouge.fr',
    commentContacter: 'Unité locale la plus proche via le site.',
  },
  {
    nom: 'ANDES — épiceries solidaires',
    profil: 'Réseau national d’épiceries solidaires, souvent en quête d’approvisionnement local régulier.',
    produits: 'Tous produits, F&L appréciés.',
    rythme: 'À convenir avec l’épicerie voisine — grande souplesse.',
    site: 'andes-france.com',
    commentContacter: 'Carte des épiceries adhérentes sur le site.',
  },
]

/** Recommandation de fréquence de collecte à partir du gisement estimé (kg/jour). */
export function recommanderFrequence(kgJour: number): { titre: string; conseil: string } {
  if (kgJour >= 15) {
    return {
      titre: 'Collecte quotidienne recommandée',
      conseil:
        'À ce volume, surtout en frais, il faut un passage par jour. Si aucune association du quartier ne collecte ' +
        'quotidiennement, combinez-en deux : par exemple la Banque Alimentaire le mardi et le vendredi, et une ' +
        'association agile type Linkee ou Le Chaînon Manquant les autres jours. Chaque association signe ses propres ' +
        'bordereaux — Mana les rattache toutes au même registre.',
    }
  }
  if (kgJour >= 5) {
    return {
      titre: '2 à 3 passages par semaine recommandés',
      conseil:
        'Calez les passages sur vos jours de plus forte démarque (souvent lundi, jeudi et samedi). Une seule ' +
        'association bien choisie suffit en général ; ajoutez-en une seconde si le frais part trop vite entre deux passages.',
    }
  }
  return {
    titre: '1 à 2 passages par semaine suffisent',
    conseil:
      'Groupez les dons dans le bac dédié au frais (0–4 °C) et donnez la priorité aux produits à DLC courte le jour ' +
      'du passage. Une association de proximité (épicerie solidaire, centre Restos du Cœur) est idéale à ce volume.',
  }
}
