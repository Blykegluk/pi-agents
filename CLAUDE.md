# CLAUDE.md — dépôt pi-agents

Ce dépôt contient plusieurs projets. **Mana** est le projet actif. Les autres dossiers (`agents/`, `prompts/`,
`pipeline.sh`, `workflows.json` : chaîne vidéo ; `dashboard/` : a son propre CLAUDE.md) ne concernent pas Mana.
Point d'étape et prochaines actions : **NOTES.md**.

## Où est le code (important)

| Branche | Contenu |
|---|---|
| `claude/mana-mvp-simulator-dashboard-gqohve` | **Source de travail** : dossier `mana/`. Tout se développe et se commite ici. |
| `main` | Copie de `mana/` dans `portail-src/` (pour lecture), resynchronisée après chaque livraison. Ne pas y développer. |
| `gh-pages` | Build publié (site servi par GitHub Pages). |

Site en ligne : https://blykegluk.github.io/pi-agents/portail.html (portail) et `index.html` (vitrine).

## Mana en bref

Service français qui transforme les dons d'invendus alimentaires des commerces en réduction d'impôt mécénat
(art. 238 bis CGI : 60 % du coût de revient donné, plafond `max(20 000 € ; 0,5 % du CA HT)` par société et par exercice,
excédent reportable 5 ans). Rémunération : 30 % de la réduction obtenue (= 18 % de la base), sans abonnement.

- **Utilisateurs** : dirigeants de magasins bio indépendants / petits groupes (sociétés → magasins), leurs
  responsables de magasin (accès partagés), et l'équipe Mana (console Admin).
- **Client réel de référence** : groupe LAB SAS (éditeur de Mana) avec AEJB (magasin Léon Blum) et JAB (magasin Ornano),
  association « Le panier du lien ». user_id propriétaire : `04159b69-5552-4640-8cf5-86e8b2e975bb`.
- **Écrans** (`mana/src/App.tsx`) : Saisie, Magasins, Bilan, Messages ; Simulateur pour les visiteurs ; Admin pour
  les administrateurs (table `mana_admins`). Un invité (accès partagé) voit Saisie, Magasins, Bilan, Messages.
- **Fonctions clés** : saisie des bordereaux (scan IA) et relevés de démarque (lecture IA), calcul de la base et du
  plafond, factures mensuelles, reçus 2041-MEC-SD préremplis, état annuel, registre, contrat signé en ligne,
  surveillance nocturne des passages d'associations (signaux, rappels, dossiers de suivi), recherche d'associations
  de remplacement, réponses aux clients préparées par IA dans la console.

## Stack et architecture

- **Front** : Vite 5 + React 18 + TypeScript strict, `mana/`. Deux entrées : `index.html` (vitrine), `portail.html`
  (app, PWA : `public/manifest.webmanifest`, `public/sw.js`). PDF avec jsPDF, tableurs avec xlsx.
- **État client** : un seul objet `AppState` (schema 2 : `societes`, `magasins`, `saisies`, `factures`, `clotures`,
  `reponsesPassages`) en localStorage (`mana-state-v1`) et synchronisé dans `mana_etats.data` (jsonb, une ligne par
  compte, « le plus récent gagne »). Les données métier du client vivent dans ce JSON, pas dans des tables.
- **Organisation du code** : `src/lib/` = logique pure (calc, passages, signaux, rappels, suivi, resolution, reseau,
  facturation, pdf, cloud = accès Supabase) ; `src/components/` ; `src/views/` (un fichier par écran).
