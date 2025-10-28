# CLAUDE.md - NWFREEPILOT 프로젝트 설정

## 🏥 프로젝트 개요

**건강검진 관리 시스템** - PWA 기반의 오프라인 지원 건강검진 관리 시스템입니다.

**현재 버전**: v2.5 (2025-10-27 17:10:00)

### 주요 기능
- 환자 관리 (등록, 조회, 수정, 삭제)
- 검진 예약 및 관리
- 검진 항목 기록 및 결과 관리
- 검진 일정 관리 및 대시보드
- **엑셀 데이터 내보내기/가져오기** (v2.4)
- **공개 URL 터널 지원** (v2.4)
- **실제 서버 상태 기반 온라인/오프라인 표시** ⭐ NEW (v2.5)
- **정확한 동기화 완료 시점 표시** ⭐ NEW (v2.5)
- 오프라인 모드 지원 (IndexedDB)
- **오프라인 전체 데이터 동기화** (v2.0)
- **자동/수동 동기화 선택 가능** (v1.3)
- **오프라인 대시보드 지원** (v1.2)
- 실시간 동기화 (온라인 복귀 시 자동 동기화)
- PWA 기능 (설치 가능, 오프라인 작동)
- 버전 관리 시스템 (major.minor)

### 최근 주요 변경사항 (v1.0 → v2.5)

#### v2.5 (2025-10-27 17:10) - 🎯 서버 상태 정확도 개선
- ✅ **실제 서버 연결 상태 확인**: 초기 로드 시 실제 서버 API 호출로 온라인/오프라인 상태 확인
- ✅ **정확한 동기화 완료 시점**: 서버와 실제 동기화가 성공했을 때만 "동기화 완료" 및 시간 표시
- ✅ **동기화 성공 여부 추적**: 각 동기화 메서드가 성공/실패 여부 반환
- ✅ **주기적 서버 상태 확인**: 30초마다 실제 서버 연결 상태 확인 (기존 기능 유지)
- ✅ 서버가 내려가 있으면 오프라인으로 정확히 표시
- ✅ **태블릿 가로/세로 모드 지원**: manifest.json orientation을 "any"로 변경하여 모든 방향 지원
- ✅ **Service Worker 캐시 v7**: manifest.json 변경사항 반영을 위한 캐시 업데이트

#### v2.4 (2025-10-27 13:10) - 🎉 엑셀 연동 & 공개 URL
- ✅ **엑셀 데이터 내보내기**: 모든 데이터를 엑셀 파일로 다운로드 (오프라인 임시 데이터 포함)
- ✅ **엑셀 데이터 가져오기**: 엑셀 파일에서 데이터 일괄 임포트 (중복 ID 자동 건너뜀)
- ✅ **공개 URL 터널**: localtunnel을 이용한 외부 접근 가능한 URL 생성
- ✅ **삭제 버그 수정**: 온라인 상태에서 환자/검진 삭제 시 오프라인 모드로 잘못 전환되던 문제 해결
- ✅ **캘린더 날짜 표시 수정**: 날짜 클릭 시 "1970-" 표시되던 버그 수정
- ✅ IndexedDB 헬퍼 함수 추가 (getAllFromStore, getFromStore, addToStore)

#### v2.3 (2025-10-27)
- ✅ 검진 일정 캘린더 뷰
- ✅ 검진 리포트 및 통계 차트
- ✅ 반응형 대시보드 개선

#### v2.0 (2025-10-22 13:17) - 🔥 중요 버그 수정
- ✅ **오프라인 동기화 버그 수정**: 검진 및 검진 항목 동기화 오류 해결
- ✅ **임시 환자 ID → 정식 환자 ID 변환 로직 수정**: 숫자 ID로 올바르게 변환
- ✅ 오프라인에서 등록한 환자, 검진, 검진 항목이 모두 정상 동기화됨
- ✅ 온라인 복귀 시 전체 데이터 자동 동기화 (환자 → 검진 → 검진 항목)

