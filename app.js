// 건강검진 시스템 메인 애플리케이션
class HealthCheckupApp {
    constructor() {
        // 버전 정보 (메이저.마이너)
        this.VERSION = '2.5';
        // 소스 적용일시
        this.VERSION_DATE = '2025-10-27 17:10:00';

        this.db = null;
        this.dbName = 'HealthCheckupDB';
        this.dbVersion = 5; // 버전 업그레이드: checkupTypes에 sync_status 인덱스 추가
        this.isOnline = navigator.onLine;
        this.apiBaseUrl = '/api';
        this.currentCheckup = null;
        this.currentSection = 'dashboard';
        this.syncInterval = null;
        this.autoSyncEnabled = true; // 기본값: 자동 동기화 활성화
        this.indexedDBCacheEnabled = true; // 기본값: IndexedDB 캐싱 활성화
        this.syncIntervalSeconds = 300; // 기본값: 5분 (300초)
        this.currentPatientsList = []; // 현재 로드된 환자 목록 (검색용)
        this.currentCheckupsList = []; // 현재 로드된 검진 목록 (검색용)
        this.currentCalendarDate = new Date(); // 캘린더 현재 날짜
        this.selectedDate = null; // 선택된 날짜

        this.stores = {
            patients: 'patients',
            checkups: 'checkups',
            checkupTypes: 'checkupTypes',
            checkupItems: 'checkupItems',
            offlineRequests: 'offlineRequests'
        };

        // 임시키 관리
        this.tempKeyPrefix = {
            patients: 'temp_patient_',
            checkups: 'temp_checkup_',
            checkupItems: 'temp_item_'
        };

        this.init();
    }

    async init() {
        // localStorage에서 모든 설정 로드
        this.loadSettings();

        try {
            await this.initIndexedDB();
        } catch (error) {
            console.error('❌ IndexedDB 초기화 실패:', {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            });

            // 재시도 로직
            console.log('🔄 IndexedDB 재시도 중...');
            try {
                await this.retryInitIndexedDB();
            } catch (retryError) {
                console.error('❌ IndexedDB 재시도 실패:', retryError);
                alert('데이터베이스 초기화에 실패했습니다. 브라우저를 새로고침해주세요.');
                throw retryError;
            }
        }

        this.setupEventListeners();
        this.setupNetworkListeners();
        this.updateVersionDisplay();

        // 실제 서버 연결 상태 확인
        if (navigator.onLine) {
            this.isOnline = await this.checkServerConnection();
        } else {
            this.isOnline = false;
        }
        this.updateConnectionStatus();

        // 앱 시작 시 동기화 (순서 중요)
        if (this.isOnline) {
            // 1. 오프라인 데이터 먼저 업로드
            await this.syncOfflineRequests();
            // 2. 서버 데이터 다운로드
            await this.performFullDataSync();
        }

        this.loadDashboard();

        // 전역 변수로 노출
        window.app = this;

        // 자동 동기화 시작
        if (this.autoSyncEnabled) {
            this.startPeriodicSync();
        }

        console.log(`✅ 건강검진 시스템이 초기화되었습니다. (버전 v${this.VERSION})`);
    }

    // 버전 정보 업데이트
    updateVersionDisplay() {
        const versionElement = document.getElementById('version-date');
        if (versionElement) {
            // VERSION_DATE를 Date 객체로 변환
            const versionDate = new Date(this.VERSION_DATE);
            const formattedDate = versionDate.toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            versionElement.textContent = `v${this.VERSION} / ${formattedDate}`;
        }
    }

    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            console.log(`🔍 IndexedDB 열기 시도: ${this.dbName} v${this.dbVersion}`);

            if (!window.indexedDB) {
                const error = new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.');
                console.error('❌', error.message);
                reject(error);
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                const error = request.error || event.target.error;
                console.error('❌ IndexedDB 열기 실패:', {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    isOnline: navigator.onLine,
                    dbName: this.dbName,
                    dbVersion: this.dbVersion
                });

                // VersionError 처리: 요청한 버전이 기존 버전보다 낮을 때
                if (error.name === 'VersionError') {
                    console.warn('⚠️ IndexedDB 버전 충돌 감지. 데이터베이스를 재설정합니다.');
                    this.handleVersionConflict();
                }

                reject(error);
            };

