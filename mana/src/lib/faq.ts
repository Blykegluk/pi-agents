/**
 * Base de questions-réponses cherchable. Si la réponse n'y est pas,
 * l'utilisateur envoie une demande à Mana (traitée depuis la console admin).
 */

export interface EntreeFAQ {
  question: string
  reponse: string
  motsCles: string
}

export const FAQ: EntreeFAQ[] = [
  {
    question: 'Quels produits ai-je le droit de donner ?',
    reponse:
      'Tout produit encore consommable : DLC de demain ou après-demain (à sortir avant la date, jamais après), DDM dépassée (« à consommer de préférence avant »), fruits et légumes moches mais sains, pain de la veille, emballages abîmés mais intacts. Jamais : DLC dépassée, produit entamé ou déconditionné, chaîne du froid rompue, alcool. L’affiche à imprimer est dans l’onglet Collecte, étape 4.',
    motsCles: 'dlc ddm date tri donner produits interdits alcool frais',
  },
  {
    question: 'Quelle est la différence entre DLC et DDM ?',
    reponse:
      'DLC = « à consommer jusqu’au » : après la date, le produit est impropre — on ne le donne jamais. DDM = « à consommer de préférence avant » : après la date, le produit reste sûr (qualité éventuellement moindre) — il est donnable.',
    motsCles: 'dlc ddm date limite peremption difference',
  },
  {
    question: 'Comment se passe la mise en relation avec une association ?',
    reponse:
      'Dans l’onglet Collecte, définissez votre volume d’invendus, la fréquence et la plage horaire de ramassage souhaitées, puis envoyez votre demande de mise en relation : l’équipe Mana vous met en contact avec la ou les associations adaptées de votre secteur et vous suit jusqu’à la première collecte. Vous pouvez aussi contacter directement une association de l’annuaire — vous gardez toujours la relation en direct.',
    motsCles: 'association collecteur mise en relation banque alimentaire restos coeur trouver contact',
  },
  {
    question: 'Qui fait quoi au quotidien, et que reste-t-il pour la saisie hebdomadaire ?',
    reponse:
      'Chaque jour : l’équipe scanne les produits donnés avec le motif « don » (le back-office accumule les € tout seul — personne ne les consulte), et chaque bordereau signé part dans une bannette. Une fois par semaine (10 minutes) : ouvrez l’export démarque « don » de la semaine (un total en €), additionnez les poids nets F&L des bordereaux de la bannette (un total en kg), saisissez les deux chiffres dans Mana et joignez tous les bordereaux signés de la semaine — en photo, au fil de l’eau ou en une fois. Astuce : la photo du bordereau au moment de la signature, depuis le téléphone, évite toute perte.',
    motsCles: 'quotidien routine semaine bordereaux journaliers joindre organisation qui fait quoi bannette',
  },
  {
    question: 'Comment peser les fruits et légumes ?',
    reponse:
      'Seuls les F&L partent au poids (les produits emballés sont valorisés par le montant de démarque). Pesez la cagette sur la balance du rayon ou un pèse-personne, déduisez la tare (~1 kg par cagette bois), notez le total sur le bordereau que le collecteur signe. Prenez le bordereau en photo et joignez-le à la saisie de la semaine.',
    motsCles: 'peser pesee poids fruits legumes balance bordereau tare kg',
  },
  {
    question: 'Combien Mana me coûte-t-il ?',
    reponse:
      '0 € d’abonnement. Mana prend 30 % de l’économie d’impôt réellement générée (soit 18 % de la valeur documentée des dons), facturés chaque mois échu. Pas d’économie = pas de facture, et la facturation s’arrête automatiquement quand votre plafond fiscal est atteint. Le détail du calcul figure sur chaque facture.',
    motsCles: 'prix cout commission facture abonnement tarif pourcentage honoraires',
  },
  {
    question: 'C’est quoi, le plafond fiscal ?',
    reponse:
      'La loi retient vos dons dans la limite de 20 000 € ou 0,5 % de votre chiffre d’affaires HT (le plus élevé des deux), par société et par exercice. La jauge du tableau de bord suit ce plafond en temps réel ; au-delà, vos dons ne sont plus facturés. L’excédent est reportable sur les 5 exercices suivants, mais il n’est absorbé que s’il reste de la place sous le plafond de ces années-là (après les dons de l’année) — s’il ne trouve jamais de place, il expire au bout de 5 ans. La bonne stratégie : viser le plafond, pas le dépasser largement.',
    motsCles: 'plafond 20000 0,5 limite jauge excedent reportable cumul expiration',
  },
  {
    question: 'Et si ma société paie peu ou pas d’impôt cette année ?',
    reponse:
      'Rien n’est perdu : la réduction d’impôt qui dépasse l’IS dû de l’exercice est utilisable pour payer l’IS des 5 exercices suivants (article 220 E du CGI). C’est un report distinct de celui des dons dépassant le plafond, eux aussi reportables 5 exercices (article 238 bis). Votre expert-comptable gère cette imputation via l’imprimé 2069-RCI, sur la base de l’état annuel Mana.',
    motsCles: 'deficit pas impot is report reliquat imputation 220 excedent perte',
  },
  {
    question: 'L’association a refusé une partie des dons, que faire ?',
    reponse:
      'Dans l’onglet Saisie, cochez « Correction : retrancher des dons refusés », saisissez les montants en négatif sur la semaine concernée avec le justificatif du refus : le cumul, le plafond et la prochaine facture se recalculent automatiquement.',
    motsCles: 'refus refuse correction negatif retrancher erreur',
  },
  {
    question: 'Puis-je saisir tous les jours plutôt qu’une fois par semaine ?',
    reponse:
      'Oui : dans la fiche du magasin (onglet Magasins), passez la fréquence de saisie en « quotidienne ». Chaque journée s’ajoute au cumul de la semaine — le calcul fiscal reste hebdomadaire.',
    motsCles: 'frequence quotidien journalier hebdomadaire saisie jour',
  },
  {
    question: 'Mes données sont-elles partagées entre mes appareils ?',
    reponse:
      'Oui, dès que vous êtes connecté à votre compte (e-mail + mot de passe ou Google) : le site et l’application affichent exactement les mêmes données, synchronisées automatiquement. Sans compte, les données restent sur l’appareil. L’export JSON (⚙) reste votre sauvegarde de secours.',
    motsCles: 'synchronisation compte appareils telephone ordinateur donnees connexion google',
  },
  {
    question: 'Comment installer l’application sur mon téléphone Android ?',
    reponse:
      'Ouvrez le portail dans Chrome, menu ⋮ puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »). Mana s’installe avec son icône, s’ouvre en plein écran et fonctionne même hors connexion en magasin.',
    motsCles: 'installer application android telephone pwa ecran accueil hors ligne',
  },
  {
    question: 'Que dois-je transmettre à mon expert-comptable ?',
    reponse:
      'L’état annuel de valorisation (onglet Registre), qui récapitule base, plafond et réduction, liste les reçus fiscaux 2041-MEC-SD à obtenir des associations et rappelle le report sur l’imprimé 2069-RCI. Le registre des dons et la note de méthode l’accompagnent. Mana n’est pas un conseil fiscal : c’est votre expert-comptable qui valide.',
    motsCles: 'expert comptable etat annuel 2069 2041 cerfa documents liasse',
  },
  {
    question: 'Pourquoi dois-je fournir ma liasse fiscale ?',
    reponse:
      'Votre chiffre d’affaires et votre marge déterminent le plafond de dons et la valorisation : ils doivent être opposables en cas de contrôle. C’est pourquoi ils sont adossés à la liasse 2052 (ou à une attestation d’expert-comptable) et jamais saisis librement. À chaque clôture d’exercice, la nouvelle liasse permet la régularisation.',
    motsCles: 'liasse 2052 justificatif ca marge verification siren pourquoi',
  },
]
