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
            
            return this.swRegistration;
        } catch (error) {
            console.error('Service Worker 등록 실패:', error);
            throw error;
        }
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




