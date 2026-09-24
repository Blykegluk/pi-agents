# Mana — Portail : code source (copie de travail)

Copie non compilée de l'application « Mana — Portail » (Vite + React + TypeScript).

- `portail.html` : l'application (point d'entrée `src/main.tsx`, styles dans `src/styles.css`).
- `index.html` : la page vitrine.
- `src/` : composants, vues, calculs (`lib/calc.ts`), accès Supabase (`lib/cloud.ts`).
- `public/` : icônes, logo, manifeste PWA.

Installation : `npm install` puis `npm run dev`. Build : `npm run build` (sortie dans `dist/`, non versionnée).

La version déployée est servie par GitHub Pages (branche `gh-pages`), construite depuis le dossier `mana/`
de la branche de développement `claude/mana-mvp-simulator-dashboard-gqohve`. Toute modification faite ici
doit être reportée dans ce dossier pour être déployée.
