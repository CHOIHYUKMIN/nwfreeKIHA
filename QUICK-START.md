# 빠른 시작 가이드 (Quick Start Guide)

> **다음에 작업할 때 이 문서를 먼저 읽으세요!**

## 📌 현재 상태 (2025-10-02)

### 버전 정보
- **코드 버전**: v1.9
- **IndexedDB 스키마**: v5
- **Service Worker 캐시**: v6

### 최근 작업 내용
1. ✅ 양방향 동기화 강화 및 화면 갱신 개선 (v1.9)
2. ✅ 검진 항목 동기화 누락 버그 수정 (v1.8)
3. ✅ 오프라인 검진 항목 온라인 동기화 구현 (v1.6)
4. ✅ 오프라인 검진 항목 저장 기능 구현 (v1.5)
5. ✅ 검진 상세 모달 중복 저장 버튼 제거 (v1.5)

---

## 🚀 서버 실행

```bash
# 프로젝트 디렉토리로 이동
cd D:\DEVELOP\WORKSPACE\NWFREEPILOT

# 개발 서버 실행
npm run dev

# 브라우저에서 접속
# http://localhost:3000
```

---

## 📁 주요 파일 위치

### 수정 가능성이 높은 파일
```
app.js              ← 메인 애플리케이션 로직
  ├─ VERSION: '1.9'
  ├─ dbVersion: 5
  ├─ performFullDataSync() - 서버 → 로컬 전체 동기화 (v1.9: 화면 갱신 추가)
  ├─ syncOfflineRequests() - 로컬 → 서버 동기화
  ├─ forceSyncBoth() - 수동 양방향 동기화 (v1.9: 통합 개선)
  └─ startPeriodicSync() - 주기적 동기화 (v1.9: 에러 처리 강화)

sw.js               ← Service Worker (캐시 관리)
  └─ CACHE_NAME: 'pwa-poc-v6'

index.html          ← UI 구조
  └─ 스크립트 버전: ?v=1.9

server.js           ← Express 서버 (API)
```

### 문서 파일
```
CLAUDE.md           ← 전체 프로젝트 설정 및 가이드
VERSION-HISTORY.md  ← 버전별 변경사항 상세
QUICK-START.md      ← 이 파일 (빠른 시작)
```

---

## 🔧 현재 해결된 주요 이슈

### 1. 양방향 동기화 강화 (v1.9)
**문제**: 온라인 전환 시 서버 데이터를 다운로드하지만 화면이 갱신되지 않음
**해결**: 전체 동기화 흐름 개선 (app.js)
- `performFullDataSync()`: 동기화 후 화면 자동 갱신 추가
- 온라인 전환 시: 로딩 표시 + 완료 알림 추가
- `forceSyncBoth()`: 수동 동기화를 일관된 함수로 통합
- `startPeriodicSync()`: 주기적 동기화 에러 처리 강화

**동기화 시나리오**:
1. **오프라인 → 온라인 전환**: 자동 양방향 동기화 + 화면 갱신
2. **주기적 동기화**: 5분마다 양방향 동기화 (자동 동기화 ON 시)
3. **수동 동기화**: 설정 화면에서 언제든지 실행 가능

### 2. 검진 항목 동기화 누락 버그 (v1.8)
**문제**: 오프라인에서 저장한 검진 항목이 온라인 전환 시 동기화되지 않음
**원인**: saveCheckupItems()에서 항목 저장 시 `action: 'create'` 필드가 누락됨
**해결**: saveCheckupItems() 함수 수정 (app.js:2220)
- 임시 항목 생성 시 `action: 'create'` 필드 추가
- syncPendingData()에서 action 필드로 동기화 타입 판단

### 3. 오프라인 검진 항목 온라인 동기화 (v1.6)
**문제**: 오프라인에서 저장한 검진 항목이 온라인 전환 시 자동 동기화되지 않음
**해결**: syncCreateData() 함수 개선 (app.js:2724-2863)
- 임시 검진 ID → 실제 검진 ID 변환
- API 엔드포인트 {checkup_id} 플레이스홀더 치환
- findRealCheckupId() 함수로 동기화된 검진 찾기
- 온라인 전환 시 자동 동기화 처리

### 4. 오프라인 검진 항목 저장 (v1.5)
**문제**: 오프라인에서 검진 항목 추가 후 저장 시 IndexedDB에 저장되지 않음
**해결**: saveCheckupItems() 전면 개선 (app.js:2187-2329)
- 온라인 + 실제 검진: 서버 저장 → IndexedDB 캐시
- 오프라인 또는 임시 검진: IndexedDB 직접 저장
- 임시 항목 ID 자동 생성 (`temp_item_...`)
- 모달 하단 중복 저장 버튼 제거

### 5. 오프라인 검진 상세보기 오류 (v1.4)
**문제**: 임시 검진 ID 클릭 시 ReferenceError 발생
**해결**: onclick 핸들러에 따옴표 추가, 임시 ID 문자열 처리
```javascript
onclick="app.showCheckupDetail('${checkup.id}')"  // 따옴표 추가
const isTempId = String(checkupId).startsWith('temp_');
```

