# 건강검진 시스템 - 기술 스택 및 아키텍처

**프로젝트명**: 건강검진 관리 시스템 (NWFREEPILOT)
**현재 버전**: v3.1
**작성일**: 2025-10-29

---

## 📋 목차

1. [기술 스택 개요](#기술-스택-개요)
2. [프론트엔드 기술](#프론트엔드-기술)
3. [백엔드 기술](#백엔드-기술)
4. [데이터 저장 및 동기화](#데이터-저장-및-동기화)
5. [오프라인 기능](#오프라인-기능)
6. [캐싱 전략](#캐싱-전략)
7. [보안 및 성능](#보안-및-성능)
8. [배포 및 운영](#배포-및-운영)

---

## 🎯 기술 스택 개요

### 핵심 기술

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 인터페이스                          │
│          HTML5 + CSS3 + Vanilla JavaScript (ES6+)            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    PWA (Progressive Web App)                 │
│              Service Worker + Cache API + Manifest          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────┬──────────────────────┬───────────────┐
│   로컬 저장소        │          백엔드 API  │
│   IndexedDB          │           Express.js  │
│   localStorage       │     REST API    │
└──────────────────────┴──────────────────────┴───────────────┘
                              ↓
                    ┌─────────────────────┐
                    │   데이터베이스      │
                    │   MSSQL Server      │
                    └─────────────────────┘
```

### 기술 선택 이유

| 기술 | 선택 이유 |
|------|-----------|
| **Vanilla JavaScript** | 프레임워크 의존성 제거, 가벼운 번들 크기, 빠른 로딩 |
| **PWA** | 오프라인 지원, 앱처럼 동작, 설치 가능 |
| **IndexedDB** | 대용량 데이터 저장, 구조화된 데이터, 트랜잭션 지원 |
| **MSSQL** | 엔터프라이즈급 안정성, 트랜잭션 무결성, 복잡한 쿼리 지원 |

---

## 💻 프론트엔드 기술

### 1. HTML5 & CSS3

#### 시맨틱 HTML
```html
<header>, <nav>, <main>, <section>, <article>, <footer>
```
- 접근성 향상
- SEO 최적화
- 구조적 마크업

#### 모던 CSS 기능
```css
/* CSS Grid & Flexbox */
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));

/* CSS Variables (Custom Properties) */
:root {
  --primary-color: #4f46e5;
  --success-color: #10b981;
}

/* Media Queries (반응형) */
@media (max-width: 768px) { ... }
```

#### Font Awesome Icons
- 아이콘 라이브러리: Font Awesome 6.0.0
- CDN 방식 로드
- 600+ 아이콘 사용

### 2. JavaScript (ES6+)

#### 클래스 기반 아키텍처
```javascript
class HealthCheckupApp {
    constructor() {
        this.VERSION = '3.1';
        this.db = null;
        this.isOnline = false;
    }

    async init() { ... }
    async syncData() { ... }
}
```

**장점**:
- 코드 구조화 및 재사용성
- OOP 패러다임 적용
- 명확한 책임 분리

#### 비동기 처리 (async/await)
```javascript
// Promise 체이닝 대신 async/await 사용
async function loadPatients() {
    try {
        const response = await fetch('/api/patients');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('환자 로드 실패:', error);
    }
}
```

#### 모듈화된 기능
- **app.js**: 메인 애플리케이션 로직 (4900+ 줄)
- **sw-register.js**: Service Worker 관리
- **p2p-transfer.js**: WebRTC P2P 통신
- **p2p-ui-handler.js**: P2P UI 핸들러

### 3. Progressive Web App (PWA)

#### Manifest.json
```json
{
  "name": "건강검진 시스템",
  "short_name": "건강검진",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#4f46e5",
  "theme_color": "#4f46e5",
  "orientation": "any",
  "icons": [...]
}
```

**PWA 기능**:
- ✅ 설치 가능 (Add to Home Screen)
- ✅ 오프라인 동작
- ✅ 푸시 알림 (선택적)
- ✅ 백그라운드 동기화
- ✅ 앱처럼 동작 (standalone 모드)

#### Service Worker 생명주기
```javascript
// 1. 설치 (Install)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => cache.addAll(STATIC_FILES))
    );
});

// 2. 활성화 (Activate)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            )
        )
    );
});

