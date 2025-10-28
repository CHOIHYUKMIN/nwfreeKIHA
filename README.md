# 🚀 PWA POC - 온라인/오프라인 동작 데모

Service Worker와 IndexedDB를 사용하여 온라인/오프라인 상태에서 동작하는 Progressive Web App(PWA) POC 프로그램입니다.

## ✨ 주요 기능

### 🔌 온라인/오프라인 상태 관리
- 실시간 네트워크 상태 모니터링
- 온라인/오프라인 상태에 따른 UI 변경
- 네트워크 타입 및 효과적 타입 표시

### 💾 IndexedDB 데이터 관리
- 오프라인에서도 데이터 저장/조회 가능
- 데이터 CRUD 작업 (생성, 읽기, 수정, 삭제)
- 타임스탬프와 온라인/오프라인 상태 기록

### ⚡ Service Worker
- 정적 파일 캐싱 (Cache First 전략)
- 동적 콘텐츠 캐싱 (Network First 전략)
- 오프라인 폴백 페이지 제공
- 백그라운드 동기화 지원

### 📱 PWA 기능
- 앱 설치 프롬프트
- 홈 화면 추가 지원
- 오프라인 동작
- 반응형 디자인

## 🛠️ 기술 스택

- **Frontend**: 바닐라 JavaScript (ES6+)
- **PWA**: Service Worker, Web App Manifest
- **클라이언트 DB**: IndexedDB (오프라인 데이터 저장)
- **서버 DB**: MSSQL (영구 데이터 저장, 프로덕션급)
- **백엔드**: Node.js + Express
- **동기화**: 자동/수동 IndexedDB ↔ MSSQL 동기화
- **충돌 해결**: 데이터 충돌 감지 및 해결 시스템
- **스타일링**: CSS3 (Grid, Flexbox, Animations)
- **캐싱**: Cache API

## 📁 프로젝트 구조

```
NWFREEPOC/
├── index.html              # 메인 HTML 파일
├── styles.css              # CSS 스타일
├── app.js                  # 메인 애플리케이션 로직
├── sw-register.js          # Service Worker 등록 및 관리
├── sw.js                   # Service Worker 핵심 로직
├── manifest.json           # PWA Manifest
├── icons/                  # 앱 아이콘들
│   ├── icon-192x192.svg   # 192x192 아이콘
│   └── icon-512x512.svg   # 512x512 아이콘
└── README.md               # 프로젝트 설명서
```

## 🚀 시작하기

### 1. MSSQL 서버 설치 및 설정

