# 버전 히스토리 (Version History)

## v1.9 (2025-10-02 16:30:00) - 양방향 동기화 강화

### 주요 변경사항
- ✅ 서버 → 로컬 동기화 후 화면 자동 갱신
- ✅ 온라인 전환 시 로딩 표시 및 완료 알림 추가
- ✅ 수동 동기화 함수 통합 및 일관성 개선
- ✅ 주기적 동기화 에러 처리 강화

### 수정된 파일
- `app.js`: performFullDataSync() - 화면 갱신 추가 (라인 1770)
- `app.js`: 온라인 전환 리스너 - 로딩/알림 추가 (라인 407-424)
- `app.js`: forceSyncBoth() - 통합 함수 사용 (라인 3247-3276)
- `app.js`: startPeriodicSync() - try-catch 추가 (라인 1960-1978)
- `app.js`: VERSION v1.9, VERSION_DATE 업데이트
- `index.html`: 스크립트 버전 v1.9 업데이트
- `sw.js`: 캐시 버전 v5 → v6 업그레이드
- `QUICK-START.md`: v1.9 버전 정보 업데이트

### 문제 원인
온라인 전환 시 양방향 동기화가 실행되지만:
1. `performFullDataSync()` 완료 후 화면이 갱신되지 않음
2. 사용자에게 동기화 진행 상황이 보이지 않음
3. 수동 동기화와 자동 동기화가 서로 다른 함수 사용

### 기술적 개선
**1. performFullDataSync() 화면 갱신 추가:**
```javascript
async performFullDataSync() {
    // ... 동기화 로직 ...

    // 동기화 시간 업데이트
    this.updateSyncTime();

    // 현재 화면 갱신 (v1.9 추가)
    this.refreshCurrentView();
}
```

**2. 온라인 전환 시 로딩 및 알림:**
```javascript
setTimeout(async () => {
    this.showLoading(true, '양방향 동기화 중...');
    try {
        await this.syncOfflineRequests();
        await this.performFullDataSync();
        this.showNotification('모든 데이터가 동기화되었습니다.', 'success');
    } catch (error) {
        this.showNotification('동기화 중 오류가 발생했습니다.', 'error');
    } finally {
        this.showLoading(false);
    }
}, 1000);
```

**3. 수동 동기화 통합:**
```javascript
async forceSyncBoth() {
    // 기존: syncToServerManual(), syncFromServerManual() 사용
    // 개선: syncOfflineRequests(), performFullDataSync() 사용
    // → 자동 동기화와 동일한 로직 사용
}
```

### 동기화 시나리오
1. **오프라인 → 온라인 전환** (자동 동기화 ON):
   - 로딩 표시 시작
   - 로컬 → 서버 업로드
   - 서버 → 로컬 다운로드
   - 화면 자동 갱신
   - 완료 알림 표시

2. **주기적 동기화** (5분 간격):
   - 온라인 상태일 때만 실행
   - 양방향 동기화 수행
   - 화면 자동 갱신
   - 에러 발생 시 콘솔 로그

3. **수동 동기화** (설정 화면):
   - 확인 다이얼로그
   - 로딩 표시
   - 양방향 동기화
   - 화면 자동 갱신
   - 완료/실패 알림

---

## v1.8 (2025-10-02 16:00:00) - 검진 항목 동기화 버그 수정

### 주요 변경사항
- ✅ 오프라인 검진 항목 동기화 누락 버그 수정
- ✅ saveCheckupItems()에 action 필드 추가

### 수정된 파일
- `app.js`: saveCheckupItems() - action 필드 추가 (라인 2220)
- `app.js`: VERSION v1.8, VERSION_DATE 업데이트
- `index.html`: 스크립트 버전 v1.8 업데이트
- `sw.js`: 캐시 버전 v4 → v5 업그레이드
- `QUICK-START.md`: v1.8 버전 정보 업데이트

