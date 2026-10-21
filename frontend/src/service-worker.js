import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST || []);

const MESSAGES_CACHE = 'chaos-messages-v1';

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname === '/ws' || url.pathname.includes('hot-update')) {
        return;
    }

    if (url.pathname === '/api/messages') {
        event.respondWith(
            fetch(event.request)
                .then(async (response) => {
                    if (!response.ok) throw new Error('Network error');
                    const clone = response.clone();
                    const cache = await caches.open(MESSAGES_CACHE);
                    await cache.put(event.request, clone);
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached) return cached;
                    return new Response(JSON.stringify({ status: 'error', message: 'Offline mode active' }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' },
                    });
                })
        );
    }
});

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});