// 3. 요청 가로채기 (Fetch)
self.addEventListener('fetch', (event) => {
    event.respondWith(networkFirstStrategy(request));
});
```

---

## 🔧 백엔드 기술

### 1. Node.js + Express.js

#### 서버 구조
```javascript
const express = require('express');
const app = express();

// 미들웨어
app.use(express.json());
app.use(express.static('./'));
app.use(cors());

// REST API 엔드포인트
app.get('/api/patients', getPatients);
app.post('/api/patients', createPatient);
app.put('/api/patients/:id', updatePatient);
app.delete('/api/patients/:id', deletePatient);

// 헬스 체크
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});
```

#### 주요 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/patients` | 모든 환자 조회 |
| GET | `/api/patients/:id` | 특정 환자 조회 |
| POST | `/api/patients` | 환자 등록 |
| PUT | `/api/patients/:id` | 환자 수정 |
| DELETE | `/api/patients/:id` | 환자 삭제 |
| GET | `/api/checkups` | 모든 검진 조회 |
| POST | `/api/checkups` | 검진 예약 |
| GET | `/api/checkup-types` | 검진 유형 조회 |
| GET | `/api/health` | 서버 상태 확인 |

### 2. MSSQL Server 데이터베이스

#### 연결 설정 (mssql-config.js)
```javascript
const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'PWAPOC',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

module.exports = async function getConnection() {
    return await sql.connect(config);
};
```

#### 데이터베이스 스키마

**patients (환자)**
```sql
CREATE TABLE patients (
    id INT IDENTITY(1,1) PRIMARY KEY,
    patient_id VARCHAR(50) UNIQUE NOT NULL,
    name NVARCHAR(100) NOT NULL,
    birth_date DATE,
    gender CHAR(1),
    phone VARCHAR(20),
    email VARCHAR(100),
    address NVARCHAR(200),
    emergency_contact NVARCHAR(100),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
```

**checkups (검진)**
```sql
CREATE TABLE checkups (
    id INT IDENTITY(1,1) PRIMARY KEY,
    checkup_no VARCHAR(50) UNIQUE NOT NULL,
    patient_id INT FOREIGN KEY REFERENCES patients(id),
    checkup_type_id INT FOREIGN KEY REFERENCES checkup_types(id),
    checkup_date DATETIME NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled',
    doctor_name NVARCHAR(100),
    notes NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
```

**checkup_types (검진 유형)**
```sql
CREATE TABLE checkup_types (
    id INT IDENTITY(1,1) PRIMARY KEY,
    type_name NVARCHAR(100) NOT NULL,
    type_code VARCHAR(20) UNIQUE NOT NULL,
    description NVARCHAR(500),
    duration_minutes INT,
    price DECIMAL(10,2),
    is_active BIT DEFAULT 1
);
```

**checkup_items (검진 항목)**
```sql
CREATE TABLE checkup_items (
    id INT IDENTITY(1,1) PRIMARY KEY,
    checkup_id INT FOREIGN KEY REFERENCES checkups(id) ON DELETE CASCADE,
    item_category NVARCHAR(50),
    item_name NVARCHAR(100),
    item_value NVARCHAR(200),
    reference_range NVARCHAR(100),
    unit NVARCHAR(20),
    status VARCHAR(20),
    notes NVARCHAR(500),
    measured_at DATETIME
);
```

#### SQL Injection 방지
```javascript
// ❌ 취약한 코드
const query = `SELECT * FROM patients WHERE name = '${name}'`;

// ✅ 안전한 코드 (Parameterized Query)
const request = pool.request();
request.input('name', sql.NVarChar, name);
const result = await request.query(
    'SELECT * FROM patients WHERE name = @name'
);
```

---

## 💾 데이터 저장 및 동기화

### 1. IndexedDB (클라이언트 저장소)

#### 데이터베이스 구조
```javascript
const dbVersion = 6;
const stores = {
    patients: 'patients',
    checkups: 'checkups',
    checkupTypes: 'checkupTypes',
    checkupItems: 'checkupItems',
    offlineRequests: 'offlineRequests'
};
```