#### v1.3 (2025-10-02 14:00)
- ✅ 자동 동기화 ON/OFF 설정 기능
- ✅ localStorage 기반 설정 영구 저장
- ✅ 온라인 전환 시 설정에 따른 동작 분기

#### v1.2 (2025-10-02 13:50)
- ✅ 오프라인 검진 예약 시 환자명/검진유형명 표시 개선
- ✅ 오프라인 대시보드 지원 (IndexedDB 기반 통계)
- ✅ IndexedDB 버전 충돌 자동 처리

#### v1.1 (2025-10-02 13:40)
- ✅ Major.Minor 버전 관리 시스템 구축
- ✅ 화면에 버전 정보 및 소스 적용일시 표시

#### v1.0 (초기)
- ✅ 오프라인 환자 등록 (임시 ID 시스템)
- ✅ 오프라인 검진 유형 캐싱
- ✅ IndexedDB 스키마 v5 업그레이드
- ✅ sync_status 인덱스 추가

**📚 자세한 변경사항**: [VERSION-HISTORY.md](./VERSION-HISTORY.md) 참조

## 🚀 빌드 및 실행 명령어

### 1단계: 의존성 설치
```bash
npm install
```

### 2단계: 환경 변수 설정
```bash
# .env 파일을 생성하고 데이터베이스 연결 정보를 입력
cp .env.example .env
# .env 파일을 편집하여 DB_PASSWORD와 기타 설정을 입력
```

**중요**: `.env` 파일에 실제 데이터베이스 비밀번호를 입력해야 합니다.

### 3단계: 데이터베이스 초기화
```bash
# MSSQL 데이터베이스 초기화 (건강검진 시스템)
npm run init-health-checkup

# 기존 user_data 테이블 초기화 (선택사항)
npm run init-mssql

# SQLite 데이터베이스 초기화 (대안, 선택사항)
npm run init-sqlite
```

### 4단계: 서버 실행 ⭐ 권장

**권장 방법: 개발 서버와 터널을 동시에 실행**
```bash
# 터미널 1: 개발 서버 실행
npm run dev

# 터미널 2 (새 터미널): 공개 URL 터널 실행
npm run tunnel
```

**또는 백그라운드로 동시 실행**
```bash
# Windows PowerShell
Start-Process npm -ArgumentList "run","dev" -NoNewWindow
Start-Process npm -ArgumentList "run","tunnel" -NoNewWindow

# Windows CMD (각각 새 창에서 실행)
start cmd /k npm run dev
start cmd /k npm run tunnel
```

**개별 실행 옵션**
```bash
# 프로덕션 모드
npm start

# 개발 모드 (nodemon 사용 - 자동 재시작)
npm run dev

# 프론트엔드만 실행 (개발용)
npm run frontend

# 전체 개발 환경 (서버 + 프론트엔드 동시 실행)
npm run dev:full

# 공개 URL 터널 (외부 접근 가능한 URL 생성)
npm run tunnel
```

**실행 후 확인**
- **로컬 서버**: http://localhost:3000
- **공개 URL**: https://nwfreepilot.loca.lt
- 두 서버 모두 정상 실행되어야 외부에서 접근 가능

### 5단계: 서버 상태 확인
```bash
# 로컬 서버 확인
# 브라우저에서 http://localhost:3000 접속

# 공개 URL 확인
# 브라우저에서 https://nwfreepilot.loca.lt 접속

# 참고: 터널 연결이 끊기면 재실행 필요
```

## 🔧 개발 환경 설정

### 포트 설정
- **통합 서버 (기본)**: http://localhost:3000
- **프론트엔드 (별도 실행 시)**: http://localhost:8000

### 필수 환경
- **Node.js**: 16 이상
- **데이터베이스**: MSSQL Server (또는 SQL Server Express)
- **브라우저**: Chrome 40+, Firefox 44+, Edge 79+ (PWA 지원)

### 환경 변수 (.env)
```env
# 데이터베이스 설정
DB_SERVER=localhost
DB_DATABASE=PWAPOC
DB_USER=sa
DB_PASSWORD=your_password_here
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

# 서버 설정
PORT=3000
NODE_ENV=development
```

