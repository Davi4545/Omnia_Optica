// ============================================================
// OMNIA Ótica — Service Worker
//
// Estratégias:
//   HTML / navegação  → NETWORK-FIRST (nunca prende o usuário numa versão velha)
//   CSS / JS / ícones → STALE-WHILE-REVALIDATE (rápido, mas sempre atualiza)
//   Firebase / APIs   → NETWORK-ONLY (dado vivo jamais é cacheado)
//
// Caminhos são RELATIVOS: funciona na raiz ou em subpasta do domínio.
// ============================================================

const VERSION = "omnia-v3";
const SHELL = [
  "./", "./index.html", "./login.html", "./clientes.html",
  "./laboratorio.html", "./catalogo.html", "./comissao.html",
  "./ponto.html", "./relatorios.html", "./admin.html",
  "./catalogo-publico.html", "./diagnostico.html",
  "./css/omnia.css",
  "./js/firebase.js", "./js/utils.js", "./js/db.js", "./js/session.js",
  "./js/domain.js", "./js/login.js", "./js/app-ops.js", "./js/app-lab.js",
  "./js/app-crm.js", "./js/app-ponto.js", "./js/app-comissao.js",
  "./js/app-catalogo.js", "./js/app-relatorios.js", "./js/app-admin.js",
  "./js/app-catalogo-publico.js",
  "./manifest.json", "./icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // addAll falha inteiro se um arquivo faltar — adicionamos um a um.
    await Promise.all(SHELL.map((u) =>
      c.add(new Request(u, { cache: "reload" })).catch(() => null)
    ));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Permite que a página peça atualização imediata
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

const isLive = (url) =>
  url.hostname.includes("firebase") || url.hostname.includes("googleapis") ||
  url.hostname.includes("gstatic")  || url.hostname.includes("firebaseapp") ||
  url.hostname.includes("firebaseio");

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Dados vivos: nunca cacheia
  if (isLive(url)) return;

  // Navegação / HTML: rede primeiro, cache como rede de segurança offline
  const aceita = req.headers.get("accept") || "";
  if (req.mode === "navigate" || aceita.includes("text/html")) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(VERSION);
        c.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match(req)) ||
               (await caches.match("./index.html")) ||
               new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // Demais assets: entrega do cache e revalida em segundo plano
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const rede = fetch(req).then((res) => {
      // o clone precisa ser feito AGORA: se esperarmos o caches.open (assíncrono),
      // o corpo da resposta já terá sido consumido por quem pediu.
      if (res && res.status === 200 && res.type === "basic") {
        const copia = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copia)).catch(() => {});
      }
      return res;
    }).catch(() => cached);
    return cached || rede;
  })());
});
