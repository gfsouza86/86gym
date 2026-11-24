/* 86 Training & Grind — Service Worker
   - Guarda o app (HTML, manifest, ícones) para abrir offline
   - Guarda as fontes do Google Fonts
   - Mantém as notificações de fim de descanso
   Se você mudar a lista SHELL abaixo, aumente o número de VERSION. */

const VERSION = 'v1';
const SHELL_CACHE = '86gym-shell-' + VERSION;
const FONT_CACHE  = '86gym-fonts-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      // allSettled: se um arquivo faltar, os outros ainda são guardados
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('86gym-shell-') && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fontes do Google: guarda na primeira vez e reutiliza depois
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // GitHub (sync), ExerciseDB, imagens externas etc.: não mexe
  if (url.origin !== self.location.origin) return;

  // Abrir o app: tenta a internet (para pegar versão nova), cai no cache se offline/lento
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req));
    return;
  }

  // Demais arquivos do app: usa o cache e atualiza em segundo plano
  e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // 4s de limite: com sinal ruim na academia, abre do cache em vez de travar
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(reject, 4000))
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    return (await cache.match(req, { ignoreSearch: true }))
        || (await cache.match('./index.html'))
        || (await cache.match('./'))
        || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (_) {
    return Response.error();
  }
}

/* ===== Notificações de fim de descanso (mesmo comportamento de antes) ===== */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'scheduleNotification') {
    let delay = e.data.endTime - Date.now();
    if (delay < 0) delay = 0;
    setTimeout(() => {
      self.registration.showNotification(e.data.title || 'Descanso terminou', {
        body: e.data.body || 'Hora da próxima série',
        tag: '86gym-rest',
        renotify: true,
        vibrate: [200, 100, 200, 100, 200]
      });
    }, delay);
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((cs) => {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
