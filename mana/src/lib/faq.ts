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
      'Seuls les F&L partent au poids (les produits emballés sont valorisés par le montant de démarque — on compte simplement les colis remis : bacs, cartons ou sacs). Pesez chaque cagette ou sac sur la balance du rayon ou un pèse-personne, déduisez la tare (~1 kg pour une cagette bois, négligeable pour un sac), notez le total sur le bordereau que le collecteur signe. Prenez le bordereau en photo et joignez-le à la saisie de la semaine.',
    motsCles: 'peser pesee poids fruits legumes balance bordereau tare kg sac cagette colis',
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
      'L’état annuel de valorisation (onglet Registre), qui récapitule base, plafond et réduction et rappelle le report sur l’imprimé 2069-RCI. Le registre des dons et la note de méthode l’accompagnent. Le reçu fiscal 2041-MEC-SD, lui, est généré prérempli par Mana (même onglet) : vous le faites signer par l’association, qui reste seule à pouvoir le délivrer. Mana n’est pas un conseil fiscal : c’est votre expert-comptable qui valide.',
    motsCles: 'expert comptable etat annuel 2069 2041 cerfa documents liasse',
  },
  {
    question: 'Qui remplit le reçu fiscal (Cerfa 2041-MEC-SD) ?',
    reponse:
      'C’est l’association qui délivre le reçu — vous ne pouvez pas vous l’établir à vous-même. Mais la note 5 du formulaire prévoit que l’organisme reporte la valeur des dons en nature indiquée par l’entreprise donatrice : concrètement, Mana génère le reçu prérempli (votre société lue au registre national, le montant en chiffres et en toutes lettres, la période, et une annexe décrivant les biens mois par mois), et l’association n’a plus qu’à compléter son bloc, dater, signer et cacheter. Un reçu par association et par exercice, pour la valeur totale qu’elle a reçue — même avec un enlèvement par jour (la note 9 autorise un reçu unique par période, à condition qu’elle ne chevauche pas deux exercices). Si vous travaillez avec plusieurs associations, indiquez à chaque saisie laquelle est passée : chacune reçoit son propre reçu.',
    motsCles: 'recu fiscal cerfa 2041 mec sd 16216 association signature qui remplit annuel',
  },
  {
    question: 'Comment scanner un bordereau au lieu de tout retaper ?',
    reponse:
      'Dans l’onglet Saisie, « Scanner le bordereau signé » : photographiez le bordereau à la fin du passage. La photo est compressée, archivée dans votre espace privé, puis lue automatiquement — colis remis, poids net des fruits & légumes, association, nom du collecteur, refus, présence des signatures. Mana affiche ce qu’il a lu avec un niveau de confiance et la liste de ses doutes ; rien n’est enregistré tant que vous n’avez pas cliqué sur « Reporter dans la saisie », et vous pouvez corriger chaque champ ensuite. Un chiffre illisible n’est jamais deviné : il reste vide et vous est signalé. Le montant de démarque, lui, ne figure pas sur le bordereau — il vient de votre back-office et reste à saisir.',
    motsCles: 'scan scanner photo bordereau lecture automatique ocr saisie automatique appareil photo',
  },
  {
    question: 'Où est suivi l’excédent au-delà du plafond ? Comment le récupérer l’année suivante ?',
    reponse:
      'L’excédent ne figure sur aucun reçu fiscal : le reçu atteste ce que l’association a reçu en totalité, sans plafond. C’est votre déclaration qui porte le plafonnement et le report, sur l’imprimé 2069-RCI joint à la liasse (dons de l’exercice, excédents antérieurs imputés, base retenue, excédent à reporter). L’état annuel de Mana tient ce suivi d’une année sur l’autre : origine de chaque excédent, montant imputé, solde, dernier exercice d’imputation (origine + 5). L’imputation se fait après les dons de l’année, dans la limite du plafond restant, au plus ancien d’abord — rien à faire signer à l’association.',
    motsCles: 'excedent report reportable 5 ans plafond 2069 rci suivi stock recuperer',
  },
  {
    question: 'Pourquoi dois-je fournir ma liasse fiscale ?',
    reponse:
      'Votre chiffre d’affaires et votre marge déterminent le plafond de dons et la valorisation : ils doivent être opposables en cas de contrôle. C’est pourquoi ils sont adossés à la liasse 2052 (ou à une attestation d’expert-comptable) et jamais saisis librement. À chaque clôture d’exercice, la nouvelle liasse permet la régularisation.',
    motsCles: 'liasse 2052 justificatif ca marge verification siren pourquoi',
  },
]
