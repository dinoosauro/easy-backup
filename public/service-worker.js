const cacheName = 'easybackup-cache';
const filestoCache = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg',
    "./icon.png",
    "./assets/index.css",
    "./assets/index.js",
    "./assets/index2.js",
    'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;700&display=swap',
];
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(cacheName)
            .then(cache => cache.addAll(filestoCache))
    );
});
self.addEventListener('activate', e => self.clients.claim());
/**
 * The BroadcastChannel that'll be used to send messages to the main script
 */
const mainComms = new BroadcastChannel("SWMessage");
/**
 * The map that contains the ID of the file to download as a key, and the stream/writer/file name as a value (in an object)
 */
const streamContainer = new Map();
self.addEventListener("message", async (msg) => {
    switch (msg.data.action) {
        case "CreateStream": { // Create a new file
            const stream = new TransformStream();
            streamContainer.set(msg.data.id, {
                stream,
                writer: stream.writable.getWriter(),
                fileName: msg.data.fileName
            });
            mainComms.postMessage({ action: "CreateStream", id: msg.data.id });
            break;
        }
        case "WriteFile": { // Write a chunk to the provided stream
            const item = streamContainer.get(msg.data.id);
            if (item) {
                await item.writer.write(msg.data.chunk);
                mainComms.postMessage({ action: "WriteFile", id: msg.data.id, secondId: msg.data.secondId });
            }
            break;
        }
        case "CloseStream": { // Close the stream (and finalize the download)
            streamContainer.get(msg.data.id)?.writer.close();
            break;
        }
    }
})
self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(
        clients
            .openWindow(e.notification.data.url)
            .then((windowClient) => (windowClient ? windowClient.focus() : null))
    );

});

self.addEventListener('fetch', async (event) => {
    const req = event.request;
    if (req.url.indexOf("update") !== -1 || req.url.indexOf("gstatic.com") !== -1 && navigator.userAgent.indexOf("Firefox") !== -1) event.respondWith(await fetch(req)); else event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
    const getStream = streamContainer.get(req.url.substring(req.url.lastIndexOf("/downloader?id=") + "/downloader?id=".length)); // Look if the request is tied with a local zip file. In this case, the readable stream needs to be returned.
    if (getStream) { // The request is to download an available file. Let's start it
        return new Response(getStream.stream.readable, {
            headers: {
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(getStream.fileName)}`,
                "Content-Type": "application/zip"
            }
        })
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