## 📝 코딩 컨벤션

### JavaScript 스타일
- **ES6+ 문법** 사용 (class, arrow function, async/await)
- **클래스 기반 구조** 선호
- **async/await 패턴** 사용 (Promise 대신)
- **의미 있는 로깅**: console.log는 개발 중 디버깅용, 실제 코드에는 적절한 메시지 사용

### 파일 명명 규칙
- **파일명**: kebab-case (`sync-manager.js`, `app.js`)
- **클래스명**: PascalCase (`HealthCheckupApp`, `SyncManager`, `ServiceWorkerManager`)
- **함수/변수명**: camelCase (`initIndexedDB`, `loadPatients`)
- **상수명**: UPPER_SNAKE_CASE (`CACHE_NAME`, `API_BASE_URL`)

### 데이터베이스 규칙
- **IndexedDB 스토어명**: camelCase (`patients`, `checkups`, `checkupTypes`, `checkupItems`)
- **MSSQL 테이블명**: snake_case (`patients`, `checkups`, `checkup_types`, `checkup_items`)
- **MSSQL 컬럼명**: snake_case (`patient_id`, `checkup_date`, `birth_date`)

## 🧪 테스트 가이드라인

### 수동 테스트 절차

#### 1. 온라인 기능 테스트
   - **환자 관리**
     - 환자 등록 (이름, 생년월일, 성별, 연락처 등)
     - 환자 목록 조회 및 검색
     - 환자 상세 정보 확인

   - **검진 관리**
     - 검진 예약 (환자 선택, 검진 유형, 날짜/시간)
     - 검진 항목 입력 (신체계측, 혈압, 혈액검사 등)
     - 검진 결과 및 종합 소견 작성
     - 검진 상태 변경 (예약됨 → 진행중 → 완료)

   - **대시보드**
     - 통계 정보 확인 (총 환자 수, 오늘 예정 검진, 진행 중 검진 등)
     - 최근 검진 기록 확인

#### 2. 오프라인 기능 테스트
   - **오프라인 전환**
     - 개발자 도구 → Network → Offline 체크
     - 또는 네트워크 연결 끊기

   - **오프라인 데이터 조작**
     - 환자 등록 (로컬 저장 확인)
     - 검진 예약 (임시키 생성 확인)
     - 검진 항목 입력

   - **온라인 복귀 시 동기화**
     - Network → Online 체크
     - 자동 동기화 알림 확인
     - 임시키 → 실제키 전환 확인
     - 서버 데이터와 일치 확인

#### 3. PWA 기능 테스트
   - **앱 설치**
     - Chrome: 주소창 옆 설치 아이콘 클릭
     - 설치 프롬프트 동작 확인

   - **Service Worker**
     - 개발자 도구 → Application → Service Workers
     - 등록 상태 확인 (activated and running)
     - 캐시 업데이트 동작 확인

   - **오프라인 페이지**
     - 서버 중지 후 새 페이지 접근
     - 오프라인 폴백 페이지 표시 확인

### 디버깅 포인트

#### 개발자 도구 활용
- **Application 탭**
  - Service Workers: SW 상태, 업데이트, 등록 해제
  - IndexedDB: 로컬 데이터 확인 (patients, checkups, checkupItems 등)
  - Cache Storage: 캐시된 리소스 확인 (static, dynamic)
  - Manifest: PWA 설정 확인

- **Console 탭**
  - 동기화 로그 확인
  - API 요청/응답 로그
  - 오류 메시지 확인

- **Network 탭**
  - API 요청 확인 (성공/실패)
  - 응답 시간 및 크기
  - 오프라인 동작 시뮬레이션

#### 주요 로그 메시지
```
✅ MSSQL 데이터베이스에 연결되었습니다.
✅ IndexedDB 연결 성공
✅ Service Worker 등록 성공
🔄 전체 데이터 동기화 시작...
✅ 환자 데이터 N개 동기화 완료
⚠️ 오프라인 모드: 데이터가 로컬에 저장되었습니다.
```

