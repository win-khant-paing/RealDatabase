// sw.js — QueueMaster Service Worker
// Pure Web Push API (no Firebase). Place at ROOT of your site.

const CACHE_NAME = 'queuemaster-v3';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// ── Native Web Push: fired when a push arrives in background ──────────────────
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = {
            title: 'QueueMaster',
            body: event.data ? event.data.text() : 'Your queue position has updated.',
            type: 'generic'
        };
    }

    const type = data.type || 'generic';

    // ── 5 Notification Stages ────────────────────────────────────────────────
    // 1. token_confirmed : Just got token
    // 2. almost_turn     : Person in front got called
    // 3. called          : It is your turn
    // 4. warning         : 3 mins passed
    // 5. canceled        : Token voided

    const isYourTurn = type === 'called';
    const isWarning  = type === 'warning';
    const isCanceled = type === 'canceled';
    const isAlmost   = type === 'almost_turn';

    const options = {
        body: data.body,
        icon: '/icon.png',
        badge: '/icon.png',
        
        // Distinct vibration sequences for different urgency levels
        vibrate: isYourTurn ? [300, 100, 300, 100, 300] : 
                 isWarning  ? [500, 200, 500, 200, 500] : 
                 isCanceled ? [100, 50, 100] : 
                 isAlmost   ? [200, 100, 200] : [150],
        
        data: data.data || {},
        
        // Keep highly important notifications on screen until interacted with
        requireInteraction: isYourTurn || isWarning, 
        
        // Tags group notifications so they update each other instead of spamming
        tag: isYourTurn ? 'qm-turn' : 
             isWarning  ? 'qm-warn' : 
             isCanceled ? 'qm-cancel' : 'qm-queued',
             
        renotify: true
    };

    const title = data.title || 'QueueMaster';

    event.waitUntil(
        self.registration.showNotification(title, options).then(() => {
            return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        }).then(clients => {
            clients.forEach(client => client.postMessage({
                type: 'PLAY_NOTIFICATION_SOUND',
                notificationType: type
            }));
        })
    );
});

// ── Notification click: focus or open the app ────────────────────────────────
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

// ── Message relay (e.g. foreground sound requests) ───────────────────────────
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