// Service worker: tiene una copia dell'applicazione per il funzionamento offline.
// Va aggiornata VERSIONE a ogni pubblicazione, altrimenti la copia vecchia resta.

const VERSIONE = "spese-v2";

const RISORSE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./dati.js",
  "./manifest.webmanifest",
  "./icona-192.png",
  "./icona-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSIONE)
      .then((deposito) => deposito.addAll(RISORSE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomi) =>
        Promise.all(nomi.filter((nome) => nome !== VERSIONE).map((nome) => caches.delete(nome)))
      )
      .then(() => self.clients.claim())
  );
});

// Prima la rete, poi la copia locale: chi è online vede subito le versioni
// aggiornate, e restare bloccati su una copia vecchia diventa impossibile.
self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET" || new URL(richiesta.url).origin !== self.location.origin) {
    return;
  }

  evento.respondWith(
    fetch(richiesta)
      .then((risposta) => {
        if (risposta.ok) {
          const copia = risposta.clone();
          caches.open(VERSIONE).then((deposito) => deposito.put(richiesta, copia));
        }
        return risposta;
      })
      .catch(async () => {
        const salvata = await caches.match(richiesta);
        if (salvata) return salvata;
        // Senza rete una navigazione qualsiasi deve comunque aprire la app.
        if (richiesta.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