## 🔍 프로젝트 특이사항

### 핵심 클래스 구조
- **`HealthCheckupApp`** (`app.js`): 건강검진 시스템 메인 애플리케이션 로직
  - IndexedDB 관리 (환자, 검진, 검진 항목)
  - 온라인/오프라인 상태 관리
  - 양방향 동기화 (로컬 ↔ 서버)
  - UI 렌더링 및 이벤트 처리

- **`SyncManager`** (`sync-manager.js`): 기존 POC 동기화 매니저 (참고용)
  - 주의: 현재는 `HealthCheckupApp`이 동기화 관리

- **`ServiceWorkerManager`** (`sw-register.js`): Service Worker 등록 및 관리
  - SW 상태 모니터링
  - 캐시 관리
  - 메시지 통신

### 중요 파일
- **`mssql-config.js`**: MSSQL 연결 설정 (환경변수 기반)
- **`server.js`**: Express 서버 및 REST API
- **`app.js`**: 프론트엔드 메인 로직
- **`manifest.json`**: PWA 설정 (아이콘, 테마, shortcuts)
- **`sw.js`**: Service Worker 로직 (캐싱 전략, 오프라인 지원)
- **`index.html`**: SPA 진입점
- **`styles.css`**: UI 스타일링

### 데이터베이스 스키마

#### 주요 테이블
1. **patients**: 환자 정보
   - `id`, `patient_id`, `name`, `birth_date`, `gender`, `phone`, `email`, etc.

2. **checkups**: 검진 기록
   - `id`, `checkup_no`, `patient_id`, `checkup_type_id`, `checkup_date`, `status`, etc.

3. **checkup_types**: 검진 유형
   - `id`, `type_name`, `type_code`, `description`, `duration_minutes`

4. **checkup_items**: 검진 항목
   - `id`, `checkup_id`, `item_category`, `item_name`, `item_value`, `status`, etc.

### 데이터 플로우

#### 온라인 모드
```
UI → HealthCheckupApp → API (server.js) → MSSQL
                      ↓
                  IndexedDB (캐시)
```

#### 오프라인 모드
```
UI → HealthCheckupApp → IndexedDB (임시 저장)
                      ↓
                  sync_status: 'pending'
```

#### 온라인 복귀 시 동기화
```
HealthCheckupApp → 대기 데이터 조회 (sync_status: 'pending')
                → API (server.js) → MSSQL
                → 임시키 삭제, 실제키로 교체
                → IndexedDB 업데이트
```

## ⚠️ 주의사항

### 보안
- **HTTPS 필수**: Service Worker는 HTTPS 환경에서만 동작 (localhost 제외)
- **환경 변수**: `.env` 파일에 DB 비밀번호 저장, `.gitignore`에 추가됨
- **인증 시스템**: 실제 운영 시 사용자 인증 및 권한 관리 필요
- **SQL Injection 방지**: Parameterized Query 사용 중 (계속 유지)
- **CORS 설정**: 필요 시 `server.js`의 CORS 설정 조정

### 성능
- **대용량 데이터**: 페이지네이션 또는 무한 스크롤 구현 권장
- **동기화 최적화**:
  - 현재 5분 주기 자동 동기화
  - 대량 데이터는 배치 처리
  - 네트워크 상태에 따라 동기화 주기 조정 가능
- **IndexedDB**:
  - 트랜잭션 단위 최적화
  - 인덱스 활용 (patient_id, checkup_date, sync_status 등)
- **캐시 관리**:
  - Service Worker 캐시 크기 제한 고려
  - 주기적 캐시 정리 필요

### 브라우저 호환성
- **Service Worker**: Chrome 40+, Firefox 44+, Edge 17+, Safari 11.1+
- **IndexedDB**: 대부분의 모던 브라우저 지원
- **미지원 브라우저**:
  - Service Worker 없이도 기본 기능 동작 (온라인 모드만)
  - 오프라인 기능은 불가
  - 브라우저 업데이트 안내 필요

