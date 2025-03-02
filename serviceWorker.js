// public/serviceWorker.js
const CACHE_NAME = 'lucid-dream-app-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/js/0.chunk.js',
  '/static/js/bundle.js',
  '/audio/affirmation.mp3',
  '/manifest.json'
];

// インストール時に必要なファイルをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  // 新しいサービスワーカーを即座にアクティブにする
  self.skipWaiting();
});

// アクティベーション時に古いキャッシュを削除
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // すぐにクライアントを制御できるようにする
  return self.clients.claim();
});

// ネットワークリクエストのインターセプト
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュが見つかった場合はそれを返す
        if (response) {
          return response;
        }
        // オーディオファイルの場合は特別に処理
        if (event.request.url.includes('/audio/')) {
          return fetch(event.request)
            .then(response => {
              // レスポンスをクローンしてキャッシュに保存
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
              return response;
            });
        }
        // その他のリクエストに対する通常のfetch
        return fetch(event.request);
      })
  );
});

// メッセージイベントの処理
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // タイマー関連のメッセージ処理
  if (event.data && event.data.type === 'START_TIMER') {
    const { timing, duration, volume } = event.data;
    console.log(`サービスワーカー: ${timing}分後に${duration}分間の再生を開始します`);
    
    // クライアントの参照を保持
    const client = event.source;
    
    // タイマーの設定
    if (timing > 0) {
      setTimeout(() => {
        // 時間になったらクライアントに通知
        client.postMessage({
          type: 'TIMER_COMPLETE',
          timing,
          duration,
          volume
        });
      }, timing * 60 * 1000);
    }
  }
});

// プッシュ通知イベントの処理
self.addEventListener('push', event => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/logo192.png',
    badge: '/badge.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 通知クリックイベントの処理
self.addEventListener('notificationclick', event => {
  const notification = event.notification;
  notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url === notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(notification.data.url);
        }
      })
  );
});