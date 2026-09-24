# Mana — MVP

> **La manne cachée de vos invendus** — défiscalisation automatisée des dons d'invendus alimentaires
> pour commerces indépendants (article 238 bis du CGI).

Web-app front mobile-first en français, déployable en statique (site façade `index.html` + portail `portail.html`,
installable en PWA sur Android). Persistance locale (`localStorage`) + **compte et synchronisation multi-appareils**
via Supabase (e-mail + mot de passe, table `mana_etats` protégée par RLS, stratégie « le plus récent gagne » avec
rafraîchissement au retour sur l'onglet). Sans compte, tout fonctionne en local ; export/import JSON en secours.

## Lancer en local

```bash
cd mana
npm install
npm run dev        # → http://localhost:5173
```

## Autres commandes

```bash
npm run verify     # vérifie les formules du moteur de calcul (spec §4.3) sur des exemples chiffrés
npm run build      # typecheck + build de production dans dist/ (déployable sur n'importe quel hébergement statique)
npm run preview    # sert le build de production
```

## Contenu du MVP (spec §4)

- **Simulateur public** (onglet d'accueil) : CA HT, marge brute, % de démarque (3 %), part donnable (50 %) → réduction d'impôt annuelle estimée, avec chaque formule affichée au clic.
- **Onboarding magasin** : CA HT → plafond `max(20 000 € ; 0,5 % × CA HT)`, marge de la liasse, coût moyen F&L (2,20 €/kg), success fee 25 %, collecteurs.
- **Saisie hebdomadaire** : PV démarque « don » emballés + kg F&L + justificatifs (photos/PDF) + note ; valorisation immédiate.
- **Dashboard** : jauge de plafond par société (élément signature), réduction acquise, projection fin d'année (rythme des 4 dernières semaines), gain net vs facture Mana, compteurs impact (repas, kg, CO₂).
- **Registre & documents** : registre horodaté (CSV + PDF), note de méthode datée/versionnée, état annuel de valorisation pour l'expert-comptable — PDF générés côté client (jsPDF).

## Module Facturation & vérification du CA (complément de spec)

- **Facturation mensuelle au succès** : 15 % de la base des dons documentés du mois (= 25 % de la réduction de 60 %),
  facture PDF par société à terme échu (TVA 20 %, numérotation `MANA-AAAA-NNN`, mention SEPA B2B), **arrêt automatique
  au plafond** avec proratisation du dernier mois.
- **Vérification du CA** : SIREN obligatoire vérifié via l'API Recherche d'Entreprises (api.gouv.fr), CA/marge
  verrouillés par un justificatif (liasse 2052 ou attestation d'expert-comptable), plafond calculé jamais éditable,
  garde-fou d'alerte au-delà de 2,5 % du CA. Code structuré pour brancher l'API INPI (`src/lib/entreprise.ts`).
- **Régularisation annuelle** : écran de clôture d'exercice (upload de la liasse définitive → facture complémentaire
  ou avoir avec détail du calcul) ; corrections « dons refusés » en négatif sur une semaine passée.
- **Transparence** : bloc « Votre contrat en clair » sur le dashboard (gain net vs commissions, date estimée
  d'atteinte du plafond).

Au premier lancement, un **jeu de démonstration** est préchargé : 2 magasins
(CA 1,97 M€ / marge 33,6 % et CA 1,68 M€ / marge 28,9 %) avec 6 semaines de saisies.
`⚙ → Réinitialiser la démo` pour le recharger.

## Hors périmètre (spec §4.7)

Pas de backend, pas d'auth, pas de scan code-barres, pas d'intégration caisse ni comptable,
pas de matching d'associations, pas de paiement en ligne.
