// Service Worker - PWA POC
const CACHE_NAME = 'pwa-poc-v7';
const STATIC_CACHE_NAME = 'pwa-poc-static-v7';
const DYNAMIC_CACHE_NAME = 'pwa-poc-dynamic-v7';

// 캐시할 정적 파일들
const STATIC_FILES = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './sw-register.js',
    './manifest.json',
    './offline.html',
    './icons/icon-192x192.svg',
    './icons/icon-512x512.svg'
];

// 네트워크 우선, 캐시 폴백 전략을 사용할 파일들
const NETWORK_FIRST_FILES = [
    '/api/',
    'https://jsonplaceholder.typicode.com/'
];

// 캐시 우선 전략을 사용할 파일들
const CACHE_FIRST_FILES = [
    './styles.css',
    './app.js',
    './sw-register.js'
];

// Service Worker 설치 이벤트
self.addEventListener('install', (event) => {
    console.log('Service Worker 설치 시작');
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('정적 파일들을 캐시에 저장');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('Service Worker 설치 완료');
                // 새로운 Service Worker를 즉시 활성화
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker 설치 실패:', error);
            })
    );
});

// Service Worker 활성화 이벤트
self.addEventListener('activate', (event) => {
    console.log('Service Worker 활성화 시작');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // 이전 버전의 캐시 삭제
                        if (cacheName !== STATIC_CACHE_NAME && 
                            cacheName !== DYNAMIC_CACHE_NAME) {
                            console.log('이전 캐시 삭제:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker 활성화 완료');
                // 페이지 제어권 즉시 가져오기
                return self.clients.claim();
            })
            .catch(error => {
                console.error('Service Worker 활성화 실패:', error);
            })
    );
});

// 네트워크 요청 가로채기
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    console.log('🔍 Service Worker fetch 이벤트:', {
        url: request.url,
        method: request.method,
        origin: url.origin,
        locationOrigin: location.origin,
        isApiRequest: request.url.includes('/api/')
    });
    
    // 같은 도메인의 요청만 처리
    if (url.origin !== location.origin) {
        console.log('🚫 다른 도메인 요청, 처리하지 않음:', request.url);
        return;
    }
    
    // GET 요청만 캐시
    if (request.method !== 'GET') {
        console.log('🚫 GET 요청이 아님, 처리하지 않음:', request.method);
        return;
    }
    
    // 정적 파일은 캐시 우선 전략
    if (CACHE_FIRST_FILES.some(file => request.url.includes(file))) {
        console.log('📁 정적 파일 캐시 우선 전략:', request.url);
        event.respondWith(cacheFirstStrategy(request));
        return;
    }
    
    // API 요청은 네트워크 우선 전략
    if (NETWORK_FIRST_FILES.some(api => request.url.includes(api))) {
        console.log('🌐 API 요청 네트워크 우선 전략:', request.url);
        event.respondWith(networkFirstStrategy(request));
        return;
    }
    
    // 기본적으로 네트워크 우선 전략 사용
    console.log('🌐 기본 네트워크 우선 전략:', request.url);
    event.respondWith(networkFirstStrategy(request));
});

// 캐시 우선 전략
async function cacheFirstStrategy(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('캐시에서 응답:', request.url);
            return cachedResponse;
        }
        
        // 캐시에 없으면 네트워크에서 가져와서 캐시에 저장
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('캐시 우선 전략 실패:', error);
        // 오프라인 폴백 페이지 반환
        return getOfflineFallback();
    }
}

