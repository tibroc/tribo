// Dedicated push service worker. Registered with a narrow scope so it
// coexists with the vite-plugin-pwa caching worker (which owns '/'): push
// delivery is per-registration, not per-scope, so this worker only ever
// handles push + notification clicks and never intercepts fetches.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* show fallback */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tribo', {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return clients.openWindow('/')
    })
  )
})