#### 스키마 정의
```javascript
// patients 스토어
objectStore = db.createObjectStore('patients', { keyPath: 'id' });
objectStore.createIndex('patient_id', 'patient_id', { unique: true });
objectStore.createIndex('name', 'name', { unique: false });
objectStore.createIndex('sync_status', 'sync_status', { unique: false });

// checkups 스토어
objectStore = db.createObjectStore('checkups', { keyPath: 'id' });
objectStore.createIndex('checkup_no', 'checkup_no', { unique: true });
objectStore.createIndex('patient_id', 'patient_id', { unique: false });
objectStore.createIndex('checkup_date', 'checkup_date', { unique: false });
objectStore.createIndex('sync_status', 'sync_status', { unique: false });
```

#### CRUD 작업
```javascript
// Create
async saveToIndexedDB(storeName, data) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Read
async getFromIndexedDB(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Update - put()과 동일

// Delete
async deleteFromIndexedDB(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
```

### 2. 양방향 동기화 시스템

#### 동기화 플로우
```
온라인 복귀 시:
1. 로컬 → 서버 (오프라인 데이터 업로드)
   ├─ pending 상태 데이터 수집
   ├─ 서버로 POST 요청
   ├─ 임시 ID → 실제 ID 매핑
   └─ sync_status: 'synced' 업데이트

2. 서버 → 로컬 (전체 데이터 다운로드)
   ├─ 환자 데이터 동기화
   ├─ 검진 유형 동기화
   ├─ 검진 데이터 동기화
   └─ 검진 항목 동기화

3. 동기화 완료 시간 업데이트
```

#### 임시 ID 시스템
```javascript
// 오프라인 환자 등록 시 임시 ID 생성
const tempPatientId = `temp_patient_${Date.now()}_${Math.random()}`;

// 서버 동기화 시 실제 ID로 변환
const response = await fetch('/api/patients', {
    method: 'POST',
    body: JSON.stringify(tempPatient)
});

const { patient: realPatient } = await response.json();

// IndexedDB 업데이트: 임시 → 실제
await this.deleteFromIndexedDB('patients', tempPatientId);
await this.saveToIndexedDB('patients', {
    ...realPatient,
    sync_status: 'synced'
});
```

#### 동기화 상태 관리
```javascript
sync_status: 'pending'         // 동기화 대기
sync_status: 'synced'          // 동기화 완료
sync_status: 'pending_delete'  // 삭제 예약
sync_status: 'error'           // 동기화 실패
```

### 3. 주기적 동기화

```javascript
// 5분(300초)마다 자동 동기화
startPeriodicSync() {
    this.syncInterval = setInterval(async () => {
        if (this.isOnline && this.autoSyncEnabled) {
            console.log('🔄 주기적 동기화 시작...');

            // 1. 오프라인 데이터 업로드
            await this.syncOfflineRequests();

            // 2. 서버 데이터 다운로드
            await this.performFullDataSync();

            console.log('✅ 주기적 동기화 완료');
        }
    }, this.syncIntervalSeconds * 1000);
}
```

---

## 📴 오프라인 기능

### 1. 오프라인 감지

```javascript
// 네트워크 상태 감지
window.addEventListener('online', async () => {
    this.isOnline = await this.checkServerConnection();
    this.updateConnectionStatus();

    if (this.autoSyncEnabled) {
        // 자동 동기화
        await this.syncOfflineRequests();
        await this.performFullDataSync();
    }
});

window.addEventListener('offline', () => {
    this.isOnline = false;
    this.updateConnectionStatus();
    this.showNotification('오프라인 모드입니다.', 'warning');
});
```

### 2. 실제 서버 연결 확인

```javascript
async checkServerConnection() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(this.apiBaseUrl + '/health', {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-cache'
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            console.log('✅ 서버 연결 정상');
            return true;
        }
        return false;
    } catch (error) {
        console.log('❌ 서버 연결 실패:', error.message);
        return false;
    }
}
```

### 3. 오프라인 데이터 작업

#### 환자 등록 (오프라인)
```javascript
async registerPatient(patientData) {
    if (this.isOnline) {
        // 온라인: 서버로 직접 전송
        const response = await fetch('/api/patients', {
            method: 'POST',
            body: JSON.stringify(patientData)
        });
        const result = await response.json();

        // IndexedDB에도 저장 (캐싱)
        await this.saveToIndexedDB('patients', {
            ...result.patient,
            sync_status: 'synced'
        });
    } else {
        // 오프라인: 임시 ID로 로컬 저장
        const tempPatient = {
            ...patientData,
            id: `temp_patient_${Date.now()}`,
            sync_status: 'pending',
            created_at: new Date().toISOString()
        };

        await this.saveToIndexedDB('patients', tempPatient);
        this.showNotification('오프라인 모드: 온라인 복귀 시 동기화됩니다.', 'info');
    }
}
```

