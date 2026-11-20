// Gestione delle notifiche push, caricata dal service worker dell'app (workbox importScripts).
// Se l'app è in primo piano non si mostra nulla: la sincronizza subito e mostra la propria campanella.

self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.some((c) => c.visibilityState === 'visible')) {
        wins.forEach((c) => c.postMessage({ type: 'cleanduo-push' }))
        return undefined
      }
      const base = self.registration.scope
      return self.registration.showNotification(data.title || 'CleanDuo', {
        body: data.body || '', tag: data.tag || undefined, icon: base + 'pwa-192.png', badge: base + 'pwa-192.png',
      })
    }),
  )
})

// Tocco su una notifica: riporta in primo piano l'app (o la apre)
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => (cs.length ? cs[0].focus() : self.clients.openWindow(self.registration.scope))),
  )
})