### 문제 원인
오프라인에서 검진 항목을 저장할 때 `sync_status: 'pending'`은 설정되었지만, `action: 'create'` 필드가 누락되어 있었습니다. syncPendingData() 함수는 `data.action === 'create'` 조건으로 동기화 대상을 판단하므로, action 필드가 없는 항목은 동기화되지 않았습니다.

### 기술적 개선
**app.js 라인 2217-2220:**
```javascript
if (isTempCheckup || !card.dataset.itemId || card.dataset.itemId === 'new') {
    itemData.id = `temp_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`;
    itemData.sync_status = 'pending';
    itemData.action = 'create'; // 동기화 시 필요한 액션 타입 (v1.8 추가)
}
```

### 동작 검증
1. 오프라인에서 검진 항목 추가 → `action: 'create'` 포함하여 저장
2. 온라인 전환 → `syncPendingData()` 호출
3. `data.action === 'create'` 조건 통과 → `syncCreateData()` 실행
4. 임시 검진 ID → 실제 검진 ID 변환
5. 서버 API 호출 성공 → IndexedDB에서 임시 데이터 삭제

---

## v1.3 (2025-10-02 14:00:00) - 자동 동기화 설정 개선

### 주요 변경사항
- ✅ 자동 동기화 ON/OFF 설정 기능 추가
- ✅ localStorage를 통한 설정 영구 저장
- ✅ 온라인 전환 시 설정에 따라 자동 동기화 여부 결정

### 수정된 파일
- `app.js`: toggleAutoSync(), loadAutoSyncSetting() 함수 추가
- `app.js`: setupNetworkListeners() - 자동 동기화 설정 확인 로직 추가
- `index.html`: 스크립트 버전 v1.3 업데이트
- `sw.js`: 캐시 버전 v2 → v3 업그레이드

### 동작 방식
1. **자동 동기화 활성화 시**:
   - 온라인 전환 시 자동으로 동기화
   - 5분 간격으로 주기적 동기화

2. **자동 동기화 비활성화 시**:
   - 온라인 전환 시 알림만 표시
   - 수동 동기화 버튼으로만 동기화 가능

---

## v1.2 (2025-10-02 13:50:00) - 오프라인 검진 예약 개선

### 주요 변경사항
- ✅ 오프라인 검진 예약 시 환자명/검진유형명 표시 문제 해결
- ✅ 오프라인 대시보드 지원 (IndexedDB 기반 통계)
- ✅ IndexedDB 버전 충돌 자동 처리

### 수정된 파일
- `app.js`: saveCheckup() - patient_name, type_name 저장 추가
- `app.js`: getCheckupsFromIndexedDB() - 저장된 이름 우선 사용
- `app.js`: loadDashboard() - 오프라인 모드 지원
- `app.js`: handleVersionConflict() - 버전 충돌 처리 추가

### 기술적 개선
1. **데이터 저장 강화**:
   ```javascript
   checkupData.patient_name = selectedPatient?.textContent?.trim() || '';
   checkupData.type_name = selectedType?.textContent?.trim() || '';
   ```

2. **데이터 조회 개선**:
   - 저장된 patient_name/type_name이 있으면 우선 사용
   - 없을 때만 IndexedDB 조인 시도

3. **오프라인 대시보드**:
   - IndexedDB에서 통계 계산
   - 네트워크 오류 없이 정상 작동

---

## v1.1 (2025-10-02 13:40:00) - 버전 관리 시스템 구축

### 주요 변경사항
- ✅ Major.Minor 버전 관리 시스템 도입
- ✅ 화면에 버전 정보 및 소스 적용일시 표시
- ✅ UI 일관성 개선 (버전 정보, 동기화 상태)

### 수정된 파일
- `app.js`: VERSION, VERSION_DATE 변수 추가
- `app.js`: updateVersionDisplay() 함수 추가
- `index.html`: 버전 정보 표시 UI 추가