---

## 🔄 P2P 데이터 전송

### 1. WebRTC 기술

#### 개요
- **용도**: 인터넷 없이 기기 간 직접 데이터 전송
- **프로토콜**: WebRTC DataChannel
- **연결 방식**: QR 코드 기반 Offer/Answer 교환

#### 아키텍처
```
송신자 (Sender)                         수신자 (Receiver)
    │                                          │
    ├─ 1. Offer 생성                           │
    ├─ 2. Offer QR 코드 생성                   │
    │                                          │
    │  ◄────── Offer QR 스캔 ──────────────────┤
    │                                          │
    │                                   3. Answer 생성
    │                                   4. Answer QR 코드 생성
    │                                          │
    ├────────── Answer QR 스캔 ───────────────►│
    │                                          │
    ├─ 5. P2P 연결 완료                        │
    ├─ 6. 데이터 전송 (청크 단위)               │
    │  ────────────────────────────────────────►│
    │                                   7. 데이터 수신 및 병합
    │                                   8. IndexedDB 저장
```

### 2. WebRTC DataChannel

#### RTCPeerConnection 설정
```javascript
class P2PTransferManager {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    async createOffer() {
        this.peerConnection = new RTCPeerConnection(this.config);

        // DataChannel 생성
        this.dataChannel = this.peerConnection.createDataChannel('healthData', {
            ordered: true,
            maxRetransmits: 3
        });

        this.setupDataChannelHandlers();

        // Offer 생성
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        // ICE Candidate 수집 대기
        await this.waitForICEGathering();

        return this.peerConnection.localDescription;
    }
}
```

#### DataChannel 이벤트 핸들링
```javascript
setupDataChannelHandlers() {
    this.dataChannel.onopen = () => {
        console.log('✅ DataChannel 연결됨');
        this.onConnectionStateChange('connected');

        // 연결되면 데이터 전송 시작
        if (this.isSender) {
            this.sendData();
        }
    };

    this.dataChannel.onmessage = (event) => {
        console.log('📥 데이터 수신:', event.data.length, 'bytes');
        this.receiveChunk(event.data);
    };

    this.dataChannel.onerror = (error) => {
        console.error('❌ DataChannel 오류:', error);
        this.onError(error);
    };

    this.dataChannel.onclose = () => {
        console.log('🔌 DataChannel 닫힘');
        this.cleanup();
    };
}
```

### 3. 청크 단위 전송

```javascript
async sendData() {
    // 전체 데이터 수집
    const allData = {
        patients: await app.getAllFromStore('patients'),
        checkups: await app.getAllFromStore('checkups'),
        checkupTypes: await app.getAllFromStore('checkupTypes'),
        checkupItems: await app.getAllFromStore('checkupItems')
    };

    const dataString = JSON.stringify(allData);
    const totalSize = dataString.length;
    const chunkSize = 16 * 1024; // 16KB 청크
    const totalChunks = Math.ceil(totalSize / chunkSize);

    console.log(`📦 총 ${totalChunks}개 청크 전송 시작 (${totalSize} bytes)`);

    // 청크 단위로 전송
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, totalSize);
        const chunk = dataString.substring(start, end);

        const message = {
            type: i === totalChunks - 1 ? 'final' : 'chunk',
            index: i,
            total: totalChunks,
            data: chunk
        };

        this.dataChannel.send(JSON.stringify(message));

        // 진행률 업데이트
        this.updateProgress((i + 1) / totalChunks * 100);

        // 버퍼 오버플로우 방지
        await this.waitForBufferSpace();
    }

    console.log('✅ 모든 청크 전송 완료');
}
```

### 4. 데이터 수신 및 병합

