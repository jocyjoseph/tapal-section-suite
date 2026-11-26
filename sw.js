const CACHE = "tapal-suite-v16";
const FILES = ["./", "./index.html", "./style.css", "./js/config.js", "./js/api.js", "./js/postage.js", "./js/delivery.js", "./js/address.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener("fetch", e => {
  if (e.request.url.includes("script.google.com") || location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return; // Always fetch fresh files while running locally in VS Code
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
