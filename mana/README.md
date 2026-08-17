# Mana — MVP

> **La manne cachée de vos invendus** — défiscalisation automatisée des dons d'invendus alimentaires
> pour commerces indépendants (article 238 bis du CGI).

Web-app 100 % front, mobile-first, en français. Aucune donnée ne quitte l'appareil :
persistance en `localStorage`, sauvegarde par export/import JSON. Déployable en statique.

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

Au premier lancement, un **jeu de démonstration** est préchargé : 2 magasins
(CA 1,97 M€ / marge 33,6 % et CA 1,68 M€ / marge 28,9 %) avec 6 semaines de saisies.
`⚙ → Réinitialiser la démo` pour le recharger.

## Hors périmètre (spec §4.7)

Pas de backend, pas d'auth, pas de scan code-barres, pas d'intégration caisse ni comptable,
pas de matching d'associations, pas de paiement en ligne.
