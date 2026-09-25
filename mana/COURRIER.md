## Activer le courrier (e-mail sortant et entrant)

Tout est en place côté code ; il manque le domaine. Quand manaforgood.fr (ou .com/.org) est réservé :

1. **Resend** : créer un compte, ajouter le domaine, poser les enregistrements DNS donnés par Resend
   (SPF, DKIM, DMARC), puis créer une clé d'API. Activer aussi la réception (« Receiving ») sur le
   domaine et pointer le webhook `email.received` vers
   `https://wygptxqkptuabdefonhe.supabase.co/functions/v1/recevoir-courriel?cle=<MANA_WEBHOOK_SECRET>`.
2. **Secrets Supabase** (Edge Functions › Secrets) :
   - `RESEND_API_KEY` : la clé Resend.
   - `MANA_EXPEDITEUR` : `Mana <bonjour@manaforgood.fr>` (l'adresse de réponse des fils sera `suivi+<id>@manaforgood.fr`).
   - `MANA_WEBHOOK_SECRET` : une chaîne longue au hasard, la même que dans l'URL du webhook.
   - `MANA_URL_PORTAIL` (facultatif) : l'adresse publique du portail, reprise en pied des e-mails.
3. Rien à redéployer : la fonction nocturne expédie la file d'attente `mana_courriels` dès qu'elle
   trouve `RESEND_API_KEY` et `MANA_EXPEDITEUR` ; les e-mails accumulés avant l'activation partent
   au premier passage (les supprimer avant si on ne veut pas les envoyer : `delete from mana_courriels where statut = 'en_attente'`).
4. Vérifier avec « Lancer maintenant » dans la console : la ligne de surveillance indique le nombre d'e-mails expédiés.

Ce que le courrier fait, une fois actif : chaque rappel du matin et chaque message de suivi part aussi
par e-mail au compte et aux accès partagés du magasin ; une association qui répond à un mail de suivi
voit sa réponse tomber dans le fil du dossier et clore la boucle de résolution.
