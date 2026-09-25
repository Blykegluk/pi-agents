#!/usr/bin/env sh
# Copie les modules purs partagés dans la fonction Supabase `surveiller-collectes`,
# pour que le moteur nocturne tourne exactement le même code que le site.
# À lancer avant chaque déploiement de la fonction.
set -e
cd "$(dirname "$0")/.."
dest=supabase/functions/surveiller-collectes
mkdir -p "$dest/lib"
cp src/types.ts "$dest/types.ts"
for f in calc iso passages signaux suivi rappels resolution; do cp "src/lib/$f.ts" "$dest/lib/$f.ts"; done
echo "Modules copiés dans $dest (types, calc, iso, passages, signaux, suivi, rappels, resolution)."
