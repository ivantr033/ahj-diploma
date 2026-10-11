const CACHE_NAME = 'chaos-organizer-cache-v1';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(['./', './index.html']);
        })
    );
});

self.addEventListener('activate', () => {
    console.log('Service Worker active and ready.');
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.port === '8080' || url.pathname.includes('hot-update') || url.pathname === '/ws') {
        return;
    }

    if (url.pathname === '/api/messages') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (!response.ok) throw new Error('Network error');
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached) return cached;
                    return new Response(JSON.stringify({ status: 'error' }), { status: 500 });
                })
        );
    }
});