### 개발 환경
- **localhost**: HTTPS 없이 Service Worker 테스트 가능
- **프로덕션**: HTTPS 인증서 필수
- **데이터베이스**: MSSQL 연결 정보 확인 필요

## 🔧 문제 해결

### 일반적인 이슈

#### 1. MSSQL 연결 실패
**증상**: `❌ 데이터베이스 연결 실패` 메시지
**해결 방법**:
- `.env` 파일 존재 여부 확인
- `.env` 파일의 DB_PASSWORD 값 확인
- MSSQL 서버가 실행 중인지 확인
- `mssql-config.js`의 연결 정보 확인
- 방화벽 설정 확인 (1433 포트)

#### 2. Service Worker 업데이트 안됨
**증상**: 코드 변경 후에도 이전 버전 실행
**해결 방법**:
- 하드 리프레시: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)
- 개발자 도구 → Application → Service Workers → Unregister
- 브라우저 캐시 전체 삭제
- `sw.js`의 `CACHE_NAME` 버전 변경

#### 3. 동기화 오류
**증상**: 오프라인 데이터가 서버로 전송되지 않음
**해결 방법**:
- 네트워크 상태 확인 (온라인 상태인지)
- 서버 실행 상태 확인 (`npm start` 또는 `npm run dev`)
- 브라우저 Console에서 동기화 로그 확인
- IndexedDB에 `sync_status: 'pending'` 데이터 확인
- `/api/health` 엔드포인트 접근 테스트

#### 4. 환경 변수 로드 안됨
**증상**: `DB_PASSWORD 환경 변수가 설정되지 않았습니다` 메시지
**해결 방법**:
- `.env` 파일이 프로젝트 루트에 있는지 확인
- `.env` 파일 형식 확인 (KEY=VALUE)
- 서버 재시작 (환경 변수는 서버 시작 시 로드됨)

#### 5. IndexedDB 버전 충돌 ⭐ NEW
**증상**: `VersionError: The requested version (4) is less than the existing version (5)`
**해결 방법** (순서대로 시도):
1. **브라우저 하드 리프레시**: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)
2. **Service Worker 등록 해제**:
   - F12 → Application → Service Workers → Unregister
3. **캐시 완전 삭제**:
   - F12 → Application → Storage → Clear site data 클릭
4. **IndexedDB 삭제**:
   - F12 → Application → IndexedDB → HealthCheckupDB 우클릭 → Delete database
5. **브라우저 재시작** 후 페이지 접근

**자동 처리**: 버전 충돌 감지 시 자동으로 확인 대화상자 표시 (v1.2+)

#### 6. IndexedDB 일반 오류
**증상**: `IndexedDB not initialized` 오류
**해결 방법**:
- 브라우저가 IndexedDB를 지원하는지 확인
- 브라우저 프라이빗 모드가 아닌지 확인
- IndexedDB 스토리지 용량 확인
- 개발자 도구 → Application → IndexedDB → 데이터베이스 삭제 후 재시작

#### 7. 자동 동기화 작동 안함 ⭐ NEW
**증상**: 온라인 전환 시 자동으로 동기화가 실행되지 않음
**해결 방법**:
1. **설정 확인**: 설정 화면 → "자동 동기화" 토글이 ON인지 확인
2. **localStorage 확인**:
   - F12 → Console → `localStorage.getItem('autoSyncEnabled')` 입력
   - 결과가 `"true"`인지 확인
3. **수동 동기화**: 자동 동기화가 OFF면 수동으로 "동기화" 버튼 클릭
4. **콘솔 로그 확인**:
   - `📋 자동 동기화 설정 로드: 활성화` 메시지 확인
   - `⏰ 주기적 동기화가 시작되었습니다` 메시지 확인

**동작 방식**:
- **자동 동기화 ON**: 온라인 전환 시 자동 동기화 + 5분 주기 동기화
- **자동 동기화 OFF**: 수동 동기화 버튼으로만 동기화 가능

