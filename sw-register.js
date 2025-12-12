// Service Worker 등록 및 관리
class ServiceWorkerManager {
    constructor() {
        this.swRegistration = null;
        this.init();
    }

    async init() {
        if ('serviceWorker' in navigator) {
            try {
                await this.registerServiceWorker();
                this.setupServiceWorkerEvents();
                this.updateServiceWorkerStatus();
            } catch (error) {
                console.error('Service Worker 등록 실패:', error);
                this.updateServiceWorkerStatus(error);
            }
        } else {
            console.log('Service Worker를 지원하지 않는 브라우저입니다.');
            this.updateServiceWorkerStatus(new Error('unsupported'));
        }
    }

    async registerServiceWorker() {
        try {
            this.swRegistration = await navigator.serviceWorker.register('./sw.js', {
                scope: './'
            });

            console.log('Service Worker 등록 성공:', this.swRegistration);

            // Service Worker 상태 업데이트
            this.updateServiceWorkerStatus();

            // 자동 업데이트 감지 설정
            this.setupAutoUpdate();

            return this.swRegistration;
        } catch (error) {
            console.error('Service Worker 등록 실패:', error);
            throw error;
        }
    }

    setupAutoUpdate() {
        if (!this.swRegistration) return;

        // 새 버전 발견 시
        this.swRegistration.addEventListener('updatefound', () => {
            const newWorker = this.swRegistration.installing;
            console.log('🆕 새로운 Service Worker 버전 발견!');

            newWorker.addEventListener('statechange', () => {
                console.log('Service Worker 상태 변경:', newWorker.state);

                // 새 SW가 설치되고 waiting 상태가 되면
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('✨ 새 버전이 준비되었습니다!');
                    this.showUpdateNotification();
                }
            });
        });

        // 주기적으로 업데이트 확인 (1시간마다)
        setInterval(() => {
            console.log('🔄 Service Worker 업데이트 확인 중...');
            this.swRegistration.update();
        }, 60 * 60 * 1000);

