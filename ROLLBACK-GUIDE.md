# 롤백 가이드 (Rollback Guide)

## 📌 현재 저장된 버전

### v2.5-stable (2025-10-27 17:10:00)
- **커밋 해시**: `9e85792`
- **태그**: `v2.5-stable`
- **날짜**: 2025-10-27

#### 주요 기능
- 실제 서버 연결 상태 확인
- 정확한 동기화 완료 시점 표시
- 태블릿 가로/세로 모드 지원
- Service Worker 캐시 v7

---

## 🔄 롤백 방법

### 방법 1: 태그로 롤백 (권장)

```bash
# v2.5-stable로 롤백
git checkout v2.5-stable

# 롤백 후 새 브랜치 생성 (작업 계속하려면)
git checkout -b rollback-v2.5

# 또는 master를 강제로 이 버전으로 되돌리기 (주의!)
git reset --hard v2.5-stable
```

### 방법 2: 커밋 해시로 롤백

```bash
# 특정 커밋으로 롤백
git checkout 9e85792

# 또는 master를 강제로 이 커밋으로 되돌리기 (주의!)
git reset --hard 9e85792
```

### 방법 3: 변경사항 확인 후 선택적 롤백

```bash
# 현재 커밋과 v2.5-stable 비교
git diff v2.5-stable

# 특정 파일만 롤백
git checkout v2.5-stable -- app.js
git checkout v2.5-stable -- manifest.json
git checkout v2.5-stable -- sw.js
```

---

## 📋 롤백 후 체크리스트

롤백 후 다음 사항을 확인하세요:

### 1. 서버 재시작
```bash
# 기존 서버 종료 후
npm run dev
npm run tunnel
```

### 2. 브라우저 캐시 삭제
- `Ctrl+Shift+R` (강력 새로고침)
- F12 → Application → Service Workers → Unregister
- F12 → Application → Storage → Clear site data

### 3. 버전 확인
- 브라우저에서 헤더 우측 상단 버전 정보 확인
- 콘솔에서 `window.app.VERSION` 확인 → `"2.5"`

### 4. 주요 기능 테스트
- [ ] 온라인/오프라인 상태 표시 정확성
- [ ] 서버 다운 시 오프라인 표시
- [ ] 동기화 완료 시간 정확성
- [ ] 태블릿 가로/세로 모드 작동
- [ ] 환자/검진 CRUD 기능
- [ ] 엑셀 내보내기/가져오기

---

## 🏷️ 사용 가능한 태그 목록

```bash
# 모든 태그 보기
git tag -l -n1

# 태그 상세 정보
git show v2.5-stable
```

### 저장된 태그
- `v2.5-stable` - 서버 상태 정확도 개선 & 태블릿 지원 (2025-10-27)

---

## ⚠️ 주의사항

### 롤백 전 확인사항
1. **현재 작업 저장**: 롤백 전 현재 작업을 커밋하거나 stash하세요
   ```bash
   git stash save "작업 중인 내용"
   ```

2. **복원 시 데이터 손실 없음 확인**: 데이터베이스는 롤백되지 않습니다
   - IndexedDB: 브라우저 로컬 데이터는 그대로 유지
   - MSSQL: 서버 데이터베이스는 영향 없음

3. **Service Worker 충돌 주의**: 롤백 후 반드시 Service Worker 재등록 필요

### 롤백 취소 (다시 최신 버전으로)
```bash
# 최신 커밋으로 돌아가기
git checkout master

# 또는 특정 브랜치로
git checkout <branch-name>
```

---

## 📝 버전 히스토리

| 태그 | 날짜 | 커밋 해시 | 설명 |
|------|------|----------|------|
| v2.5-stable | 2025-10-27 | 9e85792 | 서버 상태 정확도 개선 & 태블릿 지원 |

---

## 🆘 문제 해결

### 롤백 후 서버가 안 올라올 때
```bash
# 포트 3000 사용 중인 프로세스 종료
netstat -ano | findstr :3000
taskkill //F //PID <PID번호>

# 서버 재시작
npm run dev
```

### 롤백 후 브라우저에서 이전 버전이 보일 때
```bash
# Service Worker 캐시 버전 확인
# sw.js 파일에서 CACHE_NAME 확인

# 브라우저에서
# F12 → Application → Service Workers → Unregister
# F12 → Application → Cache Storage → 모든 캐시 삭제
```

### Git 명령어가 작동하지 않을 때
```bash
# Git 상태 확인
git status

# Git 저장소 초기화 확인
ls -la .git

# 저장소가 없으면 다시 초기화
git init
```

---

*최종 업데이트: 2025-10-27*
*문서 버전: 1.0*