#### 8. 엑셀 업로드 오류 ⭐ NEW (v2.4)
**증상**: 엑셀 파일을 업로드했는데 데이터가 제대로 가져와지지 않음
**해결 방법**:
1. **엑셀 파일 형식 확인**:
   - 시트 이름이 정확한지 확인: `환자`, `검진`, `검진유형`, `검진항목`
   - 시트가 없는 경우 해당 데이터는 건너뜀
2. **콘솔 로그 확인**:
   - F12 → Console → 임포트 통계 확인
   - 예: `✅ 환자: 5개 추가, 3개 건너뜀, 0개 오류`
3. **수동 동기화 필요**:
   - 엑셀 업로드 후 자동으로 서버 동기화되지 않음
   - **설정 → 데이터 동기화** 버튼을 눌러 서버에 반영
4. **중복 데이터 처리**:
   - 같은 ID의 데이터는 자동으로 건너뜀 (덮어쓰지 않음)
   - 새로운 데이터만 추가됨

**엑셀 파일 형식**:
- `.xlsx` 또는 `.xls` 파일만 지원
- 각 시트는 고유한 컬럼명을 가져야 함 (환자: ID, 환자번호, 이름, 생년월일 등)

#### 9. 공개 URL 터널 503 오류 ⭐ NEW (v2.4)
**증상**: `https://nwfreepilot.loca.lt` 접속 시 "503 - Tunnel Unavailable" 오류
**해결 방법**:
1. **터널 재시작**:
   ```bash
   npm run tunnel
   ```
   - 터널 연결은 네트워크 상태에 따라 끊길 수 있음
   - 재실행하면 같은 URL로 다시 연결됨

2. **서버 실행 확인**:
   - localhost:3000이 정상 작동하는지 확인
   - 서버가 멈췄으면 `npm run dev` 재실행

3. **방화벽 설정**:
   - Windows 방화벽에서 Node.js 허용 확인
   - 일부 안티바이러스가 터널 소프트웨어를 차단할 수 있음

**주의사항**:
- Localtunnel은 무료 서비스로 연결이 자주 끊길 수 있음
- 프로덕션 환경에서는 ngrok Pro 또는 고정 IP 사용 권장
- 터널 URL은 외부에 공개되므로 보안에 주의

#### 10. 환자/검진 삭제 오류 ⭐ NEW (v2.4)
**증상**: 온라인 상태인데도 "오프라인 모드: 삭제가 예약되었습니다" 메시지 표시
**해결 방법**:
- **v2.4에서 수정됨**: 이제 온라인 상태에서는 즉시 삭제됨
- 외래키 제약조건 오류 시 명확한 오류 메시지 표시
- 예: "연관된 검진 기록이 있는 경우 먼저 검진을 삭제해주세요"

**정상 동작**:
- **온라인 상태**: 즉시 서버에서 삭제, IndexedDB에서도 삭제
- **오프라인 상태**: 삭제 예약 (sync_status: 'pending_delete'), 온라인 복귀 시 동기화

### 로그 확인 위치
- **서버 로그**: 터미널 콘솔 출력
- **클라이언트 로그**: 브라우저 개발자 도구 → Console
- **Service Worker 로그**: Application → Service Workers (또는 Console)
- **API 요청/응답**: Network 탭

### 디버그 모드
```javascript
// app.js에서 디버그 로깅 활성화 (개발 중)
console.log('🔍 디버그:', { 상태: '...', 데이터: '...' });

// 동기화 상태 확인
window.app.getSyncStatus();
```

## 📚 관련 문서
- **`README.md`**: 프로젝트 전체 개요
- **`MSSQL-SETUP.md`**: 데이터베이스 설정 가이드
- **`PROJECT-ANALYSIS.md`**: 프로젝트 구조 분석
- **`DATABASE-RELATIONSHIPS.md`**: 데이터베이스 ERD 및 관계
- **`HEALTH-CHECKUP-SYSTEM-DESIGN.md`**: 건강검진 시스템 설계 문서