        // 페이지 포커스 시 업데이트 확인
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('👁️ 페이지 포커스 - Service Worker 업데이트 확인');
                this.swRegistration.update();
            }
        });
    }

    showUpdateNotification() {
        // 업데이트 알림 배너 생성
        const existingBanner = document.getElementById('update-banner');
        if (existingBanner) {
            existingBanner.remove();
        }

        const banner = document.createElement('div');
        banner.id = 'update-banner';
        banner.style.cssText = `
            position: fixed;
            top: 70px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 15px;
            animation: slideDown 0.3s ease;
        `;

        banner.innerHTML = `
            <i class="fas fa-sync-alt" style="font-size: 20px;"></i>
            <span style="flex: 1;">
                <strong>새 버전 업데이트</strong><br>
                <small>새로운 기능과 개선사항이 있습니다.</small>
            </span>
            <button id="update-now-btn" style="
                background: white;
                color: #667eea;
                border: none;
                padding: 8px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-weight: bold;
            ">
                지금 업데이트
            </button>
            <button id="update-later-btn" style="
                background: transparent;
                color: white;
                border: 1px solid white;
                padding: 8px 15px;
                border-radius: 5px;
                cursor: pointer;
            ">
                나중에
            </button>
        `;

        document.body.appendChild(banner);

        // 업데이트 버튼 클릭
        document.getElementById('update-now-btn').addEventListener('click', () => {
            this.applyUpdate();
        });

        // 나중에 버튼 클릭
        document.getElementById('update-later-btn').addEventListener('click', () => {
            banner.remove();
        });

        // 5초 후 자동으로 적용
        setTimeout(() => {
            if (document.getElementById('update-banner')) {
                console.log('⏰ 5초 경과 - 자동으로 업데이트 적용');
                this.applyUpdate();
            }
        }, 5000);
    }

    applyUpdate() {
        const banner = document.getElementById('update-banner');
        if (banner) {
            banner.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="font-size: 20px;"></i>
                <span>업데이트 적용 중...</span>
            `;
        }

        // waiting 중인 Service Worker에게 skipWaiting 메시지 전송
        if (this.swRegistration.waiting) {
            this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // 컨트롤러 변경 시 페이지 새로고침
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                console.log('🔄 새 Service Worker 활성화 - 페이지 새로고침');
                window.location.reload();
            }
        });
    }

    setupServiceWorkerEvents() {
        // Service Worker 설치 이벤트
        navigator.serviceWorker.addEventListener('install', (event) => {
            console.log('Service Worker 설치됨');
            this.updateServiceWorkerStatus();
        });

        // Service Worker 활성화 이벤트
        navigator.serviceWorker.addEventListener('activate', (event) => {
            console.log('Service Worker 활성화됨');
            this.updateServiceWorkerStatus();
        });

        // Service Worker 메시지 이벤트
        navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('Service Worker로부터 메시지 수신:', event.data);
            this.handleServiceWorkerMessage(event.data);
        });

        // Service Worker 에러 이벤트
        navigator.serviceWorker.addEventListener('error', (event) => {
            console.error('Service Worker 에러:', event.error);
            this.updateServiceWorkerStatus();
        });

        // Service Worker 상태 변경 이벤트
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('Service Worker 컨트롤러 변경됨');
            this.updateServiceWorkerStatus();
        });
    }

    updateServiceWorkerStatus(err) {
        const swStatusElement = document.getElementById('sw-status');
        const regEl = document.getElementById('sw-registration');
        const activeEl = document.getElementById('sw-active');

        if (err && err.message === 'unsupported') {
            if (swStatusElement) {
                swStatusElement.textContent = 'Service Worker 미지원';
                swStatusElement.className = 'status-badge offline';
            }
            if (regEl) regEl.textContent = '등록 상태: 미지원';
            if (activeEl) activeEl.textContent = '활성 상태: 미지원';
            return;
        }

        if (!this.swRegistration) {
            if (swStatusElement) {
                swStatusElement.textContent = 'Service Worker 비활성';
                swStatusElement.className = 'status-badge offline';
            }
            if (regEl) regEl.textContent = '등록 상태: 미등록';
            if (activeEl) activeEl.textContent = '활성 상태: 비활성';
            return;
        }

        // 등록 상태
        if (regEl) regEl.textContent = '등록 상태: 등록됨';

        // 활성/설치/대기 상태
        if (this.swRegistration.active) {
            if (swStatusElement) {
                swStatusElement.textContent = 'Service Worker 활성';
                swStatusElement.className = 'status-badge online';
            }
            if (activeEl) activeEl.textContent = '활성 상태: 활성';
        } else if (this.swRegistration.installing) {
            if (swStatusElement) {
                swStatusElement.textContent = 'Service Worker 설치 중';
                swStatusElement.className = 'status-badge installing';
            }
            if (activeEl) activeEl.textContent = '활성 상태: 설치 중';
            // 설치 진행 상태 변화 모니터링
            const installing = this.swRegistration.installing;
            if (installing) installing.addEventListener('statechange', () => this.updateServiceWorkerStatus());
        } else if (this.swRegistration.waiting) {
            if (swStatusElement) {
                swStatusElement.textContent = 'Service Worker 대기 중';
                swStatusElement.className = 'status-badge offline';
            }
            if (activeEl) activeEl.textContent = '활성 상태: 대기 중';
            // waiting 상태에서 컨트롤러가 없을 수 있으므로 controllerchange로 전환 감시
            navigator.serviceWorker.addEventListener('controllerchange', () => this.updateServiceWorkerStatus());
        } else {
            if (swStatusElement) {
                swStatusElement.textContent = 'Service Worker 비활성';
                swStatusElement.className = 'status-badge offline';
            }
            if (activeEl) activeEl.textContent = '활성 상태: 비활성';
        }
    }

    handleServiceWorkerMessage(data) {
        // Service Worker로부터 받은 메시지 처리
        switch (data.type) {
            case 'CACHE_UPDATED':
                console.log('캐시가 업데이트되었습니다:', data.payload);
                break;
            case 'OFFLINE_DATA_SYNC':
                console.log('오프라인 데이터 동기화 요청:', data.payload);
                break;
            case 'NETWORK_STATUS':
                console.log('네트워크 상태 변경:', data.payload);
                break;
            default:
                console.log('알 수 없는 메시지 타입:', data.type);
        }
    }

    async updateServiceWorker() {
        if (this.swRegistration) {
            try {
                await this.swRegistration.update();
                console.log('Service Worker 업데이트 요청됨');
            } catch (error) {
                console.error('Service Worker 업데이트 실패:', error);
            }
        }
    }

    async unregisterServiceWorker() {
        if (this.swRegistration) {
            try {
                await this.swRegistration.unregister();
                console.log('Service Worker 등록 해제됨');
                this.swRegistration = null;
                this.updateServiceWorkerStatus();
            } catch (error) {
                console.error('Service Worker 등록 해제 실패:', error);
            }
        }
    }

    // Service Worker와 통신
    async sendMessageToServiceWorker(message) {
        if (navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage(message);
                console.log('Service Worker에 메시지 전송:', message);
            } catch (error) {
                console.error('Service Worker 메시지 전송 실패:', error);
            }
        } else {
            console.log('Service Worker 컨트롤러가 없습니다.');
        }
    }

    // Service Worker 일시적 비활성화 (디버깅용)
    async disableServiceWorker() {
        try {
            if (this.swRegistration) {
                await this.swRegistration.unregister();
                console.log('Service Worker가 일시적으로 비활성화되었습니다.');
                this.swRegistration = null;
                this.updateServiceWorkerStatus();
                
                // 페이지 새로고침으로 Service Worker 완전 제거
                if (confirm('Service Worker를 비활성화했습니다. 페이지를 새로고침하여 완전히 제거하시겠습니까?')) {
                    window.location.reload();
                }
            }
        } catch (error) {
            console.error('Service Worker 비활성화 실패:', error);
        }
    }

    // Service Worker 다시 활성화
    async reenableServiceWorker() {
        try {
            await this.registerServiceWorker();
            console.log('Service Worker가 다시 활성화되었습니다.');
        } catch (error) {
            console.error('Service Worker 재활성화 실패:', error);
        }
    }
}

// Service Worker 매니저 초기화
let swManager;
document.addEventListener('DOMContentLoaded', () => {
    swManager = new ServiceWorkerManager();
});

// 전역 함수로 노출 (HTML에서 호출하기 위해)
window.swManager = swManager;




