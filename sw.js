// sw.js — QueueMaster Service Worker
// Updated for local simulated web push routing based on updated DB schema.

const CACHE_NAME = 'queuemaster-v4';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Since the DB no longer holds a push 'subscription' column, we simulate
// the push natively from the main thread instead of via push events.
// However, if your system re-integrates a push edge-function later, this
// handles incoming remote pushes gracefully.
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = {
            title: 'QueueMaster',
            body: event.data ? event.data.text() : 'Your queue status changed.',
            type: 'generic'
        };
    }

    const type = data.type || 'generic';

    const isYourTurn = type === 'called';
    const isWarning  = type === 'warning';
    const isCancelled = type === 'canceled' || type === 'cancelled';
    const isAlmost   = type === 'queued';

    const options = {
        body: data.body,
        icon: '/icon.png',
        badge: '/icon.png',
        
        vibrate: isYourTurn ? [300, 100, 300, 100, 300] : 
                 isWarning  ? [500, 200, 500, 200, 500] : 
                 isCancelled ? [100, 50, 100] : 
                 isAlmost   ? [200, 100, 200] : [150],
        
        data: data.data || {},
        
        requireInteraction: isYourTurn || isWarning, 
        
        tag: isYourTurn ? 'qm-turn' : 
             isWarning  ? 'qm-warn' : 
             isCancelled ? 'qm-cancel' : 'qm-queued',
             
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'QueueMaster', options).then(() => {
            return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        }).then(clients => {
            clients.forEach(client => client.postMessage({
                type: 'PLAY_NOTIFICATION_SOUND',
                notificationType: type
            }));
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            const focused = clients.find(c => c.url && c.visibilityState === 'visible');
            if (focused) return focused.focus();
            if (clients.length > 0) return clients[0].focus();
            return self.clients.openWindow('/');
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'PLAY_NOTIFICATION_SOUND') {
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
            clients.forEach(c => c.postMessage({
                type: 'PLAY_NOTIFICATION_SOUND',
                notificationType: event.data.notificationType
            }));
        });
    }
});