```javascript
receiveChunk(message) {
    const { type, index, total, data } = JSON.parse(message);

    // 청크 저장
    this.receivedChunks[index] = data;
    this.receivedCount++;

    // 진행률 업데이트
    this.updateProgress(this.receivedCount / total * 100);

    // 모든 청크 수신 완료
    if (type === 'final') {
        console.log('✅ 모든 청크 수신 완료');
        this.mergeAndSaveData();
    }
}

async mergeAndSaveData() {
    // 청크 병합
    const fullData = this.receivedChunks.join('');
    const parsedData = JSON.parse(fullData);

    // IndexedDB에 저장 (중복 ID 처리)
    let addedCount = 0;
    let skippedCount = 0;

    for (const patient of parsedData.patients) {
        const exists = await app.getFromStore('patients', patient.id);
        if (!exists) {
            await app.addToStore('patients', patient);
            addedCount++;
        } else {
            skippedCount++;
        }
    }

    console.log(`✅ 저장 완료: ${addedCount}개 추가, ${skippedCount}개 건너뜀`);
    this.onTransferComplete();
}
```

### 5. QR 코드 기반 연결

```javascript
// QR 코드 생성 (송신자)
generateQRCode(offerSDP) {
    const qrContainer = document.getElementById('qr-container');

    new QRCode(qrContainer, {
        text: JSON.stringify(offerSDP),
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

// QR 코드 스캔 (수신자)
async scanQRCode() {
    const html5QrCode = new Html5Qrcode('qr-reader');

    await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
            const offerSDP = JSON.parse(decodedText);
            await this.handleReceivedOffer(offerSDP);
            html5QrCode.stop();
        }
    );
}
```

---

## 🗄️ 캐싱 전략

### 1. Service Worker 캐싱

#### 캐시 레벨
```javascript
const CACHE_NAME = 'pwa-poc-v19';
const STATIC_CACHE_NAME = 'pwa-poc-static-v19';   // 정적 파일
const DYNAMIC_CACHE_NAME = 'pwa-poc-dynamic-v19'; // 동적 리소스
```

#### 캐시 우선 전략 (Cache First)
```javascript
// 정적 파일: CSS, JS, 이미지
async function cacheFirstStrategy(request) {
    // 1. 캐시에서 찾기
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    // 2. 캐시에 없으면 네트워크
    const networkResponse = await fetch(request);

    // 3. 네트워크 응답을 캐시에 저장
    if (networkResponse.ok) {
        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        cache.put(request, networkResponse.clone());
    }

    return networkResponse;
}
```

#### 네트워크 우선 전략 (Network First)
```javascript
// HTML 페이지, API 외 리소스
async function networkFirstStrategy(request) {
    try {
        // 1. 네트워크 시도
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // 2. 성공 시 캐시에 저장
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // 3. 네트워크 실패 시 캐시 폴백
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // 4. 캐시도 없으면 오프라인 페이지
        return getOfflineFallback();
    }
}
```

#### API 요청 처리
```javascript
// API는 캐싱하지 않음 (실시간 데이터)
if (request.url.includes('/api/')) {
    // 캐싱 없이 네트워크로만 전달
    return;
}
```

### 2. IndexedDB 캐싱

#### 서버 데이터 캐싱
```javascript
async loadPatients() {
    if (this.isOnline) {
        // 1. 서버에서 가져오기
        const response = await fetch('/api/patients');
        const result = await response.json();

        // 2. IndexedDB에 캐시 저장
        await this.replaceAllData('patients', result.data);

        return result.data;
    } else {
        // 3. 오프라인: IndexedDB에서 로드
        return await this.getAllFromStore('patients');
    }
}
```

#### 캐시 업데이트 전략
```javascript
async replaceAllData(storeName, newData) {
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    // 1. 기존 데이터 모두 삭제
    await store.clear();

    // 2. 새 데이터 일괄 저장
    for (const item of newData) {
        await store.put(item);
    }

    console.log(`✅ ${storeName}: ${newData.length}개 캐시 업데이트`);
}
```

---

## 🔐 보안 및 성능

### 1. 보안

#### SQL Injection 방지
```javascript
// ✅ Parameterized Query 사용
const request = pool.request();
request.input('id', sql.Int, patientId);
request.input('name', sql.NVarChar, patientName);
const result = await request.query(`
    SELECT * FROM patients
    WHERE id = @id AND name = @name
`);
```

#### XSS (Cross-Site Scripting) 방지
```javascript
// HTML 이스케이프 처리
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// 사용 예
patientCard.innerHTML = `
    <h3>${escapeHtml(patient.name)}</h3>
    <p>${escapeHtml(patient.phone)}</p>