// 네트워크 우선 전략
async function networkFirstStrategy(request) {
    console.log('🚀 networkFirstStrategy 시작:', request.url);
    
    try {
        console.log('🌐 네트워크 요청 시도:', request.url);
        const networkResponse = await fetch(request);
        
        console.log('📡 네트워크 응답 상태:', networkResponse.status, networkResponse.statusText);
        
        if (networkResponse.ok) {
            console.log('✅ 네트워크 요청 성공, 캐시에 저장:', request.url);
            // 성공적인 응답을 캐시에 저장
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
            
            // 메인 스레드에 캐시 업데이트 알림
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'CACHE_UPDATED',
                        payload: { url: request.url, timestamp: new Date().toISOString() }
                    });
                });
            });
            
            return networkResponse;
        }
        
        console.log('❌ 네트워크 응답이 성공적이지 않음:', networkResponse.status);
        throw new Error(`네트워크 응답이 성공적이지 않음: ${networkResponse.status}`);
    } catch (error) {
        console.log('🌐 네트워크 실패, 캐시에서 시도:', request.url, error.message);
        
        // 네트워크 실패 시 캐시에서 찾기
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('💾 캐시에서 응답 반환:', request.url);
            return cachedResponse;
        }
        
        console.log('⚠️ 캐시에도 없음, 오프라인 폴백 반환:', request.url);
        // 캐시에도 없으면 오프라인 폴백
        return getOfflineFallback();
    }
}

// 오프라인 폴백 응답
async function getOfflineFallback() {
    try {
        const offlineResponse = await caches.match('./offline.html');
        if (offlineResponse) {
            return offlineResponse;
        }
        
        // 오프라인 페이지가 없으면 간단한 응답 생성
        return new Response(
            `
            <!DOCTYPE html>
            <html>
            <head>
                <title>오프라인</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .offline-icon { font-size: 64px; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div class="offline-icon">📡</div>
                <h1>오프라인 상태입니다</h1>
                <p>인터넷 연결을 확인해주세요.</p>
                <button onclick="window.location.reload()">새로고침</button>
            </body>
            </html>
            `,
            {
                headers: { 'Content-Type': 'text/html' }
            }
        );
    } catch (error) {
        console.error('오프라인 폴백 생성 실패:', error);
        return new Response('오프라인 상태입니다.', { status: 503 });
    }
}

// 백그라운드 동기화 (선택적)
self.addEventListener('sync', (event) => {
    console.log('백그라운드 동기화 이벤트:', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(backgroundSync());
    }
});

// 백그라운드 동기화 작업
async function backgroundSync() {
    try {
        console.log('백그라운드 동기화 시작');
        
        // IndexedDB에서 오프라인 데이터 가져오기
        // 실제 구현에서는 서버와 동기화
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('백그라운드 동기화 완료');
        
        // 메인 스레드에 동기화 완료 알림
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'OFFLINE_DATA_SYNC',
                    payload: { status: 'completed', timestamp: new Date().toISOString() }
                });
            });
        });
    } catch (error) {
        console.error('백그라운드 동기화 실패:', error);
    }
}

// 푸시 알림 처리 (선택적)
self.addEventListener('push', (event) => {
    console.log('푸시 알림 수신:', event);
    
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || '새로운 알림이 있습니다.',
            icon: './icons/icon-192x192.png',
            badge: './icons/icon-192x192.png',
            tag: 'pwa-poc-notification',
            data: data
        };
        
        event.waitUntil(
            self.registration.showNotification('PWA POC', options)
        );
    }
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
    console.log('알림 클릭됨:', event);
    
    event.notification.close();
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window' })
            .then(clients => {
                if (clients.length > 0) {
                    // 이미 열린 창이 있으면 포커스
                    return clients[0].focus();
                } else {
                    // 열린 창이 없으면 새로 열기
                    return self.clients.openWindow('./');
                }
            })
    );
});

// 메시지 처리
self.addEventListener('message', (event) => {
    console.log('Service Worker 메시지 수신:', event.data);
    
    const { type, payload } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
        case 'GET_CACHE_INFO':
            getCacheInfo().then(info => {
                event.ports[0].postMessage(info);
            });
            break;
        case 'CLEAR_CACHE':
            clearAllCaches().then(() => {
                event.ports[0].postMessage({ success: true });
            });
            break;
        default:
            console.log('알 수 없는 메시지 타입:', type);
    }
});

// 캐시 정보 가져오기
async function getCacheInfo() {
    const cacheNames = await caches.keys();
    const cacheInfo = {};
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        cacheInfo[cacheName] = {
            size: requests.length,
            urls: requests.map(req => req.url)
        };
    }
    
    return cacheInfo;
}

// 모든 캐시 삭제
async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('모든 캐시가 삭제되었습니다.');
}
