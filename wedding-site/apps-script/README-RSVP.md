# Brancher le RSVP sur un Google Sheet (≈ 5 minutes)

Le formulaire RSVP du site envoie les réponses à un petit script Google
(« Apps Script ») attaché à un Google Sheet de votre compte. Voici comment le
mettre en place, une seule fois :

## 1. Créer le Google Sheet
1. Allez sur [sheets.new](https://sheets.new) et nommez le fichier, par
   exemple **« RSVP — Mariage Sara & John »**.

## 2. Ajouter le script
2. Dans le Sheet : menu **Extensions → Apps Script**.
3. Supprimez le contenu affiché et collez **tout** le contenu du fichier
   [`rsvp.gs`](./rsvp.gs), puis enregistrez (icône disquette).
4. Dans la barre du haut, choisissez la fonction **`setup`** puis cliquez
   **Exécuter**. Autorisez le script quand Google le demande (c'est votre
   propre script, l'avertissement est normal : « Paramètres avancés →
   Accéder au projet »).
   → Les onglets **Réponses** et **Récap** sont créés automatiquement.

## 3. Déployer le service
5. Cliquez **Déployer → Nouveau déploiement**.
6. Type : **Application Web**. Réglages :
   - *Exécuter en tant que* : **Moi**
   - *Qui a accès* : **Tout le monde**
7. Cliquez **Déployer** et copiez l'**URL de l'application Web**
   (elle se termine par `/exec`).

## 4. Brancher le site
8. Dans le fichier [`../js/config.js`](../js/config.js), collez cette URL :
   ```js
   rsvpEndpoint: "https://script.google.com/macros/s/XXXXX/exec",
   ```
9. Commitez/poussez le changement — c'est terminé. Chaque réponse ajoute une
   ligne dans **Réponses**, et **Récap** (nombre de foyers, nombre total de
   personnes, présents par événement) se met à jour tout seul.

> Astuce : ouvrez l'URL `/exec` dans votre navigateur — si vous voyez
> « le service est en ligne ✔ », tout fonctionne.

> Note : tant que `rsvpEndpoint` est vide, le formulaire du site affiche
> « Le formulaire ouvrira très bientôt » au lieu d'envoyer.