`;
```

#### 환경 변수 보안
```javascript
// .env 파일 (Git에 커밋 안됨)
DB_PASSWORD=your_secure_password
DB_SERVER=localhost
DB_DATABASE=PWAPOC
```

### 2. 성능 최적화

#### 지연 로딩 (Lazy Loading)
```javascript
// 초기 로드 시 필요한 데이터만
async init() {
    await this.initIndexedDB();
    this.loadDashboard();  // 대시보드만 로드
}

// 섹션 전환 시 로드
showSection(sectionName) {
    if (sectionName === 'patients') {
        this.loadPatients();  // 환자 섹션 진입 시 로드
    }
}
```

#### 인덱스 활용
```javascript
// IndexedDB 인덱스로 빠른 검색
async searchPatientsByName(name) {
    const transaction = this.db.transaction(['patients'], 'readonly');
    const store = transaction.objectStore('patients');
    const index = store.index('name');  // name 인덱스 사용

    const range = IDBKeyRange.bound(
        name.toLowerCase(),
        name.toLowerCase() + '\uffff'
    );

    return await index.getAll(range);
}
```

#### 디바운싱 (Debouncing)
```javascript
// 검색 입력 디바운싱
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        this.searchPatients(e.target.value);
    }, 300);  // 300ms 대기
});
```

#### 트랜잭션 최적화
```javascript
// ❌ 느린 방법: 개별 트랜잭션
for (const patient of patients) {
    await this.saveToIndexedDB('patients', patient);
}

// ✅ 빠른 방법: 단일 트랜잭션
const transaction = this.db.transaction(['patients'], 'readwrite');
const store = transaction.objectStore('patients');

for (const patient of patients) {
    store.put(patient);
}

await transaction.complete;
```

### 3. 에러 처리

#### 중앙 집중식 에러 핸들링
```javascript
async fetchAPI(endpoint, options = {}) {
    try {
        const response = await fetch(this.apiBaseUrl + endpoint, {
            timeout: 10000,
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API 요청 실패:', error);

        // 네트워크 오류 시 오프라인 모드
        if (error.message.includes('Failed to fetch')) {
            this.isOnline = false;
            this.updateConnectionStatus();
        }

        // 오프라인 큐에 저장
        if (options.method === 'POST' || options.method === 'PUT') {
            await this.saveOfflineRequest(endpoint, options);
        }

        throw error;
    }
}
```

#### 사용자 친화적 알림
```javascript
showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${iconMap[type]}"></i>
        <span>${message}</span>
    `;

    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}
```

---

## 🚀 배포 및 운영

### 1. 로컬 개발 환경

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 데이터베이스 초기화
npm run init-health-checkup

# 개발 서버 실행 (nodemon)
npm run dev

# 공개 URL 터널 (외부 접근)
npm run tunnel
```

### 2. 프로덕션 배포

#### HTTPS 설정 (필수)
```javascript
// Service Worker는 HTTPS 필수 (localhost 제외)
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('./ssl/private-key.pem'),
    cert: fs.readFileSync('./ssl/certificate.pem')
};

https.createServer(options, app).listen(443, () => {
    console.log('HTTPS 서버 실행: https://yourdomain.com');
});
```

#### 버전 관리
```javascript
// 메이저.마이너 버전 관리
this.VERSION = '3.1';
this.VERSION_DATE = '2025-10-29 19:00:00';

// Service Worker 캐시 버전
const CACHE_NAME = 'pwa-poc-v19';
```

### 3. 모니터링

#### 로그 관리
```javascript
// 콘솔 로그 레벨
console.log('ℹ️ 정보');
console.warn('⚠️ 경고');
console.error('❌ 오류');

// 프로덕션에서는 로그 수집 서비스 연동 가능
// - Sentry
// - LogRocket
// - New Relic
```

#### Service Worker 업데이트 알림
```javascript
// 새 버전 감지 시 사용자에게 알림
this.swRegistration.addEventListener('updatefound', () => {
    const newWorker = this.swRegistration.installing;

    newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' &&
            navigator.serviceWorker.controller) {
            // 업데이트 배너 표시
            this.showUpdateNotification();
        }
    });
});
```

---

## 📊 엑셀 연동

### SheetJS (xlsx) 라이브러리