### 6. 오프라인 검진 예약 시 환자명 표시 (v1.2)
**문제**: 오프라인에서 검진 예약 시 환자명, 검진유형이 "(알 수 없음)"으로 표시
**해결**: 검진 저장 시 patient_name, type_name을 함께 저장
```javascript
checkupData.patient_name = selectedPatient?.textContent?.trim() || '';
checkupData.type_name = selectedType?.textContent?.trim() || '';
```

### 7. 자동 동기화 설정 (v1.3)
**문제**: 온라인 전환 시 항상 자동으로 동기화됨
**해결**: autoSyncEnabled 설정에 따라 동작 분기
- ON: 온라인 전환 시 자동 동기화 + 5분 주기 동기화
- OFF: 수동 동기화 버튼으로만 동기화

---

## ⚠️ 알려진 이슈

### 없음 (현재 모든 주요 이슈 해결됨)

---

## 🎯 다음 작업 시 체크리스트

### 코드 수정 전
- [ ] 서버 실행 중인지 확인 (`npm run dev`)
- [ ] 현재 브랜치 확인 (git)
- [ ] 최신 버전 확인 (app.js:5 - VERSION)

### 코드 수정 후
- [ ] 브라우저 하드 리프레시 (`Ctrl+Shift+R`)
- [ ] IndexedDB 데이터 확인 (F12 → Application → IndexedDB)
- [ ] 콘솔 오류 확인
- [ ] 온라인/오프라인 모드 둘 다 테스트

### 버전 업데이트 시
1. [ ] app.js의 VERSION, VERSION_DATE 업데이트
2. [ ] index.html의 스크립트 ?v= 파라미터 업데이트
3. [ ] 필요시 sw.js의 CACHE_NAME 업데이트
4. [ ] VERSION-HISTORY.md에 변경사항 기록
5. [ ] CLAUDE.md 업데이트

---

## 🐛 문제 발생 시

### IndexedDB 버전 충돌
```
증상: VersionError: The requested version (4) is less than the existing version (5)
해결: Ctrl+Shift+R → F12 → Application → Storage → Clear site data
```

### 자동 동기화 안됨
```
증상: 온라인 전환해도 동기화 안됨
확인: 설정 화면 → "자동 동기화" 토글 ON 확인
     localStorage.getItem('autoSyncEnabled') === "true"
```

### 환자명이 "(알 수 없음)"으로 표시
```
증상: 오프라인 검진 예약 후 목록에서 환자명 표시 안됨
확인: v1.2 이상 버전인지 확인
     saveCheckup() 함수에서 patient_name, type_name 저장 확인
```

---

## 📚 상세 문서

- **전체 가이드**: [CLAUDE.md](./CLAUDE.md)
- **버전 히스토리**: [VERSION-HISTORY.md](./VERSION-HISTORY.md)
- **DB 설정**: [MSSQL-SETUP.md](./MSSQL-SETUP.md)

---

## 💡 유용한 콘솔 명령어

```javascript
// 현재 버전 확인
window.app.VERSION

// 자동 동기화 설정 확인
localStorage.getItem('autoSyncEnabled')

// 온라인 상태 확인
window.app.isOnline
navigator.onLine

// 동기화 수동 실행
await window.app.performFullDataSync()

// IndexedDB 데이터 확인
// F12 → Application → IndexedDB → HealthCheckupDB
```

---

## 🎨 주요 기능 위치

### 오프라인 검진 항목 동기화
- **파일**: app.js
- **함수**: syncCreateData() - 라인 2724
- **헬퍼**: findRealCheckupId() - 라인 2829
- **핵심 로직**:
  - 임시 검진 ID → 실제 검진 ID 변환
  - API 엔드포인트 {checkup_id} 치환
  - items 배열 래핑 후 서버 전송

### 오프라인 검진 항목 저장
- **파일**: app.js
- **함수**: saveCheckupItems() - 라인 2187
- **헬퍼**: saveItemsToIndexedDB() - 라인 2282
- **핵심 로직**:
  - 임시 검진 감지 (temp_checkup_...)
  - 임시 항목 ID 생성 (temp_item_...)
  - 온라인/오프라인 분기 처리

### 오프라인 검진 상세보기
- **파일**: app.js
- **함수**: getCheckupDetailFromIndexedDB() - 라인 1296
- **핵심 로직**: 임시 ID 문자열 처리, parseInt() 회피

### 양방향 동기화
- **파일**: app.js
- **오프라인 → 서버**: syncOfflineRequests() - 라인 2648
- **서버 → 로컬**: performFullDataSync() - 라인 1743
- **수동 동기화**: forceSyncBoth() - 라인 3247
- **주기적 동기화**: startPeriodicSync() - 라인 1960

### 버전 표시
- **파일**: app.js
- **함수**: updateVersionDisplay() - 라인 84
- **현재 버전**: v1.9 (2025-10-02 16:30:00)

---

**작성일**: 2025-10-02
**작성자**: Claude Code 세션 요약
**목적**: 다음 작업 시 빠른 상황 파악
