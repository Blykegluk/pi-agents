/* Service worker Mana — réseau d'abord, cache en secours (usage hors-ligne en magasin). */
const CACHE = 'mana-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== location.origin) return
  event.respondWith(
    fetch(event.request)
      .then((reponse) => {
        const copie = reponse.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copie))
        return reponse
      })
      .catch(() =>
        caches.match(event.request).then(
          (enCache) =>
            enCache ??
            (event.request.mode === 'navigate' ? caches.match('./portail.html') : Response.error()),
        ),
      ),
  )
})