#### **MSSQL Server 설치**
1. **SQL Server Express 다운로드**: [Microsoft SQL Server Express](https://www.microsoft.com/ko-kr/sql-server/sql-server-downloads)
2. **설치 시 설정**:
   - 인증 모드: SQL Server 및 Windows 인증 모드
   - SA 계정 비밀번호 설정 (예: `YourPassword123!`)
   - 기본 인스턴스로 설치

#### **데이터베이스 초기화**
```bash
# 의존성 설치
npm install

# MSSQL 데이터베이스 초기화 (테이블 생성 및 샘플 데이터 삽입)
npm run init-mssql

# 서버 실행
npm start
# 또는 개발 모드: npm run dev
```

```bash
# 의존성 설치
npm install

# 데이터베이스 초기화 (테이블 생성 및 샘플 데이터 삽입)
npm run init-db

# 서버 실행
npm start
# 또는 개발 모드: npm run dev
```

서버가 실행되면 `http://localhost:3000`에서 API를 사용할 수 있습니다.

### 2. 클라이언트 실행 (PWA)

별도 터미널에서 PWA 클라이언트를 실행합니다:

```bash
# Python을 사용한 경우
python -m http.server 8000

# Node.js를 사용한 경우
npx http-server -p 8000
```

클라이언트는 `http://localhost:8000`에서 실행됩니다.

### 3. 통합 테스트

서버와 클라이언트가 모두 실행된 상태에서:

1. **온라인 테스트**: `http://localhost:8000`에서 데이터 생성/수정/삭제
2. **오프라인 테스트**: 개발자 도구 → Network → Offline 체크
3. **동기화 테스트**: 온라인 상태로 복귀 시 자동 동기화 확인

## 🧪 IndexedDB + MSSQL 동기화 테스트

### 온라인/오프라인 동작 테스트

1. **온라인 상태에서 데이터 생성**:
   - MSSQL 서버가 실행 중인 상태에서 데이터 입력
   - IndexedDB와 MSSQL에 모두 저장됨
   - 동기화 상태: "synced"

2. **오프라인 상태에서 데이터 생성**:
   - 개발자 도구 → Network → Offline 체크
   - 데이터 입력 시 IndexedDB에만 저장
   - 동기화 상태: "pending"

3. **온라인 복귀 시 자동 동기화**:
   - Network → Offline 체크 해제
   - 30초 내 자동 동기화 또는 수동 동기화 버튼 클릭
   - 오프라인 데이터가 MSSQL에 동기화됨

4. **충돌 감지 및 해결**:
   - IndexedDB와 MSSQL 간 데이터 충돌 자동 감지
   - "충돌 해결" 버튼으로 수동 충돌 해결
   - 충돌 해결 후 동기화 상태 업데이트

### 동기화 상태 모니터링

- **IndexedDB 상태**: 로컬 데이터 개수, 동기화 대기 개수
- **MSSQL 상태**: 서버 데이터 개수, 마지막 동기화 시간
- **충돌 및 오류**: 충돌 개수, 동기화 오류 개수
- **상세 통계**: 온라인/오프라인 데이터 비율, 동기화 완료율

### 고급 테스트 시나리오

1. **대량 데이터 동기화**:
   - 오프라인에서 여러 데이터 생성
   - 온라인 복귀 시 배치 동기화 확인

2. **충돌 해결**:
   - 같은 ID의 데이터를 클라이언트와 서버에서 동시 수정
   - 동기화 시 충돌 자동 감지 및 해결 로직 확인
   - 수동 충돌 해결 옵션 테스트

3. **네트워크 불안정**:
   - 네트워크 상태를 불안정하게 만들고 동기화 재시도 확인

## 🔧 주요 API 및 클래스

### PWAApp 클래스
- IndexedDB 초기화 및 관리
- 온라인/오프라인 상태 모니터링
- 데이터 CRUD 작업
- 알림 시스템

### ServiceWorkerManager 클래스
- Service Worker 등록 및 관리
- Service Worker 이벤트 처리
- 상태 업데이트

### Service Worker (sw.js)
- 캐싱 전략 구현
- 오프라인 폴백 처리
- 백그라운드 동기화

### SyncManager 클래스
- IndexedDB ↔ MSSQL 동기화 관리
- 오프라인 데이터 추적
- 충돌 감지 및 해결
- 자동/수동 동기화 실행

## 📱 PWA 설치 요구사항

- HTTPS 환경 또는 localhost
- 유효한 manifest.json
- Service Worker 등록
- 적절한 아이콘 설정

## 🌐 브라우저 지원

- **Chrome**: 40+ (완전 지원)
- **Firefox**: 44+ (완전 지원)
- **Safari**: 11.1+ (부분 지원)
- **Edge**: 17+ (완전 지원)

## 🔍 디버깅

### Service Worker 디버깅
1. 개발자 도구 → Application 탭
2. Service Workers 섹션에서 상태 확인
3. Console에서 로그 확인

### IndexedDB 디버깅
1. 개발자 도구 → Application 탭
2. Storage → IndexedDB에서 데이터 확인

### 캐시 디버깅
1. 개발자 도구 → Application 탭
2. Storage → Cache Storage에서 캐시 확인

## 📊 성능 최적화

- **정적 파일 캐싱**: CSS, JS, 이미지 파일
- **동적 콘텐츠 캐싱**: API 응답 데이터
- **오프라인 우선**: 네트워크 실패 시 캐시 사용
- **백그라운드 동기화**: 오프라인 데이터 자동 동기화

## 🚨 주의사항

1. **HTTPS 필수**: Service Worker는 HTTPS 환경에서만 작동
2. **브라우저 지원**: 일부 기능은 구형 브라우저에서 지원되지 않음
3. **캐시 관리**: 오래된 캐시는 수동으로 삭제 필요
4. **데이터 동기화**: 실제 서버와의 동기화는 별도 구현 필요

## 🔮 향후 개선 계획

- [ ] 백그라운드 동기화 API 구현
- [ ] 푸시 알림 기능 추가
- [ ] 오프라인 데이터 충돌 해결
- [ ] 성능 모니터링 추가
- [ ] 다국어 지원

## 📄 라이선스

이 프로젝트는 교육 및 학습 목적으로 제작되었습니다.

## 🤝 기여하기

버그 리포트, 기능 제안, 코드 개선 등 모든 기여를 환영합니다!

---

**PWA POC** - Service Worker + IndexedDB 데모 프로그램
