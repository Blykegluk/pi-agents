# Mettre le site en ligne (URL publique à partager)

Le site est un site statique : il n'y a rien à installer ni à compiler.
Deux options, au choix. **Vercel est la plus rapide.**

---

## Option 1 — Vercel (≈ 2 minutes, recommandé)

1. Allez sur [vercel.com/new](https://vercel.com/new) et connectez-vous avec GitHub.
2. Choisissez le dépôt **Blykegluk/pi-agents** puis *Import*.
3. Réglages :
   - *Framework Preset* : **Other**
   - *Build Command* : laisser vide
   - *Output Directory* : **wedding-site** (déjà pré-rempli par `vercel.json`)
4. Cliquez **Deploy**.

Vous obtenez une URL du type `https://pi-agents.vercel.app` à partager aux invités.

**Pour publier depuis la branche du site** (et non `main`) : dans le projet Vercel,
*Settings → Git → Production Branch* → `claude/john-sara-wedding-site-8hdar0`.

**Pour une jolie adresse** : *Settings → Domains* → ajoutez par exemple
`sara-john.vercel.app`, ou votre nom de domaine si vous en achetez un.

---

## Option 2 — GitHub Pages (gratuit, sans compte supplémentaire)

Le workflow `.github/workflows/deploy-wedding-site.yml` est déjà prêt.

1. Sur GitHub : **Settings → Pages** → *Source* : **GitHub Actions**.
2. Toujours dans **Settings → Environments → github-pages** →
   *Deployment branches* → ajoutez `claude/john-sara-wedding-site-8hdar0`
   (ou fusionnez la branche dans `main`, qui est déjà autorisée).
3. **Actions → Deploy wedding site to GitHub Pages → Run workflow**.

L'adresse sera `https://blykegluk.github.io/pi-agents/`.

---

## Rappel : le mot de passe du site

`Rome2027` (insensible à la casse). Il se change dans `js/config.js` —
il faut y mettre l'empreinte SHA-256 du nouveau mot de passe en minuscules.

## Rappel : les réponses RSVP

Tant que `rsvpEndpoint` est vide dans `js/config.js`, le formulaire affiche
« le formulaire ouvrira très bientôt ». Voir `apps-script/README-RSVP.md`
pour le brancher sur un Google Sheet (5 minutes).
