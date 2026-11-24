// Service worker: permite instalar la app y abrirla sin conexión (modo demo).
const VERSION = 'dentalcrm-v3';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/reglas.js', 'js/ui.js', 'js/catalogos.js', 'js/seed.js', 'js/nativo.js',
  'js/vistas/agenda.js', 'js/vistas/comun.js', 'js/vistas/config.js', 'js/vistas/dashboard.js', 'js/vistas/kanban.js',
  'js/vistas/odontograma.js', 'js/vistas/paciente.js', 'js/vistas/pacientes.js', 'js/vistas/pagos.js',
  'js/vistas/prospectos.js', 'js/vistas/tratamientos.js', 'icons/icon-192.png', 'icons/icon-512.png'
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Red primero (para tener siempre la última versión) y caché como respaldo sin conexión.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/dl/')) return;
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