- **Supabase** (projet `wygptxqkptuabdefonhe`) :
  - Tables : `mana_etats` (+ `mana_etats_historique` rempli par le trigger `mana_etats_archive`), `mana_acces`
    (portée magasin, société ou tout le compte), `mana_admins`, `mana_contrats`, `mana_demandes` (dossiers : types
    `support`, `collecte`, `association`, `suivi`) → `mana_messages` (auteur `client` | `mana` | `association`),
    `mana_signaux`, `mana_surveillances` (journal des passages nocturnes), `mana_rappels`, `mana_courriels`
    (file d'e-mails), `mana_redactions` (proposé / envoyé des mails), `mana_brouillons_reponse` (réponses préparées),
    `mana_parametres` (clés `style`, `reponse_auto`). Tables `pl_*` : autre projet (Pennylane), ne pas toucher.
  - RLS partout ; fonctions SQL `mana_est_admin()`, `mana_a_acces()`, `mana_email_courant()`, `mana_marquer_lu()`.
  - Stockage : bucket privé `mana-bordereaux` (photos). Vault : `service_role_key` (JWT legacy, rôle service_role).
  - Cron `mana-surveiller-collectes` (`10 3 * * *` UTC) → Edge Function `surveiller-collectes` via `net.http_post`.
  - Trigger `mana_messages_demander_reponse` : chaque message `client` appelle `preparer-reponse` (pg_net, asynchrone).
- **Edge Functions** (source dans `mana/supabase/functions/`) : `lire-bordereau`, `lire-releve`, `analyser-association`,
  `trouver-associations`, `preparer-reponse` (Claude `claude-opus-5`), `rediger-mail` (`claude-sonnet-5`),
  `signer-contrat`, `surveiller-collectes` (moteur nocturne), `recevoir-courriel` (webhook entrant, `verify_jwt` false,
  protégé par `MANA_WEBHOOK_SECRET`). Les fonctions `pennylane-*`, `rapport`, `depot`, `publier` ne sont pas à Mana.
- **Secrets des fonctions** : `ANTHROPIC_API_KEY` (posé), `RESEND_API_KEY`, `MANA_EXPEDITEUR`, `MANA_WEBHOOK_SECRET`,
  `MANA_URL_PORTAIL` (non posés tant que le domaine n'existe pas, voir `mana/COURRIER.md`).
- **API externes** : Anthropic (Claude), recherche-entreprises.api.gouv.fr (vérification SIREN, `src/lib/entreprise.ts`),
  Resend (e-mail, pas encore actif).

## Commandes

```bash
cd mana
npm install
npm run dev                 # http://localhost:5173/portail.html
npm run build               # tsc --noEmit + vite build → dist/
npm run verify              # tests du moteur de calcul fiscal
npm run verify:passages     # tests du moteur de passages / signaux / rappels (vérifier « Tout est conforme. »)
npm run surveillance:preparer   # copie types + lib partagés dans surveiller-collectes et la FAQ dans preparer-reponse
```

- **Publier le site** : `npm run build`, puis dans un clone de la branche `gh-pages` : supprimer `assets/`, copier
  `mana/dist/.` à la racine, commit, push ; vérifier que `portail.html` en ligne référence le nouveau `portail-*.js`.
- **Resynchroniser main** : worktree sur `origin/main`, remplacer `portail-src/` par `mana/` (sans `node_modules`,
  `dist`) en gardant `portail-src/SOURCE.md` et `.gitignore`, commit, `git push origin HEAD:main`. `rsync` absent : utiliser `tar`.
- **Migrations** : écrire `mana/supabase/migrations/AAAAMMJJ_nom.sql`, puis l'appliquer via l'outil MCP Supabase
  `apply_migration` (pas de CLI supabase dans l'environnement).
- **Edge Functions** : `npm run surveillance:preparer` si `lib/` partagé a changé, puis déployer via l'outil MCP
  `deploy_edge_function` avec tous les fichiers (index.ts, types.ts, lib/*.ts). Test manuel : `select net.http_post(...)`
  avec la clé du vault, puis lire `net._http_response`.

## Conventions

- Tout en **français** : noms de variables, fonctions, fichiers, commentaires, textes. Textes d'interface **courts**
  (une phrase, pas de paragraphe) : l'utilisateur trouve le site trop verbeux.
- Les modules de `src/lib/` partagés avec les fonctions restent **purs** (pas d'API navigateur) et importent avec
  l'extension `.ts` (Deno) ; ils sont recopiés, jamais modifiés dans `supabase/functions/*/lib/`.
- Constantes métier nommées en majuscules dans leur module (`SEUIL_ALERTE_PASSAGES`, `TOLERANCE_HEURES`…).
- Commits : message en français, pied `Co-Authored-By` + `Claude-Session` ; aucun identifiant de modèle dans les
  messages, PR ou commentaires. Pas de PR sans demande.
- Ne jamais écrire dans les données d'un client (`mana_etats`) en tant qu'admin sans demande explicite.

## Décisions (et pourquoi)

- Le relevé de démarque fixe la valeur ; le bordereau n'est que la preuve du passage — c'est le relevé qui est opposable.
- Un jour de passage prévu sans bordereau 24 h après la fin du créneau = **passage manqué** (l'association n'est pas passée) ;
  le magasin corrige en un clic s'il en était autrement — l'utilisateur ne veut pas avoir à justifier chaque jour.
- Paliers : 1 manqué = info, 2 = dossier de suivi, 3 = alerte et recherche de remplaçante ; relance sans réponse sous 7 jours.
- La surveillance d'un magasin commence à son premier bordereau — sinon fausses alertes avant le démarrage réel (12/09/2026).
- Relevé du mois précédent attendu à partir du 10, seulement pour les mois avec bordereaux.
- Pas d'alerte « jours sans bordereau alors que le relevé déclare une valeur » — le relevé est hebdomadaire, les scans peuvent dater du lendemain.
- Statut d'une demande côté client = auteur du dernier message (« Mana vous a répondu »), le statut en base ne bouge pas à la réponse.
- Reçu fiscal : le modèle Mana suffit (BOI-RES-BIC-000129) ; le Cerfa 2041-MEC-SD officiel est une alternative, pas une obligation.
- Réponses aux clients : toujours préparées, validées par un humain ; envoi autonome seulement après 20 réponses validées
  dont 85 % à moins de 15 % de retouche, et pour les réponses que le modèle juge sûres (seuils dans `src/lib/ecart.ts`
  et `preparer-reponse`, revérifiés à chaque envoi).
- Page Magasins en une colonne : Associations, puis société, puis accès. Les 5 étapes de mise en place ne servent qu'aux
  magasins pas encore en place ; ensuite « Guide de l'équipe ».
- Bilan : « Résultat net pour le groupe » dans le bloc consolidé (≥ 2 sociétés), « pour la société » sinon.

## Pièges connus

- La clé `service_role_key` du vault (JWT legacy) ≠ `SUPABASE_SERVICE_ROLE_KEY` de l'environnement : les fonctions
  appelées par cron/trigger acceptent un JWT dont le rôle est `service_role` (`roleDuJeton`), ne pas « simplifier ».
- `npm run verify:passages | tail -1` a masqué un plantage : chercher `✗` ou « Tout est conforme. » dans toute la sortie.
- Une règle CSS globale (`.cal-legende span::before`) a pollué le calendrier de Saisie : préfixer les styles de composant
  (`.calendrier-passages …`).
- Les copies de fonctions déployées sont parfois allégées (commentaires retirés) pour tenir dans l'appel de déploiement :
  la source de vérité reste le dépôt.
- `rm -rf *` est bloqué par le contrôle de sécurité : repartir d'un dossier neuf. `python3` casse sur pypdf : utiliser
  `python3.12` (`--user --break-system-packages`). jsPDF en Node : patcher `jsPDF.API.save`, pas le prototype.
- Chromium de test : `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` (playwright-core),
  après `npx vite preview --port 4173` ; tuer le serveur ensuite (`pkill -f "vite preview"`, code de sortie 144 attendu).
- Pas de CLI `supabase`, `gh` ni `deno` dans l'environnement : Supabase via MCP, GitHub via MCP.
