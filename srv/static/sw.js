const CACHE='spendsnap-v1';
const ASSETS=['/','/static/style.css','/static/script.js','/static/manifest.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||e.request.url.includes('/api/'))return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))
});