#### 데이터 내보내기
```javascript
async downloadAllDataToExcel() {
    // 1. 모든 데이터 수집
    const allData = {
        patients: await this.getAllFromStore('patients'),
        checkups: await this.getAllFromStore('checkups'),
        checkupTypes: await this.getAllFromStore('checkupTypes'),
        checkupItems: await this.getAllFromStore('checkupItems')
    };

    // 2. 워크북 생성
    const wb = XLSX.utils.book_new();

    // 3. 각 데이터를 시트로 추가
    const ws_patients = XLSX.utils.json_to_sheet(allData.patients);
    XLSX.utils.book_append_sheet(wb, ws_patients, '환자');

    const ws_checkups = XLSX.utils.json_to_sheet(allData.checkups);
    XLSX.utils.book_append_sheet(wb, ws_checkups, '검진');

    // 4. 엑셀 파일 다운로드
    const filename = `건강검진_전체데이터_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
}
```

#### 데이터 가져오기
```javascript
async uploadDataFromExcel(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        // 1. 엑셀 파일 읽기
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // 2. 각 시트에서 데이터 추출
        const ws_patients = wb.Sheets['환자'];
        const patients = XLSX.utils.sheet_to_json(ws_patients);

        // 3. IndexedDB에 저장
        for (const patient of patients) {
            const exists = await this.getFromStore('patients', patient.id);

            if (!exists) {
                await this.addToStore('patients', {
                    ...patient,
                    sync_status: 'pending'
                });
            }
        }

        this.showNotification('엑셀 데이터를 가져왔습니다.', 'success');
    };

    reader.readAsArrayBuffer(file);
}
```

---

## 🎨 UI/UX 기술

### 반응형 디자인
```css
/* 모바일 우선 접근 */
.stats-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
}

/* 태블릿 */
@media (min-width: 768px) {
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

/* 데스크톱 */
@media (min-width: 1024px) {
    .stats-grid {
        grid-template-columns: repeat(4, 1fr);
    }
}
```

### 다크 모드 지원 (선택적)
```css
@media (prefers-color-scheme: dark) {
    :root {
        --bg-color: #1a1a1a;
        --text-color: #ffffff;
        --card-bg: #2d2d2d;
    }
}
```

### 로딩 상태 표시
```javascript
showLoading(show, message = '처리 중...') {
    const loading = document.getElementById('loading');
    if (show) {
        loading.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <p>${message}</p>
        `;
        loading.style.display = 'flex';
    } else {
        loading.style.display = 'none';
    }
}
```

---

## 📝 개발 도구 및 환경

### NPM Scripts
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "frontend": "http-server -p 8000",
    "dev:full": "concurrently \"npm run dev\" \"npm run frontend\"",
    "tunnel": "lt --port 3000 --subdomain nwfreepilot",
    "init-mssql": "node init-mssql.js",
    "init-health-checkup": "node init-health-checkup.js"
  }
}
```

### 의존성
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mssql": "^10.0.1",
    "cors": "^2.8.5",
    "dotenv": "^17.2.3",
    "body-parser": "^1.20.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "concurrently": "^9.2.0",
    "http-server": "^14.1.1",
    "localtunnel": "latest"
  }
}
```

---

## 🔍 주요 기술 결정 이유

| 기술 | 이유 |
|------|------|
| **Vanilla JS** | 프레임워크 오버헤드 제거, 빠른 로딩, 완전한 제어 |
| **IndexedDB** | 대용량 데이터 저장, 트랜잭션, 인덱스 지원 |
| **Service Worker** | 오프라인 지원, 백그라운드 동기화, 푸시 알림 |
| **WebRTC** | 서버 없는 P2P 통신, 오프라인 데이터 전송 |
| **MSSQL** | 엔터프라이즈급 안정성, 병원 시스템 호환성 |
| **Express** | 경량, 유연, 빠른 개발 |

---

## 📚 참고 자료

### 공식 문서
- [MDN Web Docs - PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

### 라이브러리
- [SheetJS (xlsx)](https://docs.sheetjs.com/)
- [Font Awesome](https://fontawesome.com/docs)
- [QRCode.js](https://github.com/davidshimjs/qrcodejs)
- [Html5-qrcode](https://github.com/mebjas/html5-qrcode)

---

**문서 버전**: 1.0
**최종 수정일**: 2025-10-29
**작성자**: Claude Code (v3.1)
