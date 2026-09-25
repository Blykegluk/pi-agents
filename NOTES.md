# NOTES.md — point d'étape Mana (26/09/2026)

Contexte durable : **CLAUDE.md**. Ce fichier dit où on en est. Branche de travail :
`claude/mana-mvp-simulator-dashboard-gqohve`, dossier `mana/`.

## Terminé et en ligne

- App complète (Saisie, Magasins, Bilan, Messages, Admin) publiée sur GitHub Pages ; `main/portail-src` synchronisé.
- Moteur de surveillance nocturne (`surveiller-collectes`, cron 03:10 UTC) : passages manqués, signaux, dossiers de suivi,
  rappels au magasin, boucle de relance / remplacement, file d'e-mails. Tests `verify:passages` au vert.
- Console Admin : onglets À faire, Dossiers, Signaux, Clients, Réponses & style, Documents ; mails préparés aux
  associations ; recherche d'associations de remplacement.
- Réponses aux clients préparées par IA à chaque message (`preparer-reponse` + trigger SQL), validation / correction /
  autre version, mesure de l'écart, interrupteur d'envoi autonome (verrouillé tant que le seuil n'est pas atteint).
- Accès partagés par magasin, société ou tout le compte.
- Refonte de l'interface (session du 25-26/09) : page Magasins en une colonne ; associations gérées sur place
  (`src/components/AssociationsMagasin.tsx`) ; mise en place en 5 étapes réservée aux nouveaux magasins, « Guide de
  l'équipe » ensuite (`src/views/Collecte.tsx`) ; calendrier des passages mensuel au format de Saisie
  (`src/components/CalendrierPassages.tsx`) ; textes raccourcis sur tout le site ; statut des demandes d'après le dernier message.
- Import CSV de magasins, facture consolidée par magasin. Reçu fiscal test AEJB au modèle Mana dans le dépôt
  (`mana/mana-recu-fiscal-238bis-aejb-le-panier-du-lien-2026.pdf`) ; le Cerfa officiel rempli a été produit hors dépôt.

## En cours / où on s'est arrêtés

- Rien n'est à moitié écrit : le dernier commit (calendrier des passages mensuel) est livré, publié et synchronisé.
- La refonte « moins de texte » a couvert les écrans principaux ; restent verbeux : les formulaires d'onboarding
  société / magasin (`src/views/Magasins.tsx`, `FormulaireSociete` et `FormulaireMagasin`), `ImportMagasins.tsx`,
  `ContratModal.tsx`, le Simulateur.
- Non vérifié avec une vraie session : l'affichage de la console (réponses préparées, À faire) et le nouveau bloc
  Associations avec les demandes réelles ont été testés sur données de démonstration seulement.

## Bugs et problèmes ouverts

- **Reçu fiscal et état annuel bloqués** : relevés de démarque manquants pour les bordereaux du 12/09 (S37) et du
  21 au 24/09 (S39), à Léon Blum comme à Ornano. Seul S38 (14-20/09) a un relevé.
- **Associations sans e-mail** : « Le panier du lien » n'a pas d'e-mail enregistré (Léon Blum et Ornano) ; les mails de
  relance ne peuvent pas partir tels quels, et le formulaire exige désormais un e-mail pour modifier la fiche.
- **Rythme de Léon Blum imprécis** : « Quotidienne » sans jours ; Mana suppose du lundi au samedi. Ornano : « du lundi
  au dimanche ». À confirmer avec l'association, sinon fausses alertes.
- **E-mail inactif** : pas de domaine, donc ni envoi (Resend) ni réception ; les messages restent dans l'app.
- `rediger-mail` (« Appliquer mon style ») jamais testé en conditions réelles (demande une session admin).
- `rediger-mail` tourne sur `claude-sonnet-5`, les autres fonctions IA sur `claude-opus-5` : à harmoniser (à vérifier / décider).

## Prochaines étapes (par priorité)

1. Saisir les relevés S37 et S39 pour débloquer reçus et état annuel.
2. Compléter la fiche de « Le panier du lien » : e-mail, jours et créneau réels, pièces d'éligibilité (rescrit L. 80 C).
3. Tester en réel la console : valider / corriger quelques réponses préparées, « Appliquer mon style », « Déduire les règles ».
4. Acheter le domaine (manaforgood.fr ?) et activer le courrier : étapes dans `mana/COURRIER.md`.
5. Finir la réduction de texte sur les formulaires d'onboarding, l'import CSV, le contrat et le Simulateur.
6. Optionnel : bouton « Télécharger le Cerfa rempli » dans Bilan (le remplissage du PDF officiel est déjà validé hors app).

## Questions en attente de ta décision

- Passer les fonctions IA sur Claude Opus 5.5 (≈ 20 % moins cher au token) ? Si oui, lesquelles, et tester la qualité avant.
- Nom de domaine définitif et adresse d'expédition (`bonjour@…`).
- Rythme réel de passage de « Le panier du lien » à Léon Blum (jours précis).
- Activer un jour l'envoi autonome des réponses : seuil actuel 20 réponses / 85 %, à garder ou ajuster ?