### 표시 형식
```
v1.1 / 2025. 10. 2. 오후 1:40:00
```

---

## v1.0 초기 구현 - 오프라인 기능 개선

### 주요 변경사항
- ✅ 오프라인 환자 등록 시 임시 ID 시스템 구현
- ✅ 오프라인 검진 유형 캐싱 (IndexedDB)
- ✅ IndexedDB 스키마 v4 → v5 업그레이드
- ✅ sync_status 인덱스 추가 (checkupTypes, checkupItems)

### IndexedDB 스키마 v5
```javascript
// 환자 스토어
patients: {
  keyPath: 'id',
  indexes: ['patient_id', 'name', 'sync_status', 'temp_id']
}

// 검진 스토어
checkups: {
  keyPath: 'id',
  indexes: ['patient_id', 'checkup_date', 'sync_status', 'temp_id']
}

// 검진 유형 스토어
checkupTypes: {
  keyPath: 'id',
  indexes: ['sync_status'] // v5에서 추가
}

// 검진 항목 스토어
checkupItems: {
  keyPath: 'id',
  indexes: ['checkup_id', 'sync_status'] // v5에서 추가
}
```

### 임시 ID 시스템
```javascript
// 패턴
temp_{type}_{timestamp}_{random}

// 예시
temp_patient_1727856000000_a1b2c3
temp_checkup_1727856000000_d4e5f6
```

---

## 주요 기능 요약

### 1. 오프라인 환자 관리
- 임시 ID로 환자 등록
- 온라인 전환 시 자동 동기화
- 실제 patient_id로 자동 매핑

### 2. 오프라인 검진 예약
- 환자명, 검진유형명 함께 저장
- 오프라인에서도 정확한 정보 표시
- 동기화 시 데이터 무결성 유지

### 3. 자동 동기화
- ON/OFF 설정 가능
- localStorage에 설정 저장
- 5분 간격 주기적 동기화

### 4. 오프라인 대시보드
- IndexedDB 기반 통계 계산
- 네트워크 없이도 정상 작동

---

## 문제 해결 가이드

### IndexedDB 버전 충돌 시
1. F12 → Application → Service Workers → Unregister
2. Storage → Clear site data
3. Ctrl+Shift+R (하드 리프레시)

### 캐시 무효화
- Service Worker 캐시 버전: v3
- URL 파라미터: `?v=1.3`
- 자동 캐시 삭제 및 새로고침 기능 제공

### 자동 동기화 안됨
1. 설정 화면에서 "자동 동기화" 확인
2. localStorage 확인: `autoSyncEnabled`
3. 콘솔 확인: "주기적 동기화가 시작되었습니다" 메시지

---

## 다음 작업 예정

### 우선순위 높음
- [ ] 동기화 충돌 처리 개선
- [ ] 오프라인 데이터 용량 제한 관리
- [ ] 에러 로그 수집 시스템

### 우선순위 중간
- [ ] 사용자 피드백 기능
- [ ] 동기화 진행률 표시
- [ ] 데이터 내보내기/가져오기

### 우선순위 낮음
- [ ] 다크 모드 지원
- [ ] 다국어 지원
- [ ] 접근성 개선

---

## 기술 스택

### 프론트엔드
- Vanilla JavaScript (ES6+)
- IndexedDB API
- Service Worker API
- Fetch API

### 백엔드
- Node.js + Express
- MSSQL (mssql package)
- SQLite (대안)

### PWA
- Service Worker
- Cache API
- Web App Manifest

---

## 참고 문서
- [CLAUDE.md](./CLAUDE.md): 프로젝트 설정 및 실행 가이드
- [README.md](./README.md): 프로젝트 개요
- [MSSQL-SETUP.md](./MSSQL-SETUP.md): 데이터베이스 설정

---

**최종 업데이트**: 2025-10-02 16:30:00
**현재 버전**: v1.9
