importScripts("./zip-stream.js");

const cacheName = 'easybackup-cache';
const filestoCache = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg',
    "./icon.png",
    "./zip-stream.js",
    "./assets/index.css",
    "./assets/index.js",
    'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;700&display=swap',
];
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(cacheName)
            .then(cache => cache.addAll(filestoCache))
    );
});
self.addEventListener('activate', e => self.clients.claim());
const downloadLink = new Map();
const mainComms = new BroadcastChannel("ServiceComms");
const zipFile = {
    enqueue: undefined,
    close: undefined,
    stream: undefined
}
zipFile.stream = new self.ZIP({ // Create a new ZIP file, using the "zip-stream" example from StreamSaver.JS
    start(ctrl) {
        zipFile.enqueue = ctrl.enqueue;
        zipFile.close = ctrl.close;
    },
});
self.addEventListener("message", (msg) => {
    switch (msg.data.request) {
        case "CreateFile":
            zipFile.close();
            const link = `${self.location.href}${self.location.href.endsWith("/") ? "" : "/"}${msg.data.name}${msg.data.name.endsWith(".zip") ? "" : ".zip"}`
            downloadLink.set(link, zipFile.stream);
            mainComms.postMessage({ request: "url", content: link });
            break;
        case "AddFile":
            zipFile.enqueue(msg.data.file, msg.data.path);
            mainComms.postMessage({ request: "file", content: msg.data.id });
            break;
    }
})
self.addEventListener('fetch', async (event) => {
    const req = event.request;
    if (req.url.indexOf("update") !== -1 || req.url.indexOf("gstatic.com") !== -1 && navigator.userAgent.indexOf("Firefox") !== -1) event.respondWith(await fetch(req)); else event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
    const downloadRequest = downloadLink.get(req.url);
    if (downloadRequest) {
        const responseHeaders = new Headers({ // Borrowed from StreamSaver.js.
            'Content-Type': 'application/zip; charset=utf-8',
            'Content-Security-Policy': "default-src 'none'",
            'X-Content-Security-Policy': "default-src 'none'",
            'X-WebKit-CSP': "default-src 'none'",
            'X-XSS-Protection': '1; mode=block',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Content-Disposition': `attachment`,
        });
        let res = new Response(downloadRequest, { headers: responseHeaders }); // Create the new response with the stream
        return res;
    }
    try {
        const networkResponse = await fetch(req);
        const cache = await caches.open("easybackup-cache");
        await cache.delete(req);
        await cache.put(req, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(req);
        return cachedResponse;
    }
}