            request.onblocked = (event) => {
                console.warn('⚠️ IndexedDB가 차단됨. 다른 탭을 닫아주세요.');
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB 연결 성공');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                console.log(`🔄 IndexedDB 업그레이드: v${oldVersion} → v${this.dbVersion}`);

                // 환자 스토어
                if (!db.objectStoreNames.contains(this.stores.patients)) {
                    const patientsStore = db.createObjectStore(this.stores.patients, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    patientsStore.createIndex('patient_id', 'patient_id', { unique: false });
                    patientsStore.createIndex('name', 'name', { unique: false });
                    patientsStore.createIndex('sync_status', 'sync_status', { unique: false });
                    patientsStore.createIndex('temp_id', 'temp_id', { unique: false });
                } else if (oldVersion < 4) {
                    // 버전 4 업그레이드: 기존 인덱스 재생성
                    const transaction = event.target.transaction;
                    const patientsStore = transaction.objectStore(this.stores.patients);

                    // 기존 인덱스가 있으면 삭제 후 재생성
                    if (patientsStore.indexNames.contains('patient_id')) {
                        patientsStore.deleteIndex('patient_id');
                    }
                    patientsStore.createIndex('patient_id', 'patient_id', { unique: false });
                    console.log('✅ patient_id 인덱스 재생성 완료');
                }

                // 검진 스토어
                if (!db.objectStoreNames.contains(this.stores.checkups)) {
                    const checkupsStore = db.createObjectStore(this.stores.checkups, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    checkupsStore.createIndex('patient_id', 'patient_id', { unique: false });
                    checkupsStore.createIndex('checkup_date', 'checkup_date', { unique: false });
                    checkupsStore.createIndex('sync_status', 'sync_status', { unique: false });
                    checkupsStore.createIndex('temp_id', 'temp_id', { unique: false });
                }

                // 검진 유형 스토어
                if (!db.objectStoreNames.contains(this.stores.checkupTypes)) {
                    const typesStore = db.createObjectStore(this.stores.checkupTypes, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    typesStore.createIndex('sync_status', 'sync_status', { unique: false });
                } else if (oldVersion < 5) {
                    // 버전 5 업그레이드: sync_status 인덱스 추가
                    const transaction = event.target.transaction;
                    const typesStore = transaction.objectStore(this.stores.checkupTypes);

                    if (!typesStore.indexNames.contains('sync_status')) {
                        typesStore.createIndex('sync_status', 'sync_status', { unique: false });
                        console.log('✅ checkupTypes에 sync_status 인덱스 추가 완료');
                    }
                }

                // 검진 항목 스토어
                if (!db.objectStoreNames.contains(this.stores.checkupItems)) {
                    const itemsStore = db.createObjectStore(this.stores.checkupItems, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    itemsStore.createIndex('checkup_id', 'checkup_id', { unique: false });
                    itemsStore.createIndex('sync_status', 'sync_status', { unique: false });
                    itemsStore.createIndex('temp_id', 'temp_id', { unique: false });
                } else if (oldVersion < 5) {
                    // 버전 5 업그레이드: sync_status 인덱스 추가
                    const transaction = event.target.transaction;
                    const itemsStore = transaction.objectStore(this.stores.checkupItems);

                    if (!itemsStore.indexNames.contains('sync_status')) {
                        itemsStore.createIndex('sync_status', 'sync_status', { unique: false });
                        console.log('✅ checkupItems에 sync_status 인덱스 추가 완료');
                    }
                }

                // 오프라인 요청 스토어
                if (!db.objectStoreNames.contains(this.stores.offlineRequests)) {
                    const offlineStore = db.createObjectStore(this.stores.offlineRequests, {
                        keyPath: 'id'
                    });
                    offlineStore.createIndex('status', 'status', { unique: false });
                    offlineStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                console.log('✅ IndexedDB 스토어들이 생성되었습니다.');
            };
        });
    }

    // IndexedDB 재시도 로직
    async retryInitIndexedDB(maxRetries = 3, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                console.log(`🔄 IndexedDB 재시도 ${i + 1}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                await this.initIndexedDB();
                console.log('✅ IndexedDB 재시도 성공!');
                return;
            } catch (error) {
                console.error(`❌ 재시도 ${i + 1} 실패:`, error.message);
                if (i === maxRetries - 1) {
                    throw new Error(`IndexedDB 초기화 실패 (${maxRetries}회 재시도): ${error.message}`);
                }
            }
        }
    }

    // IndexedDB 버전 충돌 처리
    handleVersionConflict() {
        const message =
            '⚠️ 데이터베이스 버전 충돌이 감지되었습니다.\n\n' +
            '해결 방법:\n' +
            '1. 브라우저 새로고침 (Ctrl+Shift+R)\n' +
            '2. 또는 아래 "확인"을 클릭하여 자동 새로고침\n\n' +
            '※ 진행 중인 작업이 있다면 먼저 저장해주세요.';

        if (confirm(message)) {
            // Service Worker 캐시 삭제 후 새로고침
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
            }

            // 하드 리로드
            setTimeout(() => {
                window.location.reload(true);
            }, 500);
        }
    }

    setupEventListeners() {
        // 네비게이션 이벤트
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.showSection(section);
            });
        });

        // 환자 등록 버튼
        const addPatientBtn = document.getElementById('add-patient-btn');
        if (addPatientBtn) {
            addPatientBtn.addEventListener('click', () => this.showPatientModal());
        }

        // 검진 예약 버튼
        const addCheckupBtn = document.getElementById('add-checkup-btn');
        if (addCheckupBtn) {
            addCheckupBtn.addEventListener('click', () => this.showCheckupModal());
        }

        // 환자 폼 제출
        const patientForm = document.getElementById('patient-form');
        if (patientForm) {
            patientForm.addEventListener('submit', (e) => this.savePatient(e));
        }

        // 검진 폼 제출
        const checkupForm = document.getElementById('checkup-form');
        if (checkupForm) {
            checkupForm.addEventListener('submit', (e) => this.saveCheckup(e));
        }

        // 모달 닫기
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });

        // 모달 배경 클릭 시 닫기
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModals();
                }
            });
        });

        // 탭 이벤트
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.showTab(tab);
            });
        });

        // 환자 검색 이벤트
        const patientSearch = document.getElementById('patient-search');
        if (patientSearch) {
            patientSearch.addEventListener('input', (e) => {
                this.searchPatients(e.target.value);
            });
        }

        // 검진 검색 이벤트
        const checkupSearch = document.getElementById('checkup-search');
        if (checkupSearch) {
            checkupSearch.addEventListener('input', (e) => {
                this.searchAndFilterCheckups();
            });
        }

        // 검진 상태 필터 이벤트
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.searchAndFilterCheckups();
            });
        }

        // 검진 날짜 필터 이벤트
        const dateFilter = document.getElementById('date-filter');
        if (dateFilter) {
            dateFilter.addEventListener('change', () => {
                this.searchAndFilterCheckups();
            });
        }

        // 모달 닫기 버튼들 (ID 기반)
        const modalCloseBtns = ['modal-close-btn', 'modal-cancel-btn'];
        modalCloseBtns.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => this.closeModals());
            }
        });

        // 검진 상세 모달 - 저장 버튼 제거 (각 탭별 저장 버튼 사용)

        // 설정 버튼
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.showSettingsModal());
        }

        // 서버 → 로컬 동기화 버튼
        const syncFromServerBtn = document.getElementById('sync-from-server-btn');
        if (syncFromServerBtn) {
            syncFromServerBtn.addEventListener('click', () => this.syncFromServerManual());
        }

        // 로컬 → 서버 동기화 버튼
        const syncToServerBtn = document.getElementById('sync-to-server-btn');
        if (syncToServerBtn) {
            syncToServerBtn.addEventListener('click', () => this.syncToServerManual());
        }

        // 양방향 동기화 버튼
        const forceSyncBothBtn = document.getElementById('force-sync-both-btn');
        if (forceSyncBothBtn) {
            forceSyncBothBtn.addEventListener('click', () => this.forceSyncBoth());
        }

        // 로컬 데이터 삭제 버튼
        const clearLocalDataBtn = document.getElementById('clear-local-data-btn');
        if (clearLocalDataBtn) {
            clearLocalDataBtn.addEventListener('click', () => this.clearLocalData());
        }

        // 엑셀 다운로드 버튼
        const downloadExcelBtn = document.getElementById('download-excel-btn');
        if (downloadExcelBtn) {
            downloadExcelBtn.addEventListener('click', () => this.downloadAllDataToExcel());
        }

        // 엑셀 업로드 버튼
        const uploadExcelBtn = document.getElementById('upload-excel-btn');
        const uploadExcelInput = document.getElementById('upload-excel-input');
        if (uploadExcelBtn && uploadExcelInput) {
            uploadExcelBtn.addEventListener('click', () => uploadExcelInput.click());
            uploadExcelInput.addEventListener('change', (e) => this.uploadDataFromExcel(e));
        }

        // 자동 동기화 토글
        const autoSyncToggle = document.getElementById('auto-sync-toggle');
        if (autoSyncToggle) {
            autoSyncToggle.addEventListener('change', (e) => this.toggleAutoSync(e.target.checked));
        }

        // IndexedDB 캐싱 토글
        const indexedDBCacheToggle = document.getElementById('indexeddb-cache-toggle');
        if (indexedDBCacheToggle) {
            indexedDBCacheToggle.addEventListener('change', (e) => this.toggleIndexedDBCache(e.target.checked));
        }

        // 동기화 주기 입력
        const syncIntervalInput = document.getElementById('sync-interval-input');
        if (syncIntervalInput) {
            syncIntervalInput.addEventListener('change', (e) => {
                const seconds = parseInt(e.target.value, 10);
                this.updateSyncInterval(seconds);
            });
        }

        // 캘린더 이전/다음 월 버튼
        const prevMonthBtn = document.getElementById('prev-month-btn');
        if (prevMonthBtn) {
            prevMonthBtn.addEventListener('click', () => this.navigateMonth(-1));
        }

        const nextMonthBtn = document.getElementById('next-month-btn');
        if (nextMonthBtn) {
            nextMonthBtn.addEventListener('click', () => this.navigateMonth(1));
        }
    }

    setupNetworkListeners() {
        window.addEventListener('online', async () => {
            // 실제로 서버에 연결할 수 있는지 확인
            const isReallyOnline = await this.checkServerConnection();
            this.isOnline = isReallyOnline;
            this.updateConnectionStatus();

            if (isReallyOnline) {
                this.showNotification('네트워크에 연결되었습니다.', 'success');

                // 자동 동기화 설정이 활성화된 경우에만 동기화
                if (this.autoSyncEnabled) {
                    // 온라인 상태가 되면 동기화 (순서 중요: 오프라인 데이터 업로드 → 서버 데이터 다운로드)
                    setTimeout(async () => {
                        this.showLoading(true, '양방향 동기화 중...');
                        console.log('🔄 온라인 복귀 - 자동 동기화 시작...');

                        try {
                            // 1. 오프라인 데이터를 먼저 서버에 업로드
                            await this.syncOfflineRequests();

                            // 2. 서버 데이터를 다운로드 (이제 방금 업로드한 데이터 포함)
                            await this.performFullDataSync();

                            console.log('✅ 온라인 복귀 - 자동 동기화 완료');
                            this.showNotification('모든 데이터가 동기화되었습니다.', 'success');
                        } catch (error) {
                            console.error('❌ 자동 동기화 실패:', error);
                            this.showNotification('동기화 중 오류가 발생했습니다.', 'error');
                        } finally {
                            this.showLoading(false);
                        }
                    }, 1000);
                } else {
                    console.log('ℹ️ 자동 동기화가 비활성화되어 있습니다. 수동으로 동기화해주세요.');
                    this.showNotification('온라인 상태입니다. 수동 동기화를 원하시면 동기화 버튼을 클릭하세요.', 'info');
                }
            } else {
                this.showNotification('네트워크에는 연결되었지만 서버에 접근할 수 없습니다.', 'warning');
            }
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateConnectionStatus();
            this.showNotification('오프라인 모드입니다.', 'warning');
        });

        // 주기적으로 서버 연결 상태 확인 (30초마다)
        setInterval(async () => {
            if (navigator.onLine) {
                const isReallyOnline = await this.checkServerConnection();
                if (this.isOnline !== isReallyOnline) {
                    this.isOnline = isReallyOnline;
                    this.updateConnectionStatus();
                }
            }
        }, 30000);
    }

    updateConnectionStatus() {
        const statusBadge = document.getElementById('connection-status');
        if (statusBadge) {
            if (this.isOnline) {
                statusBadge.innerHTML = '<i class=\"fas fa-wifi\"></i> 온라인';
                statusBadge.className = 'status-badge online';
            } else {
                statusBadge.innerHTML = '<i class=\"fas fa-wifi-slash\"></i> 오프라인';
                statusBadge.className = 'status-badge offline';
            }
        }
    }

    showSection(section) {
        // 네비게이션 활성화
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section=\"${section}\"]`).classList.add('active');

        // 섹션 표시
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById(section).classList.add('active');

        this.currentSection = section;

        // 섹션별 데이터 로드
        switch (section) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'patients':
                this.loadPatients();
                break;
            case 'checkups':
                this.loadCheckups();
                break;
            case 'schedule':
                this.loadSchedule();
                break;
            case 'reports':
                this.loadReports();
                break;
        }
    }

    async loadDashboard() {
        try {
            // 온라인 모드: 서버에서 데이터 가져오기
            if (this.isOnline) {
                try {
                    const stats = await this.fetchAPI('/dashboard/stats');
                    if (stats.success) {
                        this.updateDashboardStats(stats.stats);
                    }

                    const recentCheckups = await this.fetchAPI('/checkups?limit=5');
                    if (recentCheckups.success) {
                        this.displayRecentCheckups(recentCheckups.data);
                    }
                    return;
                } catch (error) {
                    console.warn('온라인 대시보드 로드 실패, 오프라인 데이터 사용:', error);
                }
            }

            // 오프라인 모드: IndexedDB에서 데이터 가져오기
            console.log('📊 오프라인 모드: IndexedDB에서 대시보드 데이터 로드');

            const patients = await this.getPatientsFromIndexedDB();
            const checkups = await this.getCheckupsFromIndexedDB();

            // 통계 계산
            const today = new Date().toISOString().split('T')[0];
            const todayCheckups = checkups.filter(c => c.checkup_date?.startsWith(today));
            const inProgressCheckups = checkups.filter(c => c.status === 'in_progress');
            const completedCheckups = checkups.filter(c => c.status === 'completed');

            this.updateDashboardStats({
                total_patients: patients.length,
                today_checkups: todayCheckups.length,
                in_progress_checkups: inProgressCheckups.length,
                completed_checkups: completedCheckups.length
            });

            // 최근 검진 5개 표시
            const recentCheckups = checkups
                .sort((a, b) => new Date(b.checkup_date) - new Date(a.checkup_date))
                .slice(0, 5);

            this.displayRecentCheckups(recentCheckups);

        } catch (error) {
            console.error('대시보드 로드 실패:', error);
            this.showNotification('대시보드 로드에 실패했습니다.', 'error');
        }
    }

    updateDashboardStats(stats) {
        document.getElementById('total-patients').textContent = stats.total_patients || 0;
        document.getElementById('today-checkups').textContent = stats.today_checkups || 0;
        document.getElementById('in-progress-checkups').textContent = stats.in_progress_checkups || 0;
        document.getElementById('completed-checkups').textContent = stats.completed_checkups || 0;
    }

    displayRecentCheckups(checkups) {
        const container = document.getElementById('recent-checkups');
        if (!container) return;

        if (checkups.length === 0) {
            container.innerHTML = '<p class=\"text-muted\">최근 검진 기록이 없습니다.</p>';
            return;
        }

        container.innerHTML = checkups.map(checkup => `
            <div class=\"checkup-row\" onclick=\"app.showCheckupDetail('${checkup.id}')\">
                <div class=\"checkup-info\">
                    <div class=\"checkup-title\">${checkup.patient_name} - ${checkup.type_name}</div>
                    <div class=\"checkup-subtitle\">
                        ${this.formatCheckupDateTime(checkup.checkup_date, checkup.checkup_time)} | ${checkup.doctor_name || '미배정'}
                    </div>
                </div>
                <div class=\"checkup-status status-${checkup.status}\">
                    ${this.getStatusText(checkup.status)}
                </div>
            </div>
        `).join('');
    }

    async loadPatients() {
        try {
            // 온라인 상태에서 먼저 API 시도
            if (this.isOnline) {
                try {
                    const response = await this.fetchAPI('/patients');
                    if (response.success) {
                        // 온라인 데이터를 IndexedDB에 캐시
                        await this.cachePatientsList(response.data);
                        this.currentPatientsList = response.data;
                        this.displayPatients(response.data);
                        return;
                    }
                } catch (apiError) {
                    console.warn('환자 목록 API 호출 실패, 오프라인 데이터로 fallback:', apiError);
                }
            }

            // 오프라인 상태이거나 API 실패 시 IndexedDB에서 조회
            const offlineData = await this.getPatientsFromIndexedDB();
            if (offlineData && offlineData.length > 0) {
                this.currentPatientsList = offlineData;
                this.displayPatients(offlineData);
                if (!this.isOnline) {
                    this.showNotification('오프라인 모드: 캐시된 환자 목록을 표시합니다.', 'info');
                }
            } else {
                this.currentPatientsList = [];
                this.displayPatients([]);
                if (!this.isOnline) {
                    this.showNotification('오프라인 상태이며 캐시된 환자 데이터가 없습니다.', 'warning');
                }
            }
        } catch (error) {
            console.error('환자 목록 로드 실패:', error);
            this.showNotification('환자 목록 로드에 실패했습니다.', 'error');
        }
    }

    displayPatients(patients) {
        const container = document.getElementById('patients-list');
        if (!container) return;

        // 삭제 예정인 환자는 표시하지 않음
        const visiblePatients = patients.filter(p => p.action !== 'delete');

        if (visiblePatients.length === 0) {
            container.innerHTML = '<p class=\"text-center text-muted\">등록된 환자가 없습니다.</p>';
            return;
        }

        container.innerHTML = visiblePatients.map(patient => `
            <div class=\"patient-card\" onclick=\"app.showPatientDetail(${patient.id})\">
                <div class=\"patient-info\">
                    <div class=\"patient-avatar\">
                        ${patient.name.charAt(0)}
                    </div>
                    <div class=\"patient-details\">
                        <h4>${patient.name}</h4>
                        <div class=\"patient-id\">${patient.patient_id}</div>
                        <div class=\"patient-meta\">
                            <span><i class=\"fas fa-birthday-cake\"></i> ${this.formatBirthDate(patient.birth_date)}</span>
                            <span><i class=\"fas fa-${patient.gender === 'M' ? 'mars' : 'venus'}\"></i> ${patient.gender === 'M' ? '남성' : '여성'}</span>
                            <span><i class=\"fas fa-phone\"></i> ${patient.phone || '-'}</span>
                        </div>
                    </div>
                    <button class=\"btn-delete\" onclick=\"event.stopPropagation(); app.deletePatient(${patient.id}, '${patient.name}')\" title=\"삭제\">
                        <i class=\"fas fa-trash\"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    async loadCheckups() {
        try {
            // 온라인 상태에서 먼저 API 시도
            if (this.isOnline) {
                try {
                    const response = await this.fetchAPI('/checkups');
                    if (response.success) {
                        // 온라인 데이터를 IndexedDB에 캐시
                        await this.cacheCheckupsList(response.data);
                        this.currentCheckupsList = response.data;
                        this.displayCheckups(response.data);
                        return;
                    }
                } catch (apiError) {
                    console.warn('검진 목록 API 호출 실패, 오프라인 데이터로 fallback:', apiError);
                }
            }

            // 오프라인 상태이거나 API 실패 시 IndexedDB에서 조회
            const offlineData = await this.getCheckupsFromIndexedDB();
            if (offlineData && offlineData.length > 0) {
                this.currentCheckupsList = offlineData;
                this.displayCheckups(offlineData);
                if (!this.isOnline) {
                    this.showNotification('오프라인 모드: 캐시된 검진 목록을 표시합니다.', 'info');
                }
            } else {
                this.currentCheckupsList = [];
                this.displayCheckups([]);
                if (!this.isOnline) {
                    this.showNotification('오프라인 상태이며 캐시된 검진 데이터가 없습니다.', 'warning');
                }
            }
        } catch (error) {
            console.error('검진 목록 로드 실패:', error);
            this.showNotification('검진 목록 로드에 실패했습니다.', 'error');
        }
    }

    displayCheckups(checkups) {
        const container = document.getElementById('checkups-list');
        if (!container) return;

        // 삭제 예정인 검진은 표시하지 않음
        const visibleCheckups = checkups.filter(c => c.action !== 'delete');

        if (visibleCheckups.length === 0) {
            container.innerHTML = '<p class=\"text-center text-muted\">등록된 검진이 없습니다.</p>';
            return;
        }

        container.innerHTML = `
            <table class=\"checkup-table\">
                <thead>
                    <tr>
                        <th>환자명</th>
                        <th>검진유형</th>
                        <th>검진일시</th>
                        <th>담당의사</th>
                        <th>상태</th>
                        <th>작업</th>
                    </tr>
                </thead>
                <tbody>
                    ${visibleCheckups.map(checkup => `
                        <tr onclick=\"app.showCheckupDetail('${checkup.id}')\">
                            <td>${checkup.patient_name}</td>
                            <td>${checkup.type_name}</td>
                            <td>${this.formatCheckupDateTime(checkup.checkup_date, checkup.checkup_time)}</td>
                            <td>${checkup.doctor_name || '-'}</td>
                            <td>
                                <span class=\"checkup-status status-${checkup.status}\">
                                    ${this.getStatusText(checkup.status)}
                                </span>
                            </td>
                            <td>
                                <button class=\"btn btn-primary btn-sm\" onclick=\"event.stopPropagation(); app.showCheckupDetail('${checkup.id}')\">
                                    상세보기
                                </button>
                                <button class=\"btn btn-danger btn-sm\" onclick=\"event.stopPropagation(); app.deleteCheckup('${checkup.id}', '${checkup.patient_name}')\" title=\"삭제\">
                                    <i class=\"fas fa-trash\"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async showCheckupDetail(checkupId) {
        try {
            this.showLoading(true);

            // 임시키인지 확인 (temp_로 시작하는 경우)
            const isTempId = String(checkupId).startsWith('temp_');

            // 온라인 상태에서 먼저 API 시도 (임시키가 아닌 경우만)
            if (this.isOnline && !isTempId) {
                try {
                    const response = await this.fetchAPI(`/checkups/${checkupId}`);
                    if (response.success) {
                        this.currentCheckup = response;

                        // 온라인 데이터를 IndexedDB에 캐시
                        await this.cacheCheckupDetail(response.checkup, response.items);

                        this.displayCheckupDetail(response.checkup, response.items);
                        this.showModal('checkup-detail-modal');
                        return;
                    }
                } catch (apiError) {
                    console.warn('API 호출 실패, 오프라인 데이터로 fallback:', apiError);
                }
            }

            // 오프라인 상태이거나 API 실패 시 IndexedDB에서 조회
            const offlineData = await this.getCheckupDetailFromIndexedDB(checkupId);
            if (offlineData) {
                this.currentCheckup = {
                    success: true,
                    checkup: offlineData.checkup,
                    items: offlineData.items
                };

                this.displayCheckupDetail(offlineData.checkup, offlineData.items);
                this.showModal('checkup-detail-modal');

                if (!this.isOnline) {
                    this.showNotification('오프라인 모드: 캐시된 데이터를 표시합니다.', 'info');
                }
            } else {
                throw new Error('검진 상세 정보를 찾을 수 없습니다.');
            }

        } catch (error) {
            console.error('검진 상세 조회 실패:', error);
            this.showNotification('검진 상세 정보를 불러올 수 없습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayCheckupDetail(checkup, items) {
        // 기본 정보 탭
        const basicContent = document.getElementById('basic-info-content');
        if (basicContent) {
            basicContent.innerHTML = `
                <div class=\"info-grid\">
                    <div class=\"info-section\">
                        <h4>환자 정보</h4>
                        <p><strong>이름:</strong> ${checkup.patient_name}</p>
                        <p><strong>환자번호:</strong> ${checkup.patient_id}</p>
                        <p><strong>생년월일:</strong> ${this.formatBirthDate(checkup.birth_date)}</p>
                        <p><strong>성별:</strong> ${checkup.gender === 'M' ? '남성' : '여성'}</p>
                        <p><strong>연락처:</strong> ${checkup.phone || '-'}</p>
                    </div>
                    <div class=\"info-section\">
                        <h4>검진 정보</h4>
                        <p><strong>검진번호:</strong> ${checkup.checkup_no}</p>
                        <p><strong>검진유형:</strong> ${checkup.type_name}</p>
                        <p><strong>검진일시:</strong> ${this.formatCheckupDateTime(checkup.checkup_date, checkup.checkup_time)}</p>
                        <p><strong>담당의사:</strong> ${checkup.doctor_name || '-'}</p>
                        <p><strong>상태:</strong> ${this.getStatusText(checkup.status)}</p>
                    </div>
                </div>
                ${checkup.notes ? `<div class=\"mt-4\"><h4>특이사항</h4><p>${checkup.notes}</p></div>` : ''}
            `;
        }

        // 검진 항목 탭
        const itemsContent = document.getElementById('items-content');
        if (itemsContent) {
            const isEditable = checkup.status !== 'completed';

            itemsContent.innerHTML = `
                <div class="items-header">
                    <div class="items-title">
                        <h4>검진 항목</h4>
                        <p class="text-muted">검진 항목을 입력하고 관리하세요</p>
                    </div>
                    <div class="items-actions">
                        <button class="btn btn-primary btn-sm" onclick="app.addCheckupItem()">
                            <i class="fas fa-plus"></i> 항목 추가
                        </button>
                        ${isEditable ? `
                            <button class="btn btn-success btn-sm" onclick="app.saveCheckupItems()">
                                <i class="fas fa-save"></i> 저장
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div id="checkup-items-container">
                    ${this.renderCheckupItems(items, isEditable)}
                </div>
            `;
        }

        // 검진 결과 탭
        const resultsContent = document.getElementById('results-content');
        if (resultsContent) {
            const isEditable = checkup.status !== 'completed';

            resultsContent.innerHTML = `
                <div class="results-form">
                    <div class="results-header">
                        <h4>검진 결과 및 종합 소견</h4>
                        <p class="text-muted">검진 결과를 입력하고 종합 평가를 작성하세요</p>
                    </div>

                    <div class="results-grid">
                        <div class="form-group">
                            <label for="total-score">종합점수 (0-100점)</label>
                            <input type="number" id="total-score" min="0" max="100"
                                   value="${checkup.total_score || ''}"
                                   ${!isEditable ? 'readonly' : ''}
                                   placeholder="종합점수 입력">
                        </div>

                        <div class="form-group">
                            <label for="risk-level">위험도</label>
                            <select id="risk-level" ${!isEditable ? 'disabled' : ''}>
                                <option value="">선택하세요</option>
                                <option value="low" ${checkup.risk_level === 'low' ? 'selected' : ''}>낮음</option>
                                <option value="medium" ${checkup.risk_level === 'medium' ? 'selected' : ''}>보통</option>
                                <option value="high" ${checkup.risk_level === 'high' ? 'selected' : ''}>높음</option>
                            </select>
                        </div>

                        <div class="form-group full-width">
                            <label for="result-summary">검진 결과 요약</label>
                            <textarea id="result-summary" rows="4"
                                      ${!isEditable ? 'readonly' : ''}
                                      placeholder="검진 결과에 대한 종합적인 요약을 작성하세요">${checkup.result_summary || ''}</textarea>
                        </div>

                        <div class="form-group full-width">
                            <label for="recommendations">권고사항</label>
                            <textarea id="recommendations" rows="4"
                                      ${!isEditable ? 'readonly' : ''}
                                      placeholder="환자에게 권고할 사항들을 작성하세요">${checkup.recommendations || ''}</textarea>
                        </div>

                        <div class="form-group">
                            <label for="checkup-status">검진 상태</label>
                            <select id="checkup-status" ${!isEditable ? 'disabled' : ''}>
                                <option value="scheduled" ${checkup.status === 'scheduled' ? 'selected' : ''}>예약됨</option>
                                <option value="in_progress" ${checkup.status === 'in_progress' ? 'selected' : ''}>진행중</option>
                                <option value="completed" ${checkup.status === 'completed' ? 'selected' : ''}>완료</option>
                                <option value="cancelled" ${checkup.status === 'cancelled' ? 'selected' : ''}>취소됨</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="next-checkup-date">다음 검진 권장일</label>
                            <input type="date" id="next-checkup-date"
                                   value="${checkup.next_checkup_date ? checkup.next_checkup_date.split('T')[0] : ''}"
                                   ${!isEditable ? 'readonly' : ''}>
                        </div>
                    </div>

                    ${isEditable ? `
                        <div class="results-actions">
                            <button class="btn btn-success" onclick="app.saveCheckupResults()">
                                <i class="fas fa-save"></i> 검진 결과 저장
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // 모달 제목 업데이트
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) {
            modalTitle.textContent = `${checkup.patient_name} - ${checkup.type_name} 검진`;
        }
    }

    groupItemsByCategory(items) {
        return items.reduce((groups, item) => {
            const category = item.item_category || '기타';
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(item);
            return groups;
        }, {});
    }

    showPatientModal(patient = null) {
        const modal = document.getElementById('patient-modal');
        const form = document.getElementById('patient-form');
        const title = document.getElementById('patient-modal-title');

        if (patient) {
            title.textContent = '환자 정보 수정';
            // 폼에 환자 정보 채우기
            Object.keys(patient).forEach(key => {
                const input = form.querySelector(`[name=\"${key}\"]`);
                if (input) {
                    input.value = patient[key] || '';
                }
            });
        } else {
            title.textContent = '환자 등록';
            form.reset();
        }

        this.showModal('patient-modal');
    }

    async savePatient(event) {
        event.preventDefault();

        const form = event.target;
        const formData = new FormData(form);
        const patientData = Object.fromEntries(formData.entries());

        try {
            this.showLoading(true);

            // 온라인 상태에서 API 시도
            if (this.isOnline) {
                try {
                    const response = await this.fetchAPI('/patients', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(patientData)
                    });

                    if (response.success) {
                        // 등록된 환자 데이터를 즉시 IndexedDB에 캐시
                        if (response.patient) {
                            await this.saveToIndexedDB(this.stores.patients, response.patient);
                        }

                        this.showNotification('환자가 등록되었습니다.', 'success');
                        this.closeModals();
                        if (this.currentSection === 'patients') {
                            this.loadPatients();
                        }
                        return;
                    }
                } catch (apiError) {
                    console.warn('환자 등록 API 실패, 오프라인 저장으로 진행:', apiError);
                    // isOnline 상태를 false로 설정하여 다음에는 바로 오프라인 모드로 진입
                    this.isOnline = false;
                }
            }

            // 오프라인 상태이거나 API 실패 시 로컬 저장
            console.log('📝 오프라인 환자 저장 시작:', patientData);
            const offlinePatient = await this.saveOfflineData(this.stores.patients, patientData, 'create');
            console.log('✅ 오프라인 환자 저장 완료:', offlinePatient);

            this.showNotification('오프라인 모드: 환자 정보가 로컬에 저장되었습니다. 온라인 시 자동 동기화됩니다.', 'warning');
            this.closeModals();

            if (this.currentSection === 'patients') {
                this.loadPatients();
            }

        } catch (error) {
            console.error('환자 저장 실패:', error);
            this.showNotification('환자 저장에 실패했습니다: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async deletePatient(patientId, patientName) {
        if (!confirm(`${patientName} 환자의 정보를 삭제하시겠습니까?\n연관된 검진 기록도 함께 삭제됩니다.`)) {
            return;
        }

        try {
            this.showLoading(true);

            // 온라인 상태에서 API 시도
            if (this.isOnline) {
                const response = await this.fetchAPI(`/patients/${patientId}`, {
                    method: 'DELETE'
                });

                if (response.success) {
                    // IndexedDB에서도 삭제
                    await this.deleteFromIndexedDB(this.stores.patients, patientId);
                    this.showNotification('환자 정보가 삭제되었습니다.', 'success');
                    this.loadPatients();
                } else {
                    // API 호출은 성공했지만 삭제 실패 (예: 외래키 제약조건)
                    const errorMsg = response.error || '환자 삭제에 실패했습니다.';
                    this.showNotification(`삭제 실패: ${errorMsg}\n연관된 검진 기록이 있는 경우 먼저 검진을 삭제해주세요.`, 'error');
                }
                return;
            }

            // 오프라인 상태일 때만 로컬에서 삭제 마크
            const patient = await this.getFromIndexedDB(this.stores.patients, patientId);
            if (patient) {
                patient.action = 'delete';
                patient.sync_status = 'pending';
                await this.saveToIndexedDB(this.stores.patients, patient);
                this.showNotification('오프라인 모드: 삭제가 예약되었습니다. 온라인 시 서버에 반영됩니다.', 'warning');
                this.loadPatients();
            }

        } catch (error) {
            console.error('환자 삭제 실패:', error);
            this.showNotification('환자 삭제에 실패했습니다: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteCheckup(checkupId, patientName) {
        if (!confirm(`${patientName}님의 검진 기록을 삭제하시겠습니까?`)) {
            return;
        }

        try {
            this.showLoading(true);

            // 온라인 상태에서 API 시도
            if (this.isOnline) {
                const response = await this.fetchAPI(`/checkups/${checkupId}`, {
                    method: 'DELETE'
                });

                if (response.success) {
                    // IndexedDB에서도 삭제
                    await this.deleteFromIndexedDB(this.stores.checkups, checkupId);
                    this.showNotification('검진 기록이 삭제되었습니다.', 'success');
                    this.loadCheckups();
                } else {
                    // API 호출은 성공했지만 삭제 실패
                    const errorMsg = response.error || '검진 삭제에 실패했습니다.';
                    this.showNotification(`삭제 실패: ${errorMsg}`, 'error');
                }
                return;
            }

            // 오프라인 상태일 때만 로컬에서 삭제 마크
            const checkup = await this.getFromIndexedDB(this.stores.checkups, checkupId);
            if (checkup) {
                checkup.action = 'delete';
                checkup.sync_status = 'pending';
                await this.saveToIndexedDB(this.stores.checkups, checkup);
                this.showNotification('오프라인 모드: 삭제가 예약되었습니다. 온라인 시 서버에 반영됩니다.', 'warning');
                this.loadCheckups();
            }

        } catch (error) {
            console.error('검진 삭제 실패:', error);
            this.showNotification('검진 삭제에 실패했습니다: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showTab(tabName) {
        // 탭 버튼 활성화
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab=\"${tabName}\"]`).classList.add('active');

        // 탭 패널 표시
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`).classList.add('active');
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            modal.style.display = 'flex';
        }
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
            modal.style.display = 'none';
        });
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const messageEl = notification.querySelector('.notification-message');
        const iconEl = notification.querySelector('.notification-icon');

        // 아이콘 설정
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        iconEl.className = `notification-icon ${icons[type]}`;
        messageEl.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';

        // 5초 후 자동 닫기
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);

        // 닫기 버튼 이벤트
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.onclick = () => {
            notification.style.display = 'none';
        };
    }

    async fetchAPI(endpoint, options = {}) {
        const url = this.apiBaseUrl + endpoint;

        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // API 호출이 성공하면 온라인 상태로 업데이트
            if (!this.isOnline) {
                this.isOnline = true;
                this.updateConnectionStatus();
            }

            return await response.json();
        } catch (error) {
            console.error('API 요청 실패:', error);

            // 네트워크 오류가 발생하면 오프라인 상태로 업데이트
            if (error.message.includes('Failed to fetch') ||
                error.message.includes('ERR_INTERNET_DISCONNECTED') ||
                error.message.includes('ERR_NETWORK') ||
                !navigator.onLine) {

                if (this.isOnline) {
                    this.isOnline = false;
                    this.updateConnectionStatus();
                }

                // POST/PUT 요청인 경우 오프라인 큐에 저장
                if (options.method === 'POST' || options.method === 'PUT') {
                    console.log('오프라인 상태 감지 - 로컬에 저장');
                    await this.saveOfflineRequest(endpoint, options);
                    return {
                        success: true,
                        offline: true,
                        message: '오프라인 상태입니다. 온라인 연결 시 자동으로 동기화됩니다.'
                    };
                }
            }

            throw error;
        }
    }

    // 오프라인 요청을 IndexedDB에 저장
    async saveOfflineRequest(endpoint, options) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction(['offlineRequests'], 'readwrite');
            const store = transaction.objectStore('offlineRequests');

            const offlineRequest = {
                id: Date.now() + Math.random(),
                endpoint,
                options,
                timestamp: new Date().toISOString(),
                status: 'pending'
            };

            const request = store.add(offlineRequest);

            request.onsuccess = () => {
                console.log('오프라인 요청 저장됨:', offlineRequest);
                resolve();
            };

            request.onerror = () => {
                console.error('오프라인 요청 저장 실패:', request.error);
                reject(request.error);
            };
        });
    }

    // 검진 상세 데이터를 IndexedDB에 캐시
    async cacheCheckupDetail(checkup, items) {
        // IndexedDB 캐싱이 비활성화되어 있으면 캐싱하지 않음
        if (!this.indexedDBCacheEnabled) {
            console.log('ℹ️ IndexedDB 캐싱이 비활성화되어 있어 검진 상세를 캐싱하지 않습니다.');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.stores.checkups, this.stores.checkupItems], 'readwrite');

            transaction.oncomplete = () => {
                console.log('✅ 검진 상세 데이터 캐시 완료');
                resolve();
            };

            transaction.onerror = () => {
                console.error('검진 상세 데이터 캐시 실패:', transaction.error);
                reject(transaction.error);
            };

            // 검진 정보 저장/업데이트
            const checkupStore = transaction.objectStore(this.stores.checkups);
            const checkupRequest = checkupStore.put(checkup);

            // 검진 항목들 저장/업데이트
            const itemsStore = transaction.objectStore(this.stores.checkupItems);

            // 기존 검진 항목들 삭제
            const deleteIndex = itemsStore.index('checkup_id');
            const deleteRequest = deleteIndex.openCursor(IDBKeyRange.only(checkup.id));

            deleteRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    // 새로운 검진 항목들 추가
                    items.forEach(item => {
                        itemsStore.put(item);
                    });
                }
            };
        });
    }

    // IndexedDB에서 검진 상세 데이터 조회
    async getCheckupDetailFromIndexedDB(checkupId) {
        return new Promise((resolve) => {
            if (!this.db) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction([this.stores.checkups, this.stores.checkupItems], 'readonly');

            let checkup = null;
            let items = [];

            // 임시 ID인지 확인 (temp_로 시작하면 문자열 그대로 사용, 아니면 숫자로 변환)
            const isTempId = String(checkupId).startsWith('temp_');
            const searchKey = isTempId ? String(checkupId) : parseInt(checkupId);

            console.log('🔍 IndexedDB 검진 조회:', { checkupId, isTempId, searchKey });

            // 검진 정보 조회
            const checkupStore = transaction.objectStore(this.stores.checkups);
            const checkupRequest = checkupStore.get(searchKey);

            checkupRequest.onsuccess = () => {
                checkup = checkupRequest.result;
                console.log('📋 검진 정보 조회 결과:', checkup);
            };

            checkupRequest.onerror = () => {
                console.error('❌ 검진 정보 조회 실패:', checkupRequest.error);
            };

            // 검진 항목들 조회
            const itemsStore = transaction.objectStore(this.stores.checkupItems);
            const itemsIndex = itemsStore.index('checkup_id');
            const itemsRequest = itemsIndex.getAll(searchKey);

            itemsRequest.onsuccess = () => {
                items = itemsRequest.result || [];
                console.log('📋 검진 항목 조회 결과:', items.length, '개');
            };

            itemsRequest.onerror = () => {
                console.error('❌ 검진 항목 조회 실패:', itemsRequest.error);
            };

            transaction.oncomplete = () => {
                if (checkup) {
                    console.log('✅ IndexedDB에서 검진 상세 데이터 조회 성공');
                    resolve({ checkup, items });
                } else {
                    console.log('❌ IndexedDB에서 검진 상세 데이터를 찾을 수 없음');
                    resolve(null);
                }
            };

            transaction.onerror = () => {
                console.error('IndexedDB 검진 상세 조회 실패:', transaction.error);
                resolve(null);
            };
        });
    }

    // 검진 목록을 IndexedDB에 캐시
    async cacheCheckupsList(checkups) {
        // IndexedDB 캐싱이 비활성화되어 있으면 캐싱하지 않음
        if (!this.indexedDBCacheEnabled) {
            console.log('ℹ️ IndexedDB 캐싱이 비활성화되어 있어 검진 목록을 캐싱하지 않습니다.');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.stores.checkups], 'readwrite');
            const store = transaction.objectStore(this.stores.checkups);
            let successCount = 0;
            let errorCount = 0;

            transaction.oncomplete = () => {
                console.log(`✅ 검진 목록 캐시 완료 (성공: ${successCount}, 실패: ${errorCount})`);
                resolve();
            };

            transaction.onerror = () => {
                console.error('검진 목록 캐시 트랜잭션 실패:', transaction.error);
                // 일부 실패해도 성공한 것은 저장되므로 resolve
                resolve();
            };

            // 기존 검진 목록 업데이트/추가 (개별 에러 처리)
            checkups.forEach(checkup => {
                try {
                    const request = store.put(checkup);
                    request.onsuccess = () => {
                        successCount++;
                    };
                    request.onerror = (e) => {
                        errorCount++;
                        console.warn(`검진 캐시 실패 (ID:${checkup.id}):`, e.target.error);
                        // 에러를 무시하고 계속 진행
                        e.stopPropagation();
                    };
                } catch (error) {
                    errorCount++;
                    console.warn(`검진 캐시 예외 (ID:${checkup.id}):`, error);
                }
            });
        });
    }

    // IndexedDB에서 검진 목록 조회
    async getCheckupsFromIndexedDB() {
        return new Promise(async (resolve) => {
            if (!this.db) {
                resolve([]);
                return;
            }

            try {
                // 검진, 환자, 검진유형 데이터를 모두 가져오기
                const transaction = this.db.transaction([
                    this.stores.checkups,
                    this.stores.patients,
                    this.stores.checkupTypes
                ], 'readonly');

                const checkupsStore = transaction.objectStore(this.stores.checkups);
                const patientsStore = transaction.objectStore(this.stores.patients);
                const typesStore = transaction.objectStore(this.stores.checkupTypes);

                const [checkups, patients, types] = await Promise.all([
                    new Promise((res, rej) => {
                        const req = checkupsStore.getAll();
                        req.onsuccess = () => res(req.result || []);
                        req.onerror = () => rej(req.error);
                    }),
                    new Promise((res, rej) => {
                        const req = patientsStore.getAll();
                        req.onsuccess = () => res(req.result || []);
                        req.onerror = () => rej(req.error);
                    }),
                    new Promise((res, rej) => {
                        const req = typesStore.getAll();
                        req.onsuccess = () => res(req.result || []);
                        req.onerror = () => rej(req.error);
                    })
                ]);

                // 환자와 검진유형 매핑
                const patientsMap = new Map(patients.map(p => [p.id, p]));
                const typesMap = new Map(types.map(t => [t.id, t]));

                console.log('🔍 데이터 조인 디버깅:', {
                    checkupsCount: checkups.length,
                    patientsCount: patients.length,
                    typesCount: types.length,
                    patientIds: patients.map(p => p.id),
                    typeIds: types.map(t => t.id),
                    sampleCheckup: checkups[0]
                });

                // 검진 데이터에 환자명과 검진유형명 추가
                const enrichedCheckups = checkups.map(checkup => {
                    // 이미 저장된 patient_name/type_name이 있으면 우선 사용
                    let patientName = checkup.patient_name;
                    let typeName = checkup.type_name;

                    // 저장된 이름이 없으면 조인 시도
                    if (!patientName) {
                        const patient = patientsMap.get(checkup.patient_id);
                        patientName = patient ? patient.name : '(알 수 없음)';

                        if (!patient) {
                            console.warn(`⚠️ 환자 매칭 실패: checkup.patient_id=${checkup.patient_id}, 사용 가능한 환자 IDs:`, Array.from(patientsMap.keys()));
                        }
                    }

                    if (!typeName) {
                        const type = typesMap.get(checkup.checkup_type_id);
                        typeName = type ? type.type_name : '(알 수 없음)';

                        if (!type) {
                            console.warn(`⚠️ 검진유형 매칭 실패: checkup.checkup_type_id=${checkup.checkup_type_id}, 사용 가능한 유형 IDs:`, Array.from(typesMap.keys()));
                        }
                    }

                    return {
                        ...checkup,
                        patient_name: patientName,
                        type_name: typeName,
                        status: checkup.status || 'scheduled'
                    };
                });

                console.log(`✅ IndexedDB에서 ${enrichedCheckups.length}개의 검진 데이터 조회 (환자/유형 조인 완료)`);
                resolve(enrichedCheckups);

            } catch (error) {
                console.error('IndexedDB 검진 목록 조회 실패:', error);
                resolve([]);
            }
        });
    }

    // 환자 목록을 IndexedDB에 캐시
    async cachePatientsList(patients) {
        // IndexedDB 캐싱이 비활성화되어 있으면 캐싱하지 않음
        if (!this.indexedDBCacheEnabled) {
            console.log('ℹ️ IndexedDB 캐싱이 비활성화되어 있어 환자 목록을 캐싱하지 않습니다.');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.stores.patients], 'readwrite');
            const store = transaction.objectStore(this.stores.patients);
            let successCount = 0;
            let errorCount = 0;

            transaction.oncomplete = () => {
                console.log(`✅ 환자 목록 캐시 완료 (성공: ${successCount}, 실패: ${errorCount})`);
                resolve();
            };

            transaction.onerror = () => {
                console.error('환자 목록 캐시 트랜잭션 실패:', transaction.error);
                // 일부 실패해도 성공한 것은 저장되므로 resolve
                resolve();
            };

            // 기존 환자 목록 업데이트/추가 (개별 에러 처리)
            patients.forEach(patient => {
                try {
                    const request = store.put(patient);
                    request.onsuccess = () => {
                        successCount++;
                    };
                    request.onerror = (e) => {
                        errorCount++;
                        console.warn(`환자 캐시 실패 (${patient.name}, ID:${patient.id}):`, e.target.error);
                        // 에러를 무시하고 계속 진행
                        e.stopPropagation();
                    };
                } catch (error) {
                    errorCount++;
                    console.warn(`환자 캐시 예외 (${patient.name}):`, error);
                }
            });
        });
    }

    // IndexedDB에서 환자 목록 조회
    async getPatientsFromIndexedDB() {
        return new Promise((resolve) => {
            if (!this.db) {
                resolve([]);
                return;
            }

            const transaction = this.db.transaction([this.stores.patients], 'readonly');
            const store = transaction.objectStore(this.stores.patients);
            const request = store.getAll();

            request.onsuccess = () => {
                const patients = request.result || [];
                console.log(`✅ IndexedDB에서 ${patients.length}개의 환자 데이터 조회`);
                resolve(patients);
            };

            request.onerror = () => {
                console.error('IndexedDB 환자 목록 조회 실패:', request.error);
                resolve([]);
            };
        });
    }

    // IndexedDB에 데이터 저장 (범용 함수)
    async saveToIndexedDB(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => {
                console.log(`✅ IndexedDB에 데이터 저장 완료 (${storeName})`);
                resolve(request.result);
            };

            request.onerror = () => {
                console.error(`IndexedDB 저장 실패 (${storeName}):`, request.error);
                reject(request.error);
            };
        });
    }

    // 임시키 생성
    generateTempId(type) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return this.tempKeyPrefix[type] + timestamp + '_' + random;
    }

    // 오프라인 데이터 저장 (임시키 포함)
    async saveOfflineData(storeName, data, action = 'create') {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            // 오프라인 데이터에 메타 정보 추가
            const offlineData = {
                ...data,
                sync_status: 'pending',
                action: action,
                created_offline: true,
                offline_timestamp: new Date().toISOString()
            };

            // 신규 등록의 경우 임시키 생성
            if (action === 'create') {
                const tempId = this.generateTempId(storeName);
                offlineData.temp_id = tempId;
                offlineData.id = tempId; // IndexedDB keyPath용

                // 환자 등록의 경우 임시 patient_id 생성
                if (storeName === this.stores.patients) {
                    const timestamp = Date.now();
                    offlineData.patient_id = `TEMP_P${timestamp}`;
                    console.log(`🆔 임시 환자 ID 생성: ${offlineData.patient_id}`);
                }

                // 검진 등록의 경우 임시 checkup_no 생성
                if (storeName === this.stores.checkups) {
                    const timestamp = Date.now();
                    offlineData.checkup_no = `TEMP_CHK${timestamp}`;
                    console.log(`🆔 임시 검진 번호 생성: ${offlineData.checkup_no}`);
                }
            }

            const request = store.put(offlineData);

            request.onsuccess = () => {
                console.log(`✅ 오프라인 데이터 저장 완료 (${storeName})`, offlineData);
                resolve(offlineData);
            };

            request.onerror = () => {
                console.error(`❌ 오프라인 데이터 저장 실패 (${storeName}):`, request.error);
                reject(request.error);
            };
        });
    }

    // 동기화 대상 데이터 조회
    async getPendingSyncData(storeName) {
        return new Promise((resolve) => {
            if (!this.db) {
                resolve([]);
                return;
            }

            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);

            // sync_status 인덱스 존재 여부 확인
            if (!store.indexNames.contains('sync_status')) {
                console.warn(`${storeName}에 sync_status 인덱스가 없습니다. 전체 데이터 조회합니다.`);
                const getAllRequest = store.getAll();

                getAllRequest.onsuccess = () => {
                    const allData = getAllRequest.result || [];
                    const pendingData = allData.filter(item => item.sync_status === 'pending');
                    console.log(`📋 동기화 대상 데이터 ${pendingData.length}개 (${storeName})`);
                    resolve(pendingData);
                };

                getAllRequest.onerror = () => {
                    console.error(`❌ 동기화 대상 조회 실패 (${storeName}):`, getAllRequest.error);
                    resolve([]);
                };
                return;
            }

            const index = store.index('sync_status');
            const request = index.getAll('pending');

            request.onsuccess = () => {
                const pendingData = request.result || [];
                console.log(`📋 동기화 대상 데이터 ${pendingData.length}개 (${storeName})`);
                resolve(pendingData);
            };

            request.onerror = () => {
                console.error(`❌ 동기화 대상 조회 실패 (${storeName}):`, request.error);
                resolve([]);
            };
        });
    }

    // 동기화 완료 후 실제키로 업데이트
    async updateSyncedData(storeName, tempId, realData) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            // 임시 데이터 삭제
            const deleteRequest = store.delete(tempId);

            deleteRequest.onsuccess = () => {
                console.log(`🗑️ 임시 데이터 삭제 완료: ${tempId}`);

                // 실제 데이터 저장
                const syncedData = {
                    ...realData,
                    sync_status: 'synced',
                    synced_at: new Date().toISOString()
                };

                const putRequest = store.put(syncedData);

                putRequest.onsuccess = () => {
                    console.log(`✅ 동기화 완료 - 임시키 ${tempId} → 실제키 ${realData.id} (${realData.patient_id || realData.checkup_no || ''})`);
                    resolve(syncedData);
                };

                putRequest.onerror = () => {
                    console.error(`❌ 실제 데이터 저장 실패:`, putRequest.error);
                    reject(putRequest.error);
                };
            };

            deleteRequest.onerror = () => {
                reject(deleteRequest.error);
            };
        });
    }

    // 전체 데이터 동기화 수행
    async performFullDataSync() {
        if (!this.isOnline) {
            console.log('오프라인 상태로 전체 데이터 동기화를 건너뜁니다.');
            return false;
        }

        console.log('📥 전체 데이터 동기화 시작...');

        try {
            // 1. 모든 환자 데이터 동기화
            const patientsSuccess = await this.syncAllPatients();

            // 2. 모든 검진 유형 동기화
            const typesSuccess = await this.syncAllCheckupTypes();

            // 3. 모든 검진 데이터 동기화
            const checkupsSuccess = await this.syncAllCheckups();

            // 4. 모든 검진 항목 동기화
            const itemsSuccess = await this.syncAllCheckupItems();

            // 모든 동기화가 성공한 경우에만 동기화 완료 처리
            if (patientsSuccess && typesSuccess && checkupsSuccess && itemsSuccess) {
                console.log('✅ 전체 데이터 동기화 완료');

                // 동기화 시간 업데이트 (실제 서버와 동기화 성공 시에만)
                this.updateSyncTime();

                // 현재 화면 갱신
                this.refreshCurrentView();

                return true;
            } else {
                console.warn('⚠️ 일부 데이터 동기화 실패');
                return false;
            }

        } catch (error) {
            console.error('❌ 전체 데이터 동기화 실패:', error);
            return false;
        }
    }

    // 동기화 시간 업데이트
    updateSyncTime() {
        const syncTimeEl = document.getElementById('sync-time');
        const syncStatusText = document.getElementById('sync-status-text');

        if (syncTimeEl) {
            const now = new Date();
            const timeString = now.toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            syncTimeEl.textContent = `서버 업데이트: ${timeString}`;
        }

        if (syncStatusText) {
            syncStatusText.textContent = '동기화 완료';
        }
    }

    // 모든 환자 데이터 동기화
    async syncAllPatients() {
        try {
            const response = await fetch(this.apiBaseUrl + '/patients');
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    await this.replaceAllData(this.stores.patients, result.data);
                    console.log(`✅ 환자 데이터 ${result.data.length}개 동기화 완료`);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('환자 데이터 동기화 실패:', error);
            return false;
        }
    }

    // 모든 검진 유형 동기화
    async syncAllCheckupTypes() {
        try {
            const response = await fetch(this.apiBaseUrl + '/checkup-types');
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    await this.replaceAllData(this.stores.checkupTypes, result.data);
                    console.log(`✅ 검진 유형 ${result.data.length}개 동기화 완료`);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('검진 유형 동기화 실패:', error);
            return false;
        }
    }

    // 모든 검진 데이터 동기화
    async syncAllCheckups() {
        try {
            const response = await fetch(this.apiBaseUrl + '/checkups');
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    await this.replaceAllData(this.stores.checkups, result.data);
                    console.log(`✅ 검진 데이터 ${result.data.length}개 동기화 완료`);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('검진 데이터 동기화 실패:', error);
            return false;
        }
    }

    // 모든 검진 항목 동기화
    async syncAllCheckupItems() {
        try {
            const response = await fetch(this.apiBaseUrl + '/checkups/all-items');
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    await this.replaceAllData(this.stores.checkupItems, result.data);
                    console.log(`✅ 검진 항목 ${result.data.length}개 동기화 완료`);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('검진 항목 동기화 실패:', error);
            return false;
        }
    }

    // 전체 데이터 교체 (오프라인 데이터는 보존)
    async replaceAllData(storeName, newData) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            transaction.oncomplete = () => {
                console.log(`✅ ${storeName} 전체 데이터 교체 완료`);
                resolve();
            };

            transaction.onerror = () => {
                console.error(`❌ ${storeName} 데이터 교체 실패:`, transaction.error);
                reject(transaction.error);
            };

            // sync_status 인덱스 존재 여부 확인
            if (!store.indexNames.contains('sync_status')) {
                console.warn(`${storeName}에서 sync_status 인덱스를 찾을 수 없어 전체 교체를 수행합니다.`);

                const clearRequest = store.clear();
                clearRequest.onsuccess = () => {
                    newData.forEach(item => {
                        const syncedItem = {
                            ...item,
                            sync_status: 'synced',
                            synced_at: new Date().toISOString()
                        };
                        store.put(syncedItem);
                    });
                };
                return;
            }

            // 1. 동기화된 데이터만 삭제 (오프라인 데이터는 보존)
            const syncedIndex = store.index('sync_status');
            const syncedRequest = syncedIndex.openCursor(IDBKeyRange.only('synced'));

            const deletedIds = new Set();

            syncedRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    deletedIds.add(cursor.value.id);
                    cursor.delete();
                    cursor.continue();
                } else {
                    // 2. 새로운 서버 데이터 추가
                    newData.forEach(item => {
                        const syncedItem = {
                            ...item,
                            sync_status: 'synced',
                            synced_at: new Date().toISOString()
                        };
                        store.put(syncedItem);
                    });
                }
            };

            syncedRequest.onerror = () => {
                // sync_status 인덱스가 없는 경우 전체 데이터 교체
                console.warn(`${storeName}에서 sync_status 인덱스를 찾을 수 없어 전체 교체를 수행합니다.`);

                const clearRequest = store.clear();
                clearRequest.onsuccess = () => {
                    newData.forEach(item => {
                        const syncedItem = {
                            ...item,
                            sync_status: 'synced',
                            synced_at: new Date().toISOString()
                        };
                        store.put(syncedItem);
                    });
                };
            };
        });
    }

    // 주기적 동기화 시작
    startPeriodicSync() {
        // 설정된 주기마다 전체 데이터 동기화
        this.syncInterval = setInterval(async () => {
            if (this.isOnline) {
                console.log(`🔄 주기적 동기화 시작 (${this.syncIntervalSeconds}초 간격)...`);
                try {
                    // 1. 오프라인 데이터를 먼저 서버에 업로드
                    await this.syncOfflineRequests();
                    // 2. 서버 데이터를 다운로드
                    await this.performFullDataSync();
                    console.log('✅ 주기적 동기화 완료');
                } catch (error) {
                    console.error('❌ 주기적 동기화 실패:', error);
                }
            }
        }, this.syncIntervalSeconds * 1000);

        console.log(`⏰ 주기적 동기화가 시작되었습니다 (${this.syncIntervalSeconds}초 간격)`);
    }

    // 주기적 동기화 중지
    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('⏸️ 주기적 동기화가 중지되었습니다');
        }
    }

    // 자동 동기화 토글
    toggleAutoSync(enabled) {
        this.autoSyncEnabled = enabled;

        // localStorage에 설정 저장
        localStorage.setItem('autoSyncEnabled', enabled.toString());

        if (enabled) {
            console.log('✅ 자동 동기화가 활성화되었습니다');
            if (this.indexedDBCacheEnabled) {
                this.startPeriodicSync();
                this.showNotification('자동 동기화가 활성화되었습니다.', 'success');
            } else {
                this.showNotification('IndexedDB 캐싱이 비활성화되어 있어 자동 동기화를 사용할 수 없습니다.', 'warning');
            }
        } else {
            console.log('⏹️ 자동 동기화가 비활성화되었습니다');
            this.stopPeriodicSync();
            this.showNotification('자동 동기화가 비활성화되었습니다. 수동으로 동기화해주세요.', 'info');
        }

        this.updateSettingsStatus();
    }

    // IndexedDB 캐싱 토글
    toggleIndexedDBCache(enabled) {
        this.indexedDBCacheEnabled = enabled;

        // localStorage에 설정 저장
        localStorage.setItem('indexedDBCacheEnabled', enabled.toString());

        if (enabled) {
            console.log('✅ IndexedDB 캐싱이 활성화되었습니다');
            this.showNotification('IndexedDB 캐싱이 활성화되었습니다. 오프라인에서도 데이터를 사용할 수 있습니다.', 'success');

            // 캐싱이 활성화되면 서버 데이터를 로컬에 동기화
            if (this.isOnline) {
                setTimeout(async () => {
                    try {
                        this.showLoading(true, '서버 데이터 동기화 중...');
                        await this.performFullDataSync();
                        this.showNotification('서버 데이터가 로컬에 저장되었습니다.', 'success');
                    } catch (error) {
                        console.error('데이터 동기화 실패:', error);
                    } finally {
                        this.showLoading(false);
                    }
                }, 500);
            }
        } else {
            console.log('⏹️ IndexedDB 캐싱이 비활성화되었습니다');
            // 자동 동기화도 함께 비활성화
            if (this.autoSyncEnabled) {
                this.autoSyncEnabled = false;
                localStorage.setItem('autoSyncEnabled', 'false');
                this.stopPeriodicSync();
                const autoSyncToggle = document.getElementById('auto-sync-toggle');
                if (autoSyncToggle) {
                    autoSyncToggle.checked = false;
                }
            }
            this.showNotification('IndexedDB 캐싱이 비활성화되었습니다. 서버에서 직접 데이터를 조회합니다.', 'info');
        }

        this.updateSettingsStatus();
    }

    // 동기화 주기 변경
    updateSyncInterval(seconds) {
        // 유효성 검사 (10초 ~ 3600초)
        if (seconds < 10 || seconds > 3600 || isNaN(seconds)) {
            this.showNotification('동기화 주기는 10초에서 3600초 사이로 설정해야 합니다.', 'warning');
            // 입력 필드 값 복원
            const syncIntervalInput = document.getElementById('sync-interval-input');
            if (syncIntervalInput) {
                syncIntervalInput.value = this.syncIntervalSeconds;
            }
            return;
        }

        this.syncIntervalSeconds = seconds;

        // localStorage에 설정 저장
        localStorage.setItem('syncIntervalSeconds', seconds.toString());

        console.log(`⏱️ 동기화 주기가 ${seconds}초로 변경되었습니다`);

        // 자동 동기화가 활성화되어 있으면 주기를 재시작
        if (this.autoSyncEnabled && this.indexedDBCacheEnabled) {
            this.stopPeriodicSync();
            this.startPeriodicSync();
            this.showNotification(`동기화 주기가 ${seconds}초로 변경되었습니다.`, 'success');
        } else {
            this.showNotification(`동기화 주기가 ${seconds}초로 저장되었습니다.`, 'success');
        }

        this.updateSettingsStatus();
    }

    // localStorage에서 모든 설정 로드
    loadSettings() {
        // 자동 동기화 설정
        const autoSync = localStorage.getItem('autoSyncEnabled');
        if (autoSync !== null) {
            this.autoSyncEnabled = autoSync === 'true';
        }
        console.log(`📋 자동 동기화 설정 로드: ${this.autoSyncEnabled ? '활성화' : '비활성화'}`);

        // IndexedDB 캐싱 설정
        const indexedDBCache = localStorage.getItem('indexedDBCacheEnabled');
        if (indexedDBCache !== null) {
            this.indexedDBCacheEnabled = indexedDBCache === 'true';
        }
        console.log(`📋 IndexedDB 캐싱 설정 로드: ${this.indexedDBCacheEnabled ? '활성화' : '비활성화'}`);

        // 동기화 주기 설정
        const syncInterval = localStorage.getItem('syncIntervalSeconds');
        if (syncInterval !== null) {
            this.syncIntervalSeconds = parseInt(syncInterval, 10);
            // 유효성 검사 (10초 ~ 3600초)
            if (this.syncIntervalSeconds < 10) this.syncIntervalSeconds = 10;
            if (this.syncIntervalSeconds > 3600) this.syncIntervalSeconds = 3600;
        }
        console.log(`📋 동기화 주기 설정 로드: ${this.syncIntervalSeconds}초`);
    }

    // 서버 연결 상태 확인
    async checkServerConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

            const response = await fetch(this.apiBaseUrl + '/health', {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            console.log('서버 연결 확인 실패:', error.message);
            return false;
        }
    }

    getStatusText(status) {
        const statusMap = {
            'scheduled': '예약됨',
            'in_progress': '진행중',
            'completed': '완료',
            'cancelled': '취소됨'
        };
        return statusMap[status] || status;
    }

    // 날짜 포맷 유틸리티 함수
    formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString; // 유효하지 않은 날짜는 그대로 반환

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');

            return `${year}-${month}-${day}`;
        } catch (error) {
            console.error('날짜 포맷 오류:', error);
            return dateString;
        }
    }

    // 생년월일 포맷 (yyyymmdd)
    formatBirthDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');

            return `${year}${month}${day}`;
        } catch (error) {
            console.error('생년월일 포맷 오류:', error);
            return dateString;
        }
    }

    // 검진일시 포맷 (yyyy-mm-dd HH:mm:ss)
    formatCheckupDateTime(dateString, timeString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');

            let timeFormatted = '00:00:00';
            if (timeString) {
                // TIME 형식 처리 (HH:mm:ss 또는 ISO 형식)
                if (timeString.includes('T')) {
                    const timeDate = new Date(timeString);
                    const hours = String(timeDate.getHours()).padStart(2, '0');
                    const minutes = String(timeDate.getMinutes()).padStart(2, '0');
                    const seconds = String(timeDate.getSeconds()).padStart(2, '0');
                    timeFormatted = `${hours}:${minutes}:${seconds}`;
                } else {
                    timeFormatted = timeString;
                }
            }

            return `${year}-${month}-${day} ${timeFormatted}`;
        } catch (error) {
            console.error('검진일시 포맷 오류:', error);
            return dateString;
        }
    }

    getRiskLevelText(level) {
        const levelMap = {
            'low': '낮음',
            'medium': '보통',
            'high': '높음'
        };
        return levelMap[level] || level;
    }

    searchPatients(query) {
        if (!query || query.trim() === '') {
            // 검색어가 없으면 전체 목록 표시
            this.displayPatients(this.currentPatientsList);
            return;
        }

        const searchTerm = query.toLowerCase().trim();
        const filteredPatients = this.currentPatientsList.filter(patient => {
            // 환자명, 환자번호, 연락처로 검색
            const name = (patient.name || '').toLowerCase();
            const patientId = (patient.patient_id || '').toLowerCase();
            const phone = (patient.phone || '').toLowerCase();

            return name.includes(searchTerm) ||
                   patientId.includes(searchTerm) ||
                   phone.includes(searchTerm);
        });

        this.displayPatients(filteredPatients);
    }

    searchAndFilterCheckups() {
        // 검색어, 상태, 날짜 필터 가져오기
        const searchInput = document.getElementById('checkup-search');
        const statusFilter = document.getElementById('status-filter');
        const dateFilter = document.getElementById('date-filter');

        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const selectedStatus = statusFilter ? statusFilter.value : '';
        const selectedDate = dateFilter ? dateFilter.value : '';

        let filteredCheckups = this.currentCheckupsList;

        // 검색어 필터링
        if (searchTerm) {
            filteredCheckups = filteredCheckups.filter(checkup => {
                const patientName = (checkup.patient_name || '').toLowerCase();
                const checkupNo = (checkup.checkup_no || '').toLowerCase();
                const typeName = (checkup.type_name || '').toLowerCase();

                return patientName.includes(searchTerm) ||
                       checkupNo.includes(searchTerm) ||
                       typeName.includes(searchTerm);
            });
        }

        // 상태 필터링
        if (selectedStatus) {
            filteredCheckups = filteredCheckups.filter(checkup => checkup.status === selectedStatus);
        }

        // 날짜 필터링
        if (selectedDate) {
            filteredCheckups = filteredCheckups.filter(checkup => {
                if (!checkup.checkup_date) return false;
                const checkupDate = checkup.checkup_date.split('T')[0]; // yyyy-mm-dd 형식으로 변환
                return checkupDate === selectedDate;
            });
        }

        this.displayCheckups(filteredCheckups);
    }

    renderCheckupItems(items, isEditable) {
        if (items.length === 0) {
            return '<p class="text-center text-muted">검진 항목이 없습니다. "항목 추가" 버튼을 클릭하여 새 항목을 추가하세요.</p>';
        }

        const groupedItems = this.groupItemsByCategory(items);
        return Object.keys(groupedItems).map(category => `
            <div class="category-section">
                <h5 class="category-title">${category}</h5>
                <div class="items-grid">
                    ${groupedItems[category].map(item => this.renderCheckupItem(item, isEditable)).join('')}
                </div>
            </div>
        `).join('');
    }

    renderCheckupItem(item, isEditable) {
        if (isEditable) {
            return `
                <div class="item-card editable" data-item-id="${item.id || 'new'}">
                    <div class="item-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label>항목명</label>
                                <input type="text" class="item-name-input" value="${item.item_name || ''}" placeholder="검사 항목명">
                            </div>
                            <div class="form-group">
                                <label>카테고리</label>
                                <select class="item-category-input">
                                    <option value="신체계측" ${item.item_category === '신체계측' ? 'selected' : ''}>신체계측</option>
                                    <option value="혈압" ${item.item_category === '혈압' ? 'selected' : ''}>혈압</option>
                                    <option value="혈액검사" ${item.item_category === '혈액검사' ? 'selected' : ''}>혈액검사</option>
                                    <option value="소변검사" ${item.item_category === '소변검사' ? 'selected' : ''}>소변검사</option>
                                    <option value="영상검사" ${item.item_category === '영상검사' ? 'selected' : ''}>영상검사</option>
                                    <option value="기타" ${item.item_category === '기타' ? 'selected' : ''}>기타</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>측정값</label>
                                <input type="text" class="item-value-input" value="${item.item_value || ''}" placeholder="측정값">
                            </div>
                            <div class="form-group">
                                <label>단위</label>
                                <input type="text" class="item-unit-input" value="${item.unit || ''}" placeholder="단위">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>정상범위</label>
                                <input type="text" class="item-reference-input" value="${item.reference_range || ''}" placeholder="정상범위">
                            </div>
                            <div class="form-group">
                                <label>상태</label>
                                <select class="item-status-input">
                                    <option value="">선택하세요</option>
                                    <option value="normal" ${item.status === 'normal' ? 'selected' : ''}>정상</option>
                                    <option value="abnormal" ${item.status === 'abnormal' ? 'selected' : ''}>이상</option>
                                    <option value="warning" ${item.status === 'warning' ? 'selected' : ''}>주의</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>비고</label>
                            <textarea class="item-notes-input" placeholder="추가 설명이나 비고사항">${item.notes || ''}</textarea>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-danger btn-sm" onclick="app.removeCheckupItem(this)">
                                <i class="fas fa-trash"></i> 삭제
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // 읽기 전용 모드
            return `
                <div class="item-card readonly">
                    <div class="item-name">${item.item_name}</div>
                    <div class="item-value">
                        <span class="value">${item.item_value || '-'}</span>
                        <span class="unit">${item.unit || ''}</span>
                    </div>
                    <div class="item-reference">정상범위: ${item.reference_range || '-'}</div>
                    ${item.status ? `<span class="item-status ${item.status}">${this.getStatusText(item.status)}</span>` : ''}
                    ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
                </div>
            `;
        }
    }

    addCheckupItem() {
        const container = document.getElementById('checkup-items-container');
        if (!container) return;

        const newItem = {
            id: null,
            item_name: '',
            item_category: '기타',
            item_value: '',
            unit: '',
            reference_range: '',
            status: '',
            notes: ''
        };

        // 새 항목을 맨 아래에 추가
        const newItemHtml = this.renderCheckupItem(newItem, true);
        container.insertAdjacentHTML('beforeend', `
            <div class="category-section">
                <h5 class="category-title">새 항목</h5>
                <div class="items-grid">
                    ${newItemHtml}
                </div>
            </div>
        `);

        // 새로 추가된 항목으로 스크롤
        const newItemCard = container.lastElementChild;
        newItemCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 첫 번째 입력 필드에 포커스
        const firstInput = newItemCard.querySelector('input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 300);
        }
    }

    removeCheckupItem(button) {
        const itemCard = button.closest('.item-card');
        if (itemCard) {
            if (confirm('이 검진 항목을 삭제하시겠습니까?')) {
                const categorySection = itemCard.closest('.category-section');
                itemCard.remove();

                // 카테고리에 다른 항목이 없으면 카테고리 섹션도 제거
                const remainingItems = categorySection.querySelectorAll('.item-card');
                if (remainingItems.length === 0) {
                    categorySection.remove();
                }
            }
        }
    }

    async saveCheckupItems() {
        if (!this.currentCheckup) return;

        try {
            this.showLoading(true);

            const checkupId = this.currentCheckup.checkup.id;
            const isTempCheckup = String(checkupId).startsWith('temp_');

            console.log('🔍 검진 항목 저장 시작:', { checkupId, isTempCheckup, isOnline: this.isOnline });

            // 모든 검진 항목 데이터 수집
            const itemCards = document.querySelectorAll('#checkup-items-container .item-card.editable');
            const items = [];

            itemCards.forEach((card, index) => {
                const itemData = {
                    item_category: card.querySelector('.item-category-input').value,
                    item_name: card.querySelector('.item-name-input').value.trim(),
                    item_value: card.querySelector('.item-value-input').value.trim(),
                    reference_range: card.querySelector('.item-reference-input').value.trim(),
                    unit: card.querySelector('.item-unit-input').value.trim(),
                    status: card.querySelector('.item-status-input').value,
                    notes: card.querySelector('.item-notes-input').value.trim(),
                    checkup_id: checkupId
                };

                // 항목명이 있는 경우만 저장
                if (itemData.item_name) {
                    // 임시 ID 또는 새 항목의 경우 고유 ID 생성
                    if (isTempCheckup || !card.dataset.itemId || card.dataset.itemId === 'new') {
                        itemData.id = `temp_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`;
                        itemData.sync_status = 'pending';
                        itemData.action = 'create'; // 동기화 시 필요한 액션 타입
                    } else {
                        itemData.id = parseInt(card.dataset.itemId);
                    }
                    items.push(itemData);
                }
            });

            if (items.length === 0) {
                this.showNotification('저장할 검진 항목이 없습니다.', 'warning');
                return;
            }

            // 온라인 상태에서 서버에 저장 시도 (임시 검진이 아닌 경우만)
            if (this.isOnline && !isTempCheckup) {
                try {
                    const response = await this.fetchAPI(`/checkups/${checkupId}/items`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ items })
                    });

                    if (response.success && !response.offline) {
                        // 온라인 저장 성공 - 서버에서 받은 항목들을 IndexedDB에 캐시
                        if (response.items && response.items.length > 0) {
                            await this.saveItemsToIndexedDB(checkupId, response.items);
                        }
                        this.showNotification(`${response.successCount || items.length}개 항목이 저장되었습니다.`, 'success');

                        // 저장 후 검진 상세 정보 다시 로드
                        await this.showCheckupDetail(checkupId);
                        return;
                    }
                } catch (apiError) {
                    console.warn('검진 항목 API 저장 실패, 오프라인 모드로 전환:', apiError);
                }
            }

            // 오프라인이거나 임시 검진이거나 API 실패 시 - IndexedDB에 직접 저장
            console.log('💾 검진 항목을 IndexedDB에 저장:', items.length);
            await this.saveItemsToIndexedDB(checkupId, items);

            this.showNotification(
                `${items.length}개 항목이 저장되었습니다. ${!this.isOnline || isTempCheckup ? '(오프라인 저장 - 온라인 시 동기화됩니다)' : ''}`,
                'success'
            );

            // IndexedDB에서 다시 로드하여 표시
            const checkupDetail = await this.getCheckupDetailFromIndexedDB(checkupId);
            if (checkupDetail) {
                this.displayCheckupDetail(checkupDetail.checkup, checkupDetail.items);
            }

        } catch (error) {
            console.error('검진 항목 저장 실패:', error);
            this.showNotification('검진 항목 저장에 실패했습니다: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // 검진 항목들을 IndexedDB에 저장하는 헬퍼 함수
    async saveItemsToIndexedDB(checkupId, items) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.stores.checkupItems], 'readwrite');
            const itemsStore = transaction.objectStore(this.stores.checkupItems);

            transaction.oncomplete = () => {
                console.log('✅ 검진 항목 IndexedDB 저장 완료:', items.length);
                resolve();
            };

            transaction.onerror = () => {
                console.error('❌ 검진 항목 IndexedDB 저장 실패:', transaction.error);
                reject(transaction.error);
            };

            // 기존 검진 항목들 삭제 (같은 checkup_id)
            const deleteIndex = itemsStore.index('checkup_id');
            const deleteRequest = deleteIndex.openCursor(IDBKeyRange.only(checkupId));

            deleteRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    // 새로운 검진 항목들 추가
                    items.forEach(item => {
                        // checkup_id가 없으면 추가
                        if (!item.checkup_id) {
                            item.checkup_id = checkupId;
                        }
                        itemsStore.put(item);
                    });
                }
            };

            deleteRequest.onerror = () => {
                console.error('기존 항목 삭제 실패:', deleteRequest.error);
                reject(deleteRequest.error);
            };
        });
    }

    async saveCheckupResults() {
        if (!this.currentCheckup) return;

        try {
            this.showLoading(true);

            const resultData = {
                status: document.getElementById('checkup-status').value,
                total_score: parseInt(document.getElementById('total-score').value) || null,
                risk_level: document.getElementById('risk-level').value || null,
                result_summary: document.getElementById('result-summary').value.trim() || null,
                recommendations: document.getElementById('recommendations').value.trim() || null,
                next_checkup_date: document.getElementById('next-checkup-date').value || null
            };

            const response = await this.fetchAPI(`/checkups/${this.currentCheckup.checkup.id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(resultData)
            });

            if (response.success) {
                if (response.offline) {
                    // 오프라인 상태에서 저장됨
                    this.showNotification(response.message, 'warning');
                } else {
                    // 온라인 상태에서 저장됨
                    this.showNotification('검진 결과가 저장되었습니다.', 'success');

                    // 저장 후 검진 상세 정보 다시 로드
                    await this.showCheckupDetail(this.currentCheckup.checkup.id);

                    // 검진 목록도 갱신
                    if (this.currentSection === 'checkups') {
                        this.loadCheckups();
                    }
                }
            } else {
                throw new Error(response.error || '검진 결과 저장에 실패했습니다.');
            }
        } catch (error) {
            console.error('검진 결과 저장 실패:', error);
            this.showNotification(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    getItemStatusText(status) {
        const statusMap = {
            'normal': '정상',
            'abnormal': '이상',
            'warning': '주의'
        };
        return statusMap[status] || status;
    }

    showPatientDetail(patientId) {
        // 환자 상세 정보 표시 (추후 구현)
        console.log('환자 상세 보기:', patientId);
    }

    // 검진 예약 모달 표시
    async showCheckupModal() {
        try {
            // 환자 목록 로드
            await this.loadPatientsForCheckup();

            // 검진 유형 로드
            await this.loadCheckupTypes();

            // 오늘 날짜를 기본값으로 설정
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('checkup-date').value = today;

            this.showModal('checkup-modal');
        } catch (error) {
            console.error('검진 예약 모달 로드 실패:', error);
            this.showNotification('검진 예약 모달을 열 수 없습니다.', 'error');
        }
    }

    // 검진용 환자 목록 로드
    async loadPatientsForCheckup() {
        try {
            let patients = [];

            // 온라인 상태에서 먼저 API 시도
            if (this.isOnline) {
                try {
                    const response = await this.fetchAPI('/patients');
                    if (response.success) {
                        patients = response.data;
                    }
                } catch (apiError) {
                    console.warn('환자 목록 API 실패, IndexedDB에서 로드:', apiError);
                }
            }

            // 오프라인이거나 API 실패 시 IndexedDB에서 조회
            if (patients.length === 0) {
                patients = await this.getPatientsFromIndexedDB();
                // 삭제 예정인 환자는 제외
                patients = patients.filter(p => p.action !== 'delete');
            }

            const select = document.getElementById('checkup-patient');
            select.innerHTML = '<option value="">환자를 선택하세요</option>';

            patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.id;
                // 임시 환자 여부를 data 속성으로 저장
                option.dataset.isTemp = patient.patient_id.startsWith('TEMP_') ? 'true' : 'false';
                option.dataset.indexedDbId = patient.id;
                option.dataset.tempId = patient.temp_id || '';
                const patientIdLabel = patient.patient_id.startsWith('TEMP_') ? '(임시 등록)' : `(${patient.patient_id})`;
                option.textContent = `${patient.name} ${patientIdLabel}`;
                select.appendChild(option);
            });

            if (!this.isOnline && patients.length > 0) {
                console.log(`🔄 오프라인: IndexedDB에서 ${patients.length}명의 환자 로드`);
            }
        } catch (error) {
            console.error('환자 목록 로드 실패:', error);
        }
    }

    // 검진 유형 로드
    async loadCheckupTypes() {
        try {
            let checkupTypes = [];

            // 온라인 상태에서 먼저 API 시도
            if (this.isOnline) {
                try {
                    const response = await this.fetchAPI('/checkup-types');
                    if (response.success) {
                        checkupTypes = response.data;
                        // IndexedDB에 캐시
                        await this.cacheCheckupTypes(checkupTypes);
                    }
                } catch (apiError) {
                    console.warn('검진 유형 API 실패, IndexedDB에서 로드:', apiError);
                }
            }

            // 오프라인이거나 API 실패 시 IndexedDB에서 조회
            if (checkupTypes.length === 0) {
                checkupTypes = await this.getCheckupTypesFromIndexedDB();
                if (!this.isOnline && checkupTypes.length > 0) {
                    console.log(`🔄 오프라인: IndexedDB에서 ${checkupTypes.length}개 검진 유형 로드`);
                }
            }

            const select = document.getElementById('checkup-type');
            select.innerHTML = '<option value="">검진 유형을 선택하세요</option>';

            checkupTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type.id;
                option.textContent = `${type.type_name} (${type.duration_minutes}분)`;
                select.appendChild(option);
            });

            if (!this.isOnline && checkupTypes.length === 0) {
                this.showNotification('오프라인 상태이며 캐시된 검진 유형 데이터가 없습니다.', 'warning');
            }
        } catch (error) {
            console.error('검진 유형 로드 실패:', error);
        }
    }

    // 검진 유형을 IndexedDB에 캐시
    async cacheCheckupTypes(types) {
        return new Promise((resolve) => {
            if (!this.db) {
                resolve();
                return;
            }

            const transaction = this.db.transaction([this.stores.checkupTypes], 'readwrite');
            const store = transaction.objectStore(this.stores.checkupTypes);

            transaction.oncomplete = () => {
                console.log('✅ 검진 유형 캐시 완료');
                resolve();
            };

            transaction.onerror = () => {
                console.error('검진 유형 캐시 실패:', transaction.error);
                resolve(); // 에러가 나도 계속 진행
            };

            types.forEach(type => {
                store.put(type);
            });
        });
    }

    // IndexedDB에서 검진 유형 조회
    async getCheckupTypesFromIndexedDB() {
        return new Promise((resolve) => {
            if (!this.db) {
                resolve([]);
                return;
            }

            const transaction = this.db.transaction([this.stores.checkupTypes], 'readonly');
            const store = transaction.objectStore(this.stores.checkupTypes);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                console.error('검진 유형 조회 실패:', request.error);
                resolve([]);
            };
        });
    }

    // 검진 예약 저장
    async saveCheckup(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const checkupData = Object.fromEntries(formData.entries());

        try {
            this.showLoading(true);

            // 선택된 환자의 임시 여부 확인
            const selectedPatient = document.querySelector('#checkup-patient option:checked');
            const isTempPatient = selectedPatient?.dataset.isTemp === 'true';
            const tempId = selectedPatient?.dataset.tempId || '';

            // 선택된 검진유형 정보
            const selectedType = document.querySelector('#checkup-type option:checked');

            // 오프라인 저장을 위해 환자명과 검진유형명 추가
            checkupData.patient_name = selectedPatient?.textContent?.trim() || '';
            checkupData.type_name = selectedType?.textContent?.trim() || '';

            console.log('🔍 검진 예약 정보:', {
                patient_id: checkupData.patient_id,
                patient_name: checkupData.patient_name,
                checkup_type_id: checkupData.checkup_type_id,
                type_name: checkupData.type_name,
                isTempPatient,
                tempId,
                isOnline: this.isOnline
            });

            // 온라인 상태이고 실제 환자 ID인 경우 API 시도
            if (this.isOnline && !isTempPatient) {
                try {
                    const response = await this.fetchAPI('/checkups', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(checkupData)
                    });

                    if (response.success) {
                        // 예약된 검진 데이터를 즉시 IndexedDB에 캐시
                        if (response.checkup) {
                            await this.saveToIndexedDB(this.stores.checkups, response.checkup);
                        }

                        this.showNotification('검진이 예약되었습니다.', 'success');
                        this.closeModals();
                        if (this.currentSection === 'checkups') {
                            this.loadCheckups();
                        }
                        this.loadDashboard();
                        return;
                    }
                } catch (apiError) {
                    console.warn('검진 예약 API 실패, 오프라인 저장으로 진행:', apiError);
                }
            }

            // 오프라인 상태이거나 API 실패, 또는 임시 환자인 경우 로컬 저장
            if (isTempPatient) {
                // 임시 환자의 temp_id를 별도 필드로 저장
                checkupData.temp_patient_id = tempId;
                console.log(`🔄 임시 환자 검진 예약: IndexedDB id=${checkupData.patient_id}, temp_id=${tempId}`);
            }

            const offlineCheckup = await this.saveOfflineData(this.stores.checkups, checkupData, 'create');

            const message = isTempPatient
                ? '임시 환자로 검진이 예약되었습니다. 온라인 시 자동 동기화됩니다.'
                : '오프라인 모드: 검진 예약이 로컬에 저장되었습니다. 온라인 시 자동 동기화됩니다.';

            this.showNotification(message, 'warning');
            this.closeModals();

            if (this.currentSection === 'checkups') {
                this.loadCheckups();
            }
            this.loadDashboard();

        } catch (error) {
            console.error('검진 예약 실패:', error);
            this.showNotification('검진 예약에 실패했습니다: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // 오프라인 요청들을 동기화
    // 완전한 양방향 동기화 (임시키 → 실제키)
    async syncOfflineRequests() {
        if (!this.isOnline) {
            console.log('오프라인 상태로 동기화를 건너뜁니다.');
            return;
        }

        console.log('🔄 양방향 동기화 시작...');

        try {
            let totalSynced = 0;

            // 1. 환자 동기화
            const syncedPatients = await this.syncPendingData(this.stores.patients, '/patients');
            totalSynced += syncedPatients;

            // 2. 검진 동기화
            const syncedCheckups = await this.syncPendingData(this.stores.checkups, '/checkups');
            totalSynced += syncedCheckups;

            // 3. 검진 항목 동기화
            const syncedItems = await this.syncPendingData(this.stores.checkupItems, '/checkups/{checkup_id}/items');
            totalSynced += syncedItems;

            // 4. 기존 오프라인 요청 동기화 (backward compatibility)
            const syncedLegacy = await this.syncLegacyOfflineRequests();
            totalSynced += syncedLegacy;

            // 동기화 완료 후 화면 갱신
            this.refreshCurrentView();

            console.log('✅ 양방향 동기화 완료');
            if (totalSynced > 0) {
                this.showNotification(`${totalSynced}개의 오프라인 데이터가 동기화되었습니다.`, 'success');
            }

        } catch (error) {
            console.error('❌ 동기화 중 오류 발생:', error);
            this.showNotification('일부 데이터 동기화에 실패했습니다.', 'warning');
        }
    }

    // 특정 스토어의 동기화 대상 데이터 처리
    async syncPendingData(storeName, apiEndpoint) {
        const pendingData = await this.getPendingSyncData(storeName);

        if (pendingData.length === 0) {
            console.log(`📭 ${storeName}: 동기화 대상 없음`);
            return 0;
        }

        console.log(`📤 ${storeName}: ${pendingData.length}개 데이터 동기화 중...`);
        let syncedCount = 0;

        for (const data of pendingData) {
            try {
                if (data.action === 'create') {
                    await this.syncCreateData(storeName, data, apiEndpoint);
                    syncedCount++;
                } else if (data.action === 'update') {
                    await this.syncUpdateData(storeName, data, apiEndpoint);
                    syncedCount++;
                } else if (data.action === 'delete') {
                    await this.syncDeleteData(storeName, data, apiEndpoint);
                    syncedCount++;
                }
            } catch (error) {
                console.error(`❌ ${storeName} 동기화 실패 (${data.temp_id || data.id}):`, error);
            }
        }

        return syncedCount;
    }

    // 생성 데이터 동기화 (임시키 → 실제키)
    async syncCreateData(storeName, data, apiEndpoint) {
        // API로 전송할 깨끗한 데이터 준비
        const cleanData = { ...data };
        delete cleanData.id;
        delete cleanData.temp_id;
        delete cleanData.sync_status;
        delete cleanData.action;
        delete cleanData.created_offline;
        delete cleanData.offline_timestamp;

        // 검진 데이터이고 임시 환자 ID가 있는 경우 실제 환자 ID로 변환
        if (storeName === this.stores.checkups && cleanData.temp_patient_id) {
            console.log(`🔍 임시 환자 ID 변환 시도: ${cleanData.temp_patient_id}`);

            // IndexedDB에서 실제 환자 ID 찾기
            const realPatient = await this.findRealPatientId(cleanData.temp_patient_id);

            if (realPatient) {
                // 실제 patient_id (DB의 실제 환자 ID)로 변환
                // 서버 API는 숫자 ID를 기대하므로 realPatient.id 사용
                cleanData.patient_id = realPatient.id;
                console.log(`✅ 환자 ID 변환: ${cleanData.temp_patient_id} → ${realPatient.id} (patient_id: ${realPatient.patient_id})`);
                delete cleanData.temp_patient_id;
            } else {
                // 환자가 아직 동기화되지 않았을 수 있으므로 이 검진은 나중에 처리
                console.warn(`⏭️ 검진 동기화 보류: 임시 환자 ${cleanData.temp_patient_id}가 아직 동기화되지 않음`);
                throw new Error(`임시 환자 ID ${cleanData.temp_patient_id}에 대한 실제 환자를 찾을 수 없습니다. 다음 동기화에서 재시도됩니다.`);
            }
        }

        delete cleanData.temp_patient_id; // 서버에 전송하지 않음

        // 검진 항목 동기화 - checkup_id 변환 필요
        if (storeName === this.stores.checkupItems) {
            const checkupId = cleanData.checkup_id;

            // 임시 검진 ID인 경우 실제 검진 ID로 변환
            if (String(checkupId).startsWith('temp_checkup_')) {
                console.log(`🔍 임시 검진 ID 변환 시도: ${checkupId}`);

                const realCheckup = await this.findRealCheckupId(checkupId);

                if (realCheckup) {
                    cleanData.checkup_id = realCheckup.id;
                    console.log(`✅ 검진 ID 변환: ${checkupId} → ${realCheckup.id}`);
                } else {
                    console.warn(`⏭️ 검진 항목 동기화 보류: 임시 검진 ${checkupId}가 아직 동기화되지 않음`);
                    throw new Error(`임시 검진 ID ${checkupId}에 대한 실제 검진을 찾을 수 없습니다. 다음 동기화에서 재시도됩니다.`);
                }
            }

            // API 엔드포인트에서 {checkup_id} 치환
            const realCheckupId = cleanData.checkup_id;
            apiEndpoint = apiEndpoint.replace('{checkup_id}', realCheckupId);

            // items 배열로 래핑 (checkup_id는 URL에 있으므로 본문에서 제거)
            const itemDataForApi = { ...cleanData };
            delete itemDataForApi.checkup_id; // URL에 이미 포함되어 있으므로 제거

            const requestBody = { items: [itemDataForApi] };

            console.log(`📤 검진 항목 동기화 시도:`, {
                checkupId: realCheckupId,
                endpoint: this.apiBaseUrl + apiEndpoint,
                itemName: cleanData.item_name,
                requestBody: requestBody
            });

            const response = await fetch(this.apiBaseUrl + apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // 검진 항목 동기화 완료 - IndexedDB에서 임시 항목 삭제
                    await this.deleteFromIndexedDB(storeName, data.id);
                    console.log(`✅ ${storeName} 생성 동기화 완료: ${data.id} (${cleanData.item_name})`);
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return;
        }

        const response = await fetch(this.apiBaseUrl + apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanData)
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
                // temp_id 유지하면서 실제 데이터로 업데이트
                const syncedData = {
                    ...result.data,
                    temp_id: data.temp_id  // 원본의 temp_id 유지
                };
                // 임시키를 실제키로 교체
                await this.updateSyncedData(storeName, data.id, syncedData);
                console.log(`✅ ${storeName} 생성 동기화: ${data.temp_id} → ID:${result.data.id}`);
            }
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }

    // 임시 검진 ID로 실제 검진 찾기
    async findRealCheckupId(tempCheckupId) {
        return new Promise((resolve) => {
            if (!this.db) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction([this.stores.checkups], 'readonly');
            const store = transaction.objectStore(this.stores.checkups);
            const request = store.getAll();

            request.onsuccess = () => {
                const checkups = request.result || [];
                console.log(`🔍 임시 검진 ID로 실제 검진 찾기: ${tempCheckupId}`);

                // temp_id가 일치하고 동기화된 검진 찾기
                const realCheckup = checkups.find(c =>
                    c.temp_id === tempCheckupId &&
                    c.sync_status === 'synced' &&
                    c.id &&
                    !String(c.id).startsWith('temp_')
                );

                if (realCheckup) {
                    console.log(`✅ 실제 검진 발견: ${tempCheckupId} → id=${realCheckup.id}`);
                } else {
                    console.log(`❌ 실제 검진을 찾지 못함: ${tempCheckupId}`);
                }

                resolve(realCheckup);
            };

            request.onerror = () => resolve(null);
        });
    }

    // 임시 환자 ID로 실제 환자 찾기
    async findRealPatientId(tempPatientId) {
        return new Promise((resolve) => {
            if (!this.db) {
                resolve(null);
                return;
            }

            const transaction = this.db.transaction([this.stores.patients], 'readonly');
            const store = transaction.objectStore(this.stores.patients);
            const request = store.getAll();

            request.onsuccess = () => {
                const patients = request.result || [];
                console.log(`🔍 임시 환자 ID로 실제 환자 찾기: ${tempPatientId}`);
                console.log(`📋 전체 환자 목록:`, patients.map(p => ({
                    id: p.id,
                    patient_id: p.patient_id,
                    temp_id: p.temp_id,
                    sync_status: p.sync_status
                })));

                // temp_id가 일치하고 동기화된 환자 찾기
                const realPatient = patients.find(p =>
                    p.temp_id === tempPatientId &&
                    p.sync_status === 'synced' &&
                    p.patient_id &&
                    !p.patient_id.startsWith('TEMP_')
                );

                if (realPatient) {
                    console.log(`✅ 실제 환자 발견: ${tempPatientId} → patient_id=${realPatient.patient_id}`);
                } else {
                    console.log(`❌ 실제 환자를 찾지 못함: ${tempPatientId}`);
                }

                resolve(realPatient);
            };

            request.onerror = () => resolve(null);
        });
    }

    // 업데이트 데이터 동기화
    async syncUpdateData(storeName, data, apiEndpoint) {
        // 실제 ID가 있는 경우에만 업데이트 동기화
        if (!data.id || data.id.toString().includes('temp_')) {
            console.warn(`업데이트 동기화 건너뜀: 실제 ID 없음 (${data.temp_id || data.id})`);
            return;
        }

        const cleanData = { ...data };
        delete cleanData.sync_status;
        delete cleanData.action;
        delete cleanData.created_offline;
        delete cleanData.offline_timestamp;

        const endpoint = apiEndpoint.replace('{id}', data.id);
        const response = await fetch(this.apiBaseUrl + endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanData)
        });

        if (response.ok) {
            // 동기화 상태 업데이트
            await this.updateSyncStatus(storeName, data.id, 'synced');
            console.log(`✅ ${storeName} 업데이트 동기화: ID:${data.id}`);
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }

    // 삭제 데이터 동기화
    async syncDeleteData(storeName, data, apiEndpoint) {
        // 실제 ID가 있는 경우에만 서버에서 삭제
        if (!data.id || data.id.toString().includes('temp_')) {
            // 임시 ID는 서버에 없으므로 로컬에서만 삭제
            await this.deleteFromIndexedDB(storeName, data.id);
            console.log(`✅ ${storeName} 임시 데이터 삭제: ${data.temp_id || data.id}`);
            return;
        }

        const endpoint = apiEndpoint.replace('{id}', data.id);
        const response = await fetch(this.apiBaseUrl + endpoint, {
            method: 'DELETE'
        });

        if (response.ok) {
            // 서버 삭제 성공 시 로컬에서도 삭제
            await this.deleteFromIndexedDB(storeName, data.id);
            console.log(`✅ ${storeName} 삭제 동기화: ID:${data.id}`);
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }

    // 동기화 상태만 업데이트
    async updateSyncStatus(storeName, id, status) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const data = getRequest.result;
                if (data) {
                    data.sync_status = status;
                    data.synced_at = new Date().toISOString();
                    store.put(data);
                }
                resolve();
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // 기존 오프라인 요청 동기화 (backward compatibility)
    async syncLegacyOfflineRequests() {
        return new Promise((resolve) => {
            if (!this.db) {
                resolve(0);
                return;
            }

            const transaction = this.db.transaction(['offlineRequests'], 'readwrite');
            const store = transaction.objectStore('offlineRequests');
            const request = store.getAll();

            request.onsuccess = async () => {
                const offlineRequests = request.result || [];
                let syncedCount = 0;

                for (const offlineRequest of offlineRequests) {
                    try {
                        const response = await fetch(this.apiBaseUrl + offlineRequest.endpoint, {
                            ...offlineRequest.options,
                            headers: {
                                'Content-Type': 'application/json',
                                ...offlineRequest.options.headers
                            }
                        });

                        if (response.ok) {
                            // 성공한 요청 삭제
                            const deleteTransaction = this.db.transaction(['offlineRequests'], 'readwrite');
                            const deleteStore = deleteTransaction.objectStore('offlineRequests');
                            deleteStore.delete(offlineRequest.id);
                            syncedCount++;
                        }
                    } catch (error) {
                        console.error('기존 오프라인 요청 동기화 실패:', error);
                    }
                }
                resolve(syncedCount);
            };

            request.onerror = () => resolve(0);
        });
    }

    // 현재 화면 새로고침
    refreshCurrentView() {
        switch (this.currentSection) {
            case 'patients':
                this.loadPatients();
                break;
            case 'checkups':
                this.loadCheckups();
                break;
            case 'dashboard':
                this.loadDashboard();
                break;
        }
    }

    // ==================== 설정 및 수동 동기화 기능 ====================

    // 설정 모달 표시
    async showSettingsModal() {
        // 동기화 정보 및 설정 상태 업데이트
        await this.updateSyncInfo();
        this.updateSettingsStatus();

        // 설정 토글 상태 설정
        const autoSyncToggle = document.getElementById('auto-sync-toggle');
        if (autoSyncToggle) {
            autoSyncToggle.checked = this.autoSyncEnabled;
        }

        const indexedDBCacheToggle = document.getElementById('indexeddb-cache-toggle');
        if (indexedDBCacheToggle) {
            indexedDBCacheToggle.checked = this.indexedDBCacheEnabled;
        }

        // 동기화 주기 입력 필드 값 설정
        const syncIntervalInput = document.getElementById('sync-interval-input');
        if (syncIntervalInput) {
            syncIntervalInput.value = this.syncIntervalSeconds;
        }

        this.showModal('settings-modal');
    }

    // 설정 상태 업데이트
    updateSettingsStatus() {
        // IndexedDB 캐싱 상태 업데이트
        const indexedDBCacheStatus = document.getElementById('indexeddb-cache-status');
        if (indexedDBCacheStatus) {
            indexedDBCacheStatus.textContent = this.indexedDBCacheEnabled
                ? '활성화됨 (오프라인 지원)'
                : '비활성화됨 (서버 직접 조회)';
        }

        // 자동 동기화 상태 업데이트
        const autoSyncStatus = document.getElementById('auto-sync-status');
        if (autoSyncStatus) {
            if (this.autoSyncEnabled && this.indexedDBCacheEnabled) {
                // 동기화 주기를 분과 초로 표시
                const minutes = Math.floor(this.syncIntervalSeconds / 60);
                const seconds = this.syncIntervalSeconds % 60;
                let intervalText = '';
                if (minutes > 0 && seconds > 0) {
                    intervalText = `${minutes}분 ${seconds}초`;
                } else if (minutes > 0) {
                    intervalText = `${minutes}분`;
                } else {
                    intervalText = `${seconds}초`;
                }
                autoSyncStatus.textContent = `활성화됨 (${intervalText} 간격)`;
            } else if (this.autoSyncEnabled && !this.indexedDBCacheEnabled) {
                autoSyncStatus.textContent = '비활성화됨 (IndexedDB 캐싱 필요)';
            } else {
                autoSyncStatus.textContent = '비활성화됨';
            }
        }
    }

    // 동기화 정보 업데이트
    async updateSyncInfo() {
        try {
            // 로컬 데이터 통계
            const patients = await this.getPatientsFromIndexedDB();
            const checkups = await this.getCheckupsFromIndexedDB();
            const totalLocal = patients.length + checkups.length;

            // 동기화 대기 중인 데이터
            const pendingPatients = patients.filter(p => p.sync_status === 'pending' || !p.sync_status);
            const pendingCheckups = checkups.filter(c => c.sync_status === 'pending' || !c.sync_status);
            const totalPending = pendingPatients.length + pendingCheckups.length;

            // UI 업데이트
            const localTotalCount = document.getElementById('local-total-count');
            if (localTotalCount) {
                localTotalCount.textContent = `${totalLocal}개`;
            }

            const pendingSyncCountInfo = document.getElementById('pending-sync-count-info');
            if (pendingSyncCountInfo) {
                pendingSyncCountInfo.textContent = `${totalPending}개`;
                pendingSyncCountInfo.style.color = totalPending > 0 ? 'var(--warning-color)' : 'var(--success-color)';
            }

            const lastSyncTimeInfo = document.getElementById('last-sync-time-info');
            if (lastSyncTimeInfo) {
                const syncTimeEl = document.getElementById('sync-time');
                if (syncTimeEl && syncTimeEl.textContent) {
                    lastSyncTimeInfo.textContent = syncTimeEl.textContent.replace('서버 업데이트: ', '');
                } else {
                    lastSyncTimeInfo.textContent = '동기화 안됨';
                }
            }

        } catch (error) {
            console.error('동기화 정보 업데이트 실패:', error);
        }
    }

    // 서버 → 로컬 수동 동기화
    async syncFromServerManual() {
        if (!this.isOnline) {
            this.showNotification('오프라인 상태에서는 서버 동기화를 할 수 없습니다.', 'warning');
            return;
        }

        if (!confirm('서버의 모든 데이터를 로컬에 다운로드합니다.\n계속하시겠습니까?')) {
            return;
        }

        try {
            this.showLoading(true);
            console.log('🔄 서버 → 로컬 수동 동기화 시작...');

            // 전체 데이터 동기화 수행
            await this.performFullDataSync();

            this.showNotification('서버 데이터를 로컬에 저장했습니다.', 'success');
            await this.updateSyncInfo();

        } catch (error) {
            console.error('서버 → 로컬 동기화 실패:', error);
            this.showNotification('서버 동기화에 실패했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // 로컬 → 서버 수동 동기화
    async syncToServerManual() {
        if (!this.isOnline) {
            this.showNotification('오프라인 상태에서는 서버에 업로드할 수 없습니다.', 'warning');
            return;
        }

        try {
            this.showLoading(true);
            console.log('🔄 로컬 → 서버 수동 동기화 시작...');

            // 동기화 대기 중인 데이터 수집
            const patients = await this.getPatientsFromIndexedDB();
            const checkups = await this.getCheckupsFromIndexedDB();

            const pendingPatients = patients.filter(p => p.sync_status === 'pending' || !p.sync_status);
            const pendingCheckups = checkups.filter(c => c.sync_status === 'pending' || !c.sync_status);

            if (pendingPatients.length === 0 && pendingCheckups.length === 0) {
                this.showNotification('동기화할 데이터가 없습니다.', 'info');
                this.showLoading(false);
                return;
            }

            if (!confirm(`${pendingPatients.length + pendingCheckups.length}개의 데이터를 서버에 업로드합니다.\n계속하시겠습니까?`)) {
                this.showLoading(false);
                return;
            }

            let successCount = 0;
            let errorCount = 0;

            // 환자 데이터 업로드
            for (const patient of pendingPatients) {
                try {
                    const response = await this.fetchAPI('/patients', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(patient)
                    });

                    if (response.success && response.patient) {
                        // 서버에서 받은 실제 ID로 업데이트
                        await this.deleteFromIndexedDB(this.stores.patients, patient.id);
                        await this.saveToIndexedDB(this.stores.patients, {
                            ...response.patient,
                            sync_status: 'synced'
                        });
                        successCount++;
                    }
                } catch (error) {
                    console.error('환자 업로드 실패:', patient.id, error);
                    errorCount++;
                }
            }

            // 검진 데이터 업로드
            for (const checkup of pendingCheckups) {
                try {
                    const response = await this.fetchAPI('/checkups', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(checkup)
                    });

                    if (response.success && response.checkup) {
                        await this.deleteFromIndexedDB(this.stores.checkups, checkup.id);
                        await this.saveToIndexedDB(this.stores.checkups, {
                            ...response.checkup,
                            sync_status: 'synced'
                        });
                        successCount++;
                    }
                } catch (error) {
                    console.error('검진 업로드 실패:', checkup.id, error);
                    errorCount++;
                }
            }

            if (successCount > 0) {
                this.showNotification(`${successCount}개 데이터가 서버에 동기화되었습니다.`, 'success');
            }
            if (errorCount > 0) {
                this.showNotification(`${errorCount}개 데이터 동기화에 실패했습니다.`, 'warning');
            }

            await this.updateSyncInfo();
            this.refreshCurrentView();

        } catch (error) {
            console.error('로컬 → 서버 동기화 실패:', error);
            this.showNotification('서버 업로드에 실패했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // 양방향 동기화 (로컬 → 서버 → 로컬)
    async forceSyncBoth() {
        if (!this.isOnline) {
            this.showNotification('오프라인 상태에서는 양방향 동기화를 할 수 없습니다.', 'warning');
            return;
        }

        if (!confirm('양방향 동기화를 수행합니다.\n1. 로컬 대기 데이터를 서버에 업로드\n2. 서버의 모든 데이터를 로컬에 다운로드\n\n계속하시겠습니까?')) {
            return;
        }

        try {
            this.showLoading(true, '양방향 동기화 중...');

            // 1단계: 로컬 → 서버 (오프라인 데이터 업로드)
            console.log('🔄 1단계: 로컬 → 서버 동기화');
            await this.syncOfflineRequests();

            // 2단계: 서버 → 로컬 (전체 데이터 다운로드)
            console.log('🔄 2단계: 서버 → 로컬 동기화');
            await this.performFullDataSync();

            this.showNotification('모든 데이터가 동기화되었습니다.', 'success');

        } catch (error) {
            console.error('양방향 동기화 실패:', error);
            this.showNotification('양방향 동기화에 실패했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // 로컬 데이터 전체 삭제
    async clearLocalData() {
        const patients = await this.getPatientsFromIndexedDB();
        const checkups = await this.getCheckupsFromIndexedDB();
        const totalCount = patients.length + checkups.length;

        const pendingPatients = patients.filter(p => p.sync_status === 'pending' || !p.sync_status);
        const pendingCheckups = checkups.filter(c => c.sync_status === 'pending' || !c.sync_status);
        const pendingCount = pendingPatients.length + pendingCheckups.length;

        let confirmMessage = `로컬 데이터 ${totalCount}개를 모두 삭제합니다.`;
        if (pendingCount > 0) {
            confirmMessage += `\n\n⚠️ 경고: 동기화되지 않은 데이터 ${pendingCount}개가 포함되어 있습니다.\n삭제된 데이터는 복구할 수 없습니다.`;
        }
        confirmMessage += '\n\n정말 삭제하시겠습니까?';

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            this.showLoading(true);

            // 모든 스토어 데이터 삭제
            for (const storeName of Object.values(this.stores)) {
                await this.clearStore(storeName);
            }

            this.showNotification('로컬 데이터가 모두 삭제되었습니다.', 'success');
            await this.updateSyncInfo();
            this.refreshCurrentView();

        } catch (error) {
            console.error('로컬 데이터 삭제 실패:', error);
            this.showNotification('데이터 삭제에 실패했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // IndexedDB 스토어 전체 삭제
    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log(`✅ ${storeName} 스토어 삭제 완료`);
                resolve();
            };

            request.onerror = () => {
                console.error(`❌ ${storeName} 스토어 삭제 실패:`, request.error);
                reject(request.error);
            };
        });
    }

    // IndexedDB에서 데이터 삭제 (범용 함수)
    async getFromIndexedDB(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                console.error(`❌ IndexedDB 조회 실패 (${storeName}, ID: ${id}):`, request.error);
                reject(request.error);
            };
        });
    }

    async deleteFromIndexedDB(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log(`✅ IndexedDB에서 데이터 삭제 완료 (${storeName}, ID: ${id})`);
                resolve();
            };

            request.onerror = () => {
                console.error(`❌ IndexedDB 삭제 실패 (${storeName}, ID: ${id}):`, request.error);
                reject(request.error);
            };
        });
    }

    // ==================== 검진 일정 캘린더 기능 ====================

    async loadSchedule() {
        // 검진 목록 로드
        await this.loadCheckups();
        // 캘린더 렌더링
        this.renderCalendar();
    }

    navigateMonth(direction) {
        this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + direction);
        this.renderCalendar();
    }

    renderCalendar() {
        const year = this.currentCalendarDate.getFullYear();
        const month = this.currentCalendarDate.getMonth();

        // 월/년 표시
        const monthYearElement = document.getElementById('current-month-year');
        if (monthYearElement) {
            const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월',
                              '7월', '8월', '9월', '10월', '11월', '12월'];
            monthYearElement.textContent = `${year}년 ${monthNames[month]}`;
        }

        // 캘린더 그리드 렌더링
        const calendarView = document.getElementById('calendar-view');
        if (!calendarView) return;

        // 요일 헤더
        const dayHeaders = ['일', '월', '화', '수', '목', '금', '토'];
        let html = '';

        dayHeaders.forEach(day => {
            html += `<div class="calendar-day-header">${day}</div>`;
        });

        // 이번 달 첫날과 마지막날
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const firstDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        // 이전 달 마지막 날들
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
        }

        // 이번 달 날짜들
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const dateString = this.formatDateToString(currentDate);
            const isToday = currentDate.getTime() === today.getTime();
            const isSelected = this.selectedDate === dateString;

            // 해당 날짜의 검진 개수 계산
            const checkupsOnDate = this.currentCheckupsList.filter(c => {
                if (!c.checkup_date) return false;
                const checkupDate = c.checkup_date.split('T')[0];
                return checkupDate === dateString;
            });

            let dayClass = 'calendar-day';
            if (isToday) dayClass += ' today';
            if (isSelected) dayClass += ' selected';

            html += `
                <div class="${dayClass}" onclick="app.selectDate('${dateString}')">
                    <div class="calendar-day-number">${day}</div>
                    ${checkupsOnDate.length > 0 ? `<div class="calendar-event-count">${checkupsOnDate.length}</div>` : ''}
                </div>
            `;
        }

        // 다음 달 첫 날들
        const remainingDays = 42 - (firstDayOfWeek + daysInMonth);
        for (let day = 1; day <= remainingDays; day++) {
            html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
        }

        calendarView.innerHTML = html;
    }

    selectDate(dateString) {
        this.selectedDate = dateString;
        this.renderCalendar();
        this.displayDailyCheckups(dateString);
    }

    displayDailyCheckups(dateString) {
        const titleElement = document.getElementById('selected-date-title');
        const listElement = document.getElementById('daily-checkups-list');

        if (!listElement) return;

        // 날짜 표시
        if (titleElement && dateString) {
            // YYYY-MM-DD 형식의 문자열을 직접 파싱
            const [year, month, day] = dateString.split('-').map(Number);
            const formatted = `${year}년 ${month}월 ${day}일의 검진`;
            titleElement.textContent = formatted;
        }

        // 해당 날짜의 검진 목록
        const checkupsOnDate = this.currentCheckupsList.filter(c => {
            if (!c.checkup_date) return false;
            const checkupDate = c.checkup_date.split('T')[0];
            return checkupDate === dateString;
        });

        if (checkupsOnDate.length === 0) {
            listElement.innerHTML = '<p class="text-center text-muted">해당 날짜에 예약된 검진이 없습니다.</p>';
            return;
        }

        // 시간순 정렬
        checkupsOnDate.sort((a, b) => {
            const timeA = a.checkup_time || '00:00:00';
            const timeB = b.checkup_time || '00:00:00';
            return timeA.localeCompare(timeB);
        });

        listElement.innerHTML = checkupsOnDate.map(checkup => {
            const time = checkup.checkup_time ? checkup.checkup_time.substring(0, 5) : '--:--';
            return `
                <div class="daily-checkups-item" onclick="app.showCheckupDetail('${checkup.id}')">
                    <div class="daily-checkup-time">${time}</div>
                    <div class="daily-checkup-patient">${checkup.patient_name}</div>
                    <div class="daily-checkup-type">${checkup.type_name}</div>
                    <div class="checkup-status status-${checkup.status}">${this.getStatusText(checkup.status)}</div>
                </div>
            `;
        }).join('');
    }

    formatDateToString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ==================== 리포트 기능 ====================

    async loadReports() {
        // 데이터 로드
        await Promise.all([
            this.loadCheckups(),
            this.loadPatients()
        ]);

        // 통계 계산 및 표시
        this.displayReportStatistics();
        this.displayStatusDistribution();
        this.displayTypeStatistics();
        this.displayMonthlyTrend();
    }

    displayReportStatistics() {
        // 기본 통계
        const completedCount = this.currentCheckupsList.filter(c => c.status === 'completed').length;
        const scheduledCount = this.currentCheckupsList.filter(c => c.status === 'scheduled').length;
        const progressCount = this.currentCheckupsList.filter(c => c.status === 'in_progress').length;
        const patientsCount = this.currentPatientsList.length;

        document.getElementById('report-completed-count').textContent = completedCount;
        document.getElementById('report-scheduled-count').textContent = scheduledCount;
        document.getElementById('report-progress-count').textContent = progressCount;
        document.getElementById('report-patients-count').textContent = patientsCount;
    }

    displayStatusDistribution() {
        const container = document.getElementById('status-distribution');
        if (!container) return;

        const statusCounts = {
            scheduled: this.currentCheckupsList.filter(c => c.status === 'scheduled').length,
            in_progress: this.currentCheckupsList.filter(c => c.status === 'in_progress').length,
            completed: this.currentCheckupsList.filter(c => c.status === 'completed').length,
            cancelled: this.currentCheckupsList.filter(c => c.status === 'cancelled').length
        };

        const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

        if (total === 0) {
            container.innerHTML = '<div class="no-data-message"><i class="fas fa-chart-pie"></i><p>검진 데이터가 없습니다</p></div>';
            return;
        }

        const statusLabels = {
            completed: '완료',
            scheduled: '예약됨',
            in_progress: '진행중',
            cancelled: '취소됨'
        };

        let html = '';
        for (const [status, count] of Object.entries(statusCounts)) {
            if (count === 0) continue;
            const percentage = Math.round((count / total) * 100);
            html += `
                <div class="chart-bar-container">
                    <div class="chart-bar-label">
                        <span class="chart-bar-label-text">${statusLabels[status]}</span>
                        <span class="chart-bar-label-value">${count}건 (${percentage}%)</span>
                    </div>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill status-${status}" style="width: ${percentage}%">
                            ${percentage}%
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    displayTypeStatistics() {
        const container = document.getElementById('type-statistics');
        if (!container) return;

        // 검진 유형별 집계
        const typeCounts = {};
        this.currentCheckupsList.forEach(checkup => {
            const typeName = checkup.type_name || '미분류';
            typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
        });

        const total = Object.values(typeCounts).reduce((a, b) => a + b, 0);

        if (total === 0) {
            container.innerHTML = '<div class="no-data-message"><i class="fas fa-chart-bar"></i><p>검진 데이터가 없습니다</p></div>';
            return;
        }

        // 내림차순 정렬
        const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

        let html = '';
        for (const [typeName, count] of sortedTypes) {
            const percentage = Math.round((count / total) * 100);
            html += `
                <div class="chart-bar-container">
                    <div class="chart-bar-label">
                        <span class="chart-bar-label-text">${typeName}</span>
                        <span class="chart-bar-label-value">${count}건 (${percentage}%)</span>
                    </div>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width: ${percentage}%">
                            ${percentage}%
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    displayMonthlyTrend() {
        const container = document.getElementById('monthly-trend');
        if (!container) return;

        // 최근 6개월 데이터
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                label: `${date.getMonth() + 1}월`,
                count: 0
            });
        }

        // 월별 검진 수 계산
        this.currentCheckupsList.forEach(checkup => {
            if (!checkup.checkup_date) return;
            const date = new Date(checkup.checkup_date);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;

            const monthData = months.find(m => m.year === year && m.month === month);
            if (monthData) {
                monthData.count++;
            }
        });

        const maxCount = Math.max(...months.map(m => m.count), 1);

        if (maxCount === 0) {
            container.innerHTML = '<div class="no-data-message"><i class="fas fa-chart-line"></i><p>최근 6개월 간 검진 데이터가 없습니다</p></div>';
            return;
        }

        let html = '<div class="chart-line-graph">';
        months.forEach(monthData => {
            const height = (monthData.count / maxCount) * 100;
            html += `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                    <div class="chart-line-bar" style="height: ${height}%">
                        <div class="chart-line-value">${monthData.count}</div>
                    </div>
                    <div class="chart-line-label">${monthData.label}</div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    }

    // ==================== 엑셀 데이터 관리 ====================

    async downloadAllDataToExcel() {
        try {
            this.showLoading(true);

            // IndexedDB에서 모든 데이터 가져오기
            const patients = await this.getAllFromStore(this.stores.patients);
            const checkups = await this.getAllFromStore(this.stores.checkups);
            const checkupTypes = await this.getAllFromStore(this.stores.checkupTypes);
            const checkupItems = await this.getAllFromStore(this.stores.checkupItems);

            console.log('📥 엑셀 다운로드 데이터:', {
                patients: patients.length,
                checkups: checkups.length,
                checkupTypes: checkupTypes.length,
                checkupItems: checkupItems.length
            });

            // 워크북 생성
            const wb = XLSX.utils.book_new();

            // 환자 데이터 시트
            const patientsWS = XLSX.utils.json_to_sheet(patients.map(p => ({
                'ID': p.id,
                '환자번호': p.patient_id,
                '이름': p.name,
                '생년월일': p.birth_date,
                '성별': p.gender,
                '전화번호': p.phone,
                '이메일': p.email,
                '주소': p.address,
                '비상연락처': p.emergency_contact,
                '특이사항': p.notes,
                '등록일': p.created_at,
                '동기화상태': p.sync_status
            })));
            XLSX.utils.book_append_sheet(wb, patientsWS, '환자');

            // 검진 데이터 시트
            const checkupsWS = XLSX.utils.json_to_sheet(checkups.map(c => ({
                'ID': c.id,
                '검진번호': c.checkup_no,
                '환자ID': c.patient_id,
                '환자명': c.patient_name,
                '검진유형ID': c.checkup_type_id,
                '검진유형명': c.type_name,
                '검진날짜': c.checkup_date,
                '검진시간': c.checkup_time,
                '상태': c.status,
                '검진의': c.examiner,
                '메모': c.memo,
                '종합소견': c.conclusion,
                '등록일': c.created_at,
                '동기화상태': c.sync_status
            })));
            XLSX.utils.book_append_sheet(wb, checkupsWS, '검진');

            // 검진유형 데이터 시트
            const checkupTypesWS = XLSX.utils.json_to_sheet(checkupTypes.map(t => ({
                'ID': t.id,
                '유형명': t.type_name,
                '유형코드': t.type_code,
                '설명': t.description,
                '소요시간(분)': t.duration_minutes,
                '등록일': t.created_at
            })));
            XLSX.utils.book_append_sheet(wb, checkupTypesWS, '검진유형');

            // 검진항목 데이터 시트
            const checkupItemsWS = XLSX.utils.json_to_sheet(checkupItems.map(i => ({
                'ID': i.id,
                '검진ID': i.checkup_id,
                '카테고리': i.item_category,
                '항목명': i.item_name,
                '항목값': i.item_value,
                '단위': i.unit,
                '정상범위': i.normal_range,
                '상태': i.status,
                '메모': i.memo,
                '등록일': i.created_at,
                '동기화상태': i.sync_status
            })));
            XLSX.utils.book_append_sheet(wb, checkupItemsWS, '검진항목');

            // 파일 다운로드
            const fileName = `건강검진데이터_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            this.showLoading(false);
            this.showNotification('엑셀 파일이 다운로드되었습니다.', 'success');
            console.log('✅ 엑셀 다운로드 완료:', fileName);
        } catch (error) {
            console.error('❌ 엑셀 다운로드 실패:', error);
            this.showLoading(false);
            this.showNotification('엑셀 다운로드에 실패했습니다.', 'error');
        }
    }

    async uploadDataFromExcel(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.showLoading(true);
            console.log('📤 엑셀 업로드 시작:', file.name);

            // 파일 읽기
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data);

            console.log('📋 엑셀 시트 목록:', wb.SheetNames);

            let importStats = {
                patients: { success: 0, skip: 0, error: 0 },
                checkups: { success: 0, skip: 0, error: 0 },
                checkupTypes: { success: 0, skip: 0, error: 0 },
                checkupItems: { success: 0, skip: 0, error: 0 }
            };

            // 환자 데이터 임포트
            if (wb.SheetNames.includes('환자')) {
                console.log('👥 환자 데이터 임포트 시작...');
                const patientsSheet = wb.Sheets['환자'];
                const patients = XLSX.utils.sheet_to_json(patientsSheet);
                console.log(`   환자 데이터 ${patients.length}개 발견`);

                for (const row of patients) {
                    try {
                        const patient = {
                            id: row['ID'],
                            patient_id: row['환자번호'],
                            name: row['이름'],
                            birth_date: row['생년월일'],
                            gender: row['성별'],
                            phone: row['전화번호'],
                            email: row['이메일'],
                            address: row['주소'],
                            emergency_contact: row['비상연락처'],
                            notes: row['특이사항'],
                            created_at: row['등록일'],
                            sync_status: 'pending'
                        };

                        // 중복 확인
                        const existing = await this.getFromStore(this.stores.patients, patient.id);
                        if (existing) {
                            importStats.patients.skip++;
                        } else {
                            await this.addToStore(this.stores.patients, patient);
                            importStats.patients.success++;
                        }
                    } catch (error) {
                        console.error('   ❌ 환자 데이터 임포트 오류:', error, row);
                        importStats.patients.error++;
                    }
                }
                console.log(`   ✅ 환자: ${importStats.patients.success}개 추가, ${importStats.patients.skip}개 건너뜀, ${importStats.patients.error}개 오류`);
            }

            // 검진유형 데이터 임포트
            if (wb.SheetNames.includes('검진유형')) {
                console.log('📋 검진유형 데이터 임포트 시작...');
                const typesSheet = wb.Sheets['검진유형'];
                const types = XLSX.utils.sheet_to_json(typesSheet);
                console.log(`   검진유형 데이터 ${types.length}개 발견`);

                for (const row of types) {
                    try {
                        const type = {
                            id: row['ID'],
                            type_name: row['유형명'],
                            type_code: row['유형코드'],
                            description: row['설명'],
                            duration_minutes: row['소요시간(분)'],
                            created_at: row['등록일']
                        };

                        const existing = await this.getFromStore(this.stores.checkupTypes, type.id);
                        if (existing) {
                            importStats.checkupTypes.skip++;
                        } else {
                            await this.addToStore(this.stores.checkupTypes, type);
                            importStats.checkupTypes.success++;
                        }
                    } catch (error) {
                        console.error('   ❌ 검진유형 데이터 임포트 오류:', error, row);
                        importStats.checkupTypes.error++;
                    }
                }
                console.log(`   ✅ 검진유형: ${importStats.checkupTypes.success}개 추가, ${importStats.checkupTypes.skip}개 건너뜀, ${importStats.checkupTypes.error}개 오류`);
            }

            // 검진 데이터 임포트
            if (wb.SheetNames.includes('검진')) {
                console.log('🏥 검진 데이터 임포트 시작...');
                const checkupsSheet = wb.Sheets['검진'];
                const checkups = XLSX.utils.sheet_to_json(checkupsSheet);
                console.log(`   검진 데이터 ${checkups.length}개 발견`);

                for (const row of checkups) {
                    try {
                        const checkup = {
                            id: row['ID'],
                            checkup_no: row['검진번호'],
                            patient_id: row['환자ID'],
                            patient_name: row['환자명'],
                            checkup_type_id: row['검진유형ID'],
                            type_name: row['검진유형명'],
                            checkup_date: row['검진날짜'],
                            checkup_time: row['검진시간'],
                            status: row['상태'],
                            examiner: row['검진의'],
                            memo: row['메모'],
                            conclusion: row['종합소견'],
                            created_at: row['등록일'],
                            sync_status: 'pending'
                        };

                        const existing = await this.getFromStore(this.stores.checkups, checkup.id);
                        if (existing) {
                            importStats.checkups.skip++;
                        } else {
                            await this.addToStore(this.stores.checkups, checkup);
                            importStats.checkups.success++;
                        }
                    } catch (error) {
                        console.error('   ❌ 검진 데이터 임포트 오류:', error, row);
                        importStats.checkups.error++;
                    }
                }
                console.log(`   ✅ 검진: ${importStats.checkups.success}개 추가, ${importStats.checkups.skip}개 건너뜀, ${importStats.checkups.error}개 오류`);
            }

            // 검진항목 데이터 임포트
            if (wb.SheetNames.includes('검진항목')) {
                console.log('📝 검진항목 데이터 임포트 시작...');
                const itemsSheet = wb.Sheets['검진항목'];
                const items = XLSX.utils.sheet_to_json(itemsSheet);
                console.log(`   검진항목 데이터 ${items.length}개 발견`);

                for (const row of items) {
                    try {
                        const item = {
                            id: row['ID'],
                            checkup_id: row['검진ID'],
                            item_category: row['카테고리'],
                            item_name: row['항목명'],
                            item_value: row['항목값'],
                            unit: row['단위'],
                            normal_range: row['정상범위'],
                            status: row['상태'],
                            memo: row['메모'],
                            created_at: row['등록일'],
                            sync_status: 'pending'
                        };

                        const existing = await this.getFromStore(this.stores.checkupItems, item.id);
                        if (existing) {
                            importStats.checkupItems.skip++;
                        } else {
                            await this.addToStore(this.stores.checkupItems, item);
                            importStats.checkupItems.success++;
                        }
                    } catch (error) {
                        console.error('   ❌ 검진항목 데이터 임포트 오류:', error, row);
                        importStats.checkupItems.error++;
                    }
                }
                console.log(`   ✅ 검진항목: ${importStats.checkupItems.success}개 추가, ${importStats.checkupItems.skip}개 건너뜀, ${importStats.checkupItems.error}개 오류`);
            }

            // 파일 입력 초기화
            event.target.value = '';

            this.showLoading(false);

            // 결과 메시지
            const message = `
                환자: ${importStats.patients.success}개 추가, ${importStats.patients.skip}개 건너뜀
                검진: ${importStats.checkups.success}개 추가, ${importStats.checkups.skip}개 건너뜀
                검진유형: ${importStats.checkupTypes.success}개 추가, ${importStats.checkupTypes.skip}개 건너뜀
                검진항목: ${importStats.checkupItems.success}개 추가, ${importStats.checkupItems.skip}개 건너뜀
            `;

            console.log('✅ 엑셀 업로드 완료:', importStats);

            // 결과 메시지에 동기화 안내 추가
            const syncNotice = this.isOnline ?
                '\n\n💡 데이터가 로컬에 저장되었습니다.\n서버에 반영하려면 "데이터 동기화" 버튼을 눌러주세요.' :
                '\n\n⚠️ 오프라인 상태입니다. 온라인 시 동기화하세요.';

            this.showNotification('엑셀 데이터를 가져왔습니다.\n' + message + syncNotice, 'success');

            // 현재 화면 새로고침
            if (this.currentSection === 'patients') {
                this.loadPatients();
            } else if (this.currentSection === 'checkups') {
                this.loadCheckups();
            }
        } catch (error) {
            console.error('❌ 엑셀 업로드 실패:', error);
            this.showLoading(false);
            this.showNotification('엑셀 업로드에 실패했습니다: ' + error.message, 'error');
        }
    }

    // IndexedDB 헬퍼 함수
    async getAllFromStore(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getFromStore(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async addToStore(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HealthCheckupApp();
});