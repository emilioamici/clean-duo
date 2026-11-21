// Gestione delle notifiche push, caricata dal service worker dell'app (workbox importScripts).
// Safari/WebKit non ammette push silenziose: per ogni push si mostra SEMPRE la notifica di sistema (altrimenti non compare
// e, dopo poche volte, l'iscrizione viene tolta). Se una finestra dell'app è in primo piano la si avvisa anche con un messaggio
// per sincronizzarsi subito; il `tag` evita i doppioni con la campanella e le notifiche precedenti.

self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.some((c) => c.visibilityState === 'visible')) wins.forEach((c) => c.postMessage({ type: 'cleanduo-push' }))
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