## 📦 의존성

### 프로덕션 의존성
- **express**: ^4.18.2 - 웹 서버 프레임워크
- **body-parser**: ^1.20.2 - HTTP 요청 바디 파싱
- **cors**: ^2.8.5 - CORS 미들웨어
- **mssql**: ^10.0.1 - MSSQL 데이터베이스 드라이버
- **dotenv**: ^17.2.3 - 환경 변수 관리

### 개발 의존성
- **nodemon**: ^3.0.1 - 파일 변경 시 자동 재시작
- **concurrently**: ^9.2.0 - 여러 명령어 동시 실행
- **http-server**: ^14.1.1 - 정적 파일 서버
- **localtunnel**: latest - 로컬 서버를 공개 URL로 노출

### 클라이언트 라이브러리 (CDN)
- **SheetJS (xlsx)**: 0.20.1 - 엑셀 파일 읽기/쓰기 (https://cdn.sheetjs.com)

## 🚀 배포 가이드

### 프로덕션 배포 체크리스트
1. **환경 변수 설정**
   - `.env` 파일 생성 및 프로덕션 값 입력
   - DB_PASSWORD 등 민감 정보 보안 확인

2. **HTTPS 설정**
   - SSL 인증서 설치 (Let's Encrypt 권장)
   - Service Worker는 HTTPS 필수

3. **데이터베이스 초기화**
   - `npm run init-health-checkup` 실행
   - 프로덕션 데이터베이스에 스키마 생성

4. **보안 설정**
   - CORS 설정 확인 (`server.js`)
   - SQL Injection 방지 확인
   - 인증 시스템 구현 (필요 시)

5. **성능 최적화**
   - 캐시 전략 최적화
   - 데이터베이스 인덱스 확인
   - 동기화 주기 조정

6. **모니터링**
   - 서버 로그 모니터링 설정
   - 오류 추적 시스템 (Sentry 등)
   - 성능 모니터링 (New Relic 등)

---

## 🔖 빠른 참조

### 현재 버전
- **코드 버전**: v2.5
- **IndexedDB 버전**: v5
- **Service Worker 캐시 버전**: v7
- **최종 업데이트**: 2025-10-27 17:10

### 주요 설정 위치
- **자동 동기화**: 설정 화면 → 자동 동기화 토글
- **엑셀 내보내기/가져오기**: 설정 화면 → 엑셀 데이터 관리 섹션
- **공개 URL**: 설정 화면 → 서버 정보 섹션
- **버전 정보**: 헤더 우측 상단 (v2.5 / 2025-10-27 17:10:00)
- **동기화 상태**: 헤더 우측 "데이터 동기화" 배지 (실제 서버 동기화 성공 시에만 업데이트)

### 자주 사용하는 명령어
```bash
# ⭐ 권장: 개발 서버와 터널 동시 실행
# 터미널 1
npm run dev
# 터미널 2 (새 터미널)
npm run tunnel

# 개발 모드만 실행
npm run dev

# 공개 URL 터널만 실행
npm run tunnel

# 캐시 버전 확인
# sw.js 파일에서 CACHE_NAME 확인

# IndexedDB 버전 확인
# app.js 파일에서 dbVersion 확인
```

### 디버깅 팁
```javascript
// 콘솔에서 실행 가능한 명령어
localStorage.getItem('autoSyncEnabled')  // 자동 동기화 설정 확인
window.app.isOnline                       // 온라인 상태 확인
window.app.VERSION                        // 현재 버전 확인

// IndexedDB 데이터 확인
window.app.getAllFromStore('patients')    // 모든 환자 데이터 조회
window.app.getAllFromStore('checkups')    // 모든 검진 데이터 조회
```

### 공개 URL 정보
- **로컬 서버**: http://localhost:3000
- **공개 URL**: https://nwfreepilot.loca.lt
- **터널 상태 확인**: 설정 → 서버 정보

---
*최종 업데이트: 2025-10-27 17:10 (v2.5 - 서버 상태 정확도 개선)*