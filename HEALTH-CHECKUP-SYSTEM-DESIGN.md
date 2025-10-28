# 🏥 건강검진 시스템 확장 설계 문서

## 📋 현재 시스템 분석

### 🔍 기존 데이터 구조
현재 시스템은 단순한 사용자 텍스트 데이터를 관리하는 구조로 되어 있습니다:

```sql
-- 현재 user_data 테이블 구조 (init-mssql.js:32-44)
CREATE TABLE user_data (
    id INT IDENTITY(1,1) PRIMARY KEY,
    text NVARCHAR(MAX) NOT NULL,               -- 텍스트 데이터
    timestamp NVARCHAR(50) NOT NULL,           -- 타임스탬프
    is_online BIT NOT NULL DEFAULT 0,          -- 온라인 상태
    sync_status NVARCHAR(20) DEFAULT 'synced', -- 동기화 상태
    sync_direction NVARCHAR(20) DEFAULT 'none',
    local_id NVARCHAR(50),                     -- IndexedDB ID
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    is_offline_created BIT DEFAULT 0,
    conflict_resolved BIT DEFAULT 0
);
```

### ⚙️ 기존 시스템 구조
- **프론트엔드**: PWA + IndexedDB (`userData` 스토어)
- **백엔드**: Express.js + MSSQL Server
- **동기화**: SyncManager를 통한 온라인/오프라인 동기화
- **API**: RESTful `/api/data` 엔드포인트

## 🎯 건강검진 시스템 확장 설계

### 🏗️ 새로운 아키텍처 개요

```
현재 시스템 (간단한 텍스트)
┌─────────────────┐
│   user_data     │
│ (단순 텍스트)    │
└─────────────────┘

확장된 시스템 (건강검진 데이터)
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│   patients      │  checkup_types  │    checkups     │  checkup_items  │
│  (환자 정보)     │  (검진 유형)     │   (검진 기록)    │   (검진 항목)    │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### 📊 건강검진 데이터 모델 설계

#### 1. **환자 정보 테이블** (`patients`)
```sql
CREATE TABLE patients (
    id INT IDENTITY(1,1) PRIMARY KEY,
    patient_id NVARCHAR(20) UNIQUE NOT NULL,    -- 환자 고유 번호
    name NVARCHAR(100) NOT NULL,                -- 이름
    birth_date DATE NOT NULL,                   -- 생년월일
    gender NCHAR(1) CHECK (gender IN ('M', 'F')), -- 성별
    phone NVARCHAR(20),                         -- 전화번호
    email NVARCHAR(100),                        -- 이메일
    address NVARCHAR(500),                      -- 주소
    emergency_contact NVARCHAR(200),            -- 비상연락처
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),

    -- PWA 동기화 필드
    sync_status NVARCHAR(20) DEFAULT 'synced',
    local_id NVARCHAR(50),
    is_offline_created BIT DEFAULT 0,
    conflict_resolved BIT DEFAULT 0
);
```

#### 2. **검진 유형 테이블** (`checkup_types`)
```sql
CREATE TABLE checkup_types (
    id INT IDENTITY(1,1) PRIMARY KEY,
    type_code NVARCHAR(20) UNIQUE NOT NULL,     -- 검진 유형 코드
    type_name NVARCHAR(100) NOT NULL,           -- 검진 유형명
    description NVARCHAR(500),                  -- 설명
    duration_minutes INT DEFAULT 60,            -- 소요시간(분)
    is_active BIT DEFAULT 1,                    -- 활성 여부
    created_at DATETIME2 DEFAULT GETDATE()
);

-- 기본 검진 유형 데이터
INSERT INTO checkup_types (type_code, type_name, description, duration_minutes) VALUES
('GEN', '일반건강검진', '기본적인 건강상태 점검', 90),
('COM', '종합건강검진', '심화된 전반적 건강상태 검사', 180),
('CAR', '심혈관검진', '심장 및 혈관 건강 집중 검사', 120),
('CAN', '암검진', '각종 암 조기 발견 검사', 150),
('WOM', '여성건강검진', '여성 특화 건강검사', 120),
('SEN', '노인건강검진', '고령자 특화 건강검사', 100);
```

#### 3. **검진 기록 테이블** (`checkups`)
```sql
CREATE TABLE checkups (
    id INT IDENTITY(1,1) PRIMARY KEY,
    checkup_no NVARCHAR(30) UNIQUE NOT NULL,    -- 검진 접수번호
    patient_id INT NOT NULL,                    -- 환자 ID
    checkup_type_id INT NOT NULL,               -- 검진 유형 ID
    checkup_date DATE NOT NULL,                 -- 검진 날짜
    checkup_time TIME,                          -- 검진 시간
    status NVARCHAR(20) DEFAULT 'scheduled',    -- 상태 (scheduled/in_progress/completed/cancelled)
    doctor_name NVARCHAR(100),                  -- 담당 의사
    notes NVARCHAR(1000),                       -- 특이사항
    total_score INT,                            -- 종합 점수
    risk_level NVARCHAR(20),                    -- 위험도 (low/medium/high)

    -- 검진 결과 요약
    result_summary NVARCHAR(MAX),               -- 결과 요약
    recommendations NVARCHAR(MAX),              -- 권고사항
    next_checkup_date DATE,                     -- 다음 검진 권장일

    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    completed_at DATETIME2,                     -- 검진 완료 시간

    -- PWA 동기화 필드
    sync_status NVARCHAR(20) DEFAULT 'synced',
    local_id NVARCHAR(50),
    is_offline_created BIT DEFAULT 0,
    conflict_resolved BIT DEFAULT 0,

    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (checkup_type_id) REFERENCES checkup_types(id)
);
```

#### 4. **검진 항목 테이블** (`checkup_items`)
```sql
CREATE TABLE checkup_items (
    id INT IDENTITY(1,1) PRIMARY KEY,
    checkup_id INT NOT NULL,                    -- 검진 ID
    item_category NVARCHAR(50) NOT NULL,        -- 검사 카테고리
    item_name NVARCHAR(100) NOT NULL,           -- 검사 항목명
    item_value NVARCHAR(200),                   -- 검사 값
    reference_range NVARCHAR(100),              -- 정상 범위
    unit NVARCHAR(20),                          -- 단위
    status NVARCHAR(20),                        -- 상태 (normal/abnormal/warning)
    notes NVARCHAR(500),                        -- 비고
    measured_at DATETIME2,                      -- 측정 시간

    created_at DATETIME2 DEFAULT GETDATE(),

    -- PWA 동기화 필드
    sync_status NVARCHAR(20) DEFAULT 'synced',
    local_id NVARCHAR(50),
    is_offline_created BIT DEFAULT 0,

    FOREIGN KEY (checkup_id) REFERENCES checkups(id)
);
```

### 📱 프론트엔드 IndexedDB 구조 확장

#### 기존 구조
```javascript
// 현재 app.js:6
this.storeName = 'userData';
```

#### 확장된 구조
```javascript
class HealthCheckupApp extends PWAApp {
    constructor() {
        super();
        this.dbName = 'HealthCheckupDatabase';
        this.dbVersion = 1;

        // 다중 스토어 정의
        this.stores = {
            patients: 'patients',
            checkupTypes: 'checkupTypes',
            checkups: 'checkups',
            checkupItems: 'checkupItems',
            deletedData: 'deletedData'
        };
    }
}
```

### 🔧 API 엔드포인트 확장

#### 기존 API
```
GET    /api/data      - 데이터 조회
POST   /api/data      - 데이터 저장
DELETE /api/data/:id  - 데이터 삭제
PUT    /api/data/:id  - 데이터 수정
```

#### 확장된 API
```
환자 관리
GET    /api/patients           - 환자 목록 조회
POST   /api/patients           - 환자 등록
GET    /api/patients/:id       - 환자 상세 조회
PUT    /api/patients/:id       - 환자 정보 수정
DELETE /api/patients/:id       - 환자 삭제

검진 유형 관리
GET    /api/checkup-types      - 검진 유형 목록
POST   /api/checkup-types      - 검진 유형 추가
PUT    /api/checkup-types/:id  - 검진 유형 수정

검진 기록 관리
GET    /api/checkups           - 검진 기록 목록
POST   /api/checkups           - 검진 예약/기록
GET    /api/checkups/:id       - 검진 상세 조회
PUT    /api/checkups/:id       - 검진 기록 수정
DELETE /api/checkups/:id       - 검진 기록 삭제

검진 항목 관리
GET    /api/checkups/:id/items     - 검진 항목 목록
POST   /api/checkups/:id/items     - 검진 항목 추가
PUT    /api/checkup-items/:id      - 검진 항목 수정
DELETE /api/checkup-items/:id      - 검진 항목 삭제

통계 및 분석
GET    /api/dashboard/stats        - 대시보드 통계
GET    /api/patients/:id/history   - 환자 검진 이력
GET    /api/reports/monthly        - 월간 리포트
```

## 🚀 단계적 구현 계획

### 📅 Phase 1: 기본 환자 관리 (1-2주)
- [x] 현재 시스템 분석 완료
- [ ] 환자 정보 테이블 생성
- [ ] 환자 등록/조회 API 구현
- [ ] 환자 관리 UI 개발
- [ ] IndexedDB 다중 스토어 구조 구현

### 📅 Phase 2: 검진 유형 및 예약 시스템 (2-3주)
- [ ] 검진 유형 테이블 및 기본 데이터 생성
- [ ] 검진 예약 테이블 생성
- [ ] 검진 예약/조회 API 구현
- [ ] 검진 예약 UI 개발
- [ ] 캘린더 기반 예약 시스템

### 📅 Phase 3: 검진 항목 및 결과 관리 (3-4주)
- [ ] 검진 항목 테이블 생성
- [ ] 검진 결과 입력 API 구현
- [ ] 검진 결과 입력 UI 개발
- [ ] 실시간 검진 진행 상태 관리

### 📅 Phase 4: 고급 기능 및 최적화 (2-3주)
- [ ] 검진 결과 분석 및 통계
- [ ] 대시보드 및 리포팅 시스템
- [ ] 알림 및 리마인더 기능
- [ ] 오프라인 동기화 최적화

## 💾 데이터 마이그레이션 전략

### 🔄 기존 데이터 보존 방법

#### 옵션 1: 테이블 이름 변경 (추천)
```sql
-- 기존 테이블 백업
EXEC sp_rename 'user_data', 'user_data_backup';

-- 새로운 테이블들 생성
-- (patients, checkup_types, checkups, checkup_items)

-- 필요시 기존 데이터를 새 구조로 변환
INSERT INTO patients (name, created_at, sync_status, local_id)
SELECT text, created_at, sync_status, local_id
FROM user_data_backup
WHERE text LIKE '환자:%';
```

#### 옵션 2: 점진적 마이그레이션
```sql
-- 기존 테이블 유지하면서 새 테이블 추가
-- 점진적으로 데이터 이전 후 기존 테이블 제거
```

## 🔧 기술적 고려사항

### 📱 PWA 호환성
- **IndexedDB 다중 스토어**: 복잡한 관계형 데이터 관리
- **오프라인 동기화**: 관계형 데이터의 일관성 유지
- **캐싱 전략**: 검진 데이터의 효율적 캐싱
- **Service Worker**: 대용량 의료 데이터 처리

### 🔐 보안 고려사항
- **의료 데이터 암호화**: 개인정보보호법 준수
- **접근 권한 관리**: 역할 기반 접근 제어
- **감사 로그**: 의료 데이터 접근 기록
- **HTTPS 필수**: 의료 데이터 전송 보안

### 📊 성능 최적화
- **데이터베이스 인덱싱**: 검색 성능 향상
- **페이지네이션**: 대량 데이터 처리
- **캐싱 전략**: 자주 사용되는 검진 유형 캐싱
- **압축**: 대용량 검진 결과 데이터 압축

## 🎨 UI/UX 설계

### 📋 메인 대시보드
```
┌─────────────────────────────────────────────────────────┐
│ 🏥 건강검진 관리 시스템                                  │
├─────────────────────────────────────────────────────────┤
│ 📊 오늘의 검진: 12건 | 대기중: 5건 | 완료: 7건         │
├─────────────────────────────────────────────────────────┤
│ [👥 환자관리] [📋 검진예약] [📊 결과조회] [📈 통계]     │
└─────────────────────────────────────────────────────────┘
```

### 👤 환자 관리 화면
- 환자 등록/수정 폼
- 환자 검색 및 필터링
- 환자별 검진 이력 조회

### 📅 검진 예약 화면
- 캘린더 기반 예약 시스템
- 검진 유형별 예약 관리
- 실시간 예약 현황

### 📋 검진 결과 입력 화면
- 항목별 결과 입력
- 정상 범위 자동 체크
- 실시간 저장 및 동기화

## 🔍 예상 이슈 및 해결방안

### ⚠️ 기술적 이슈
1. **복잡한 관계형 데이터의 IndexedDB 저장**
   - 해결: 정규화된 구조로 분리 저장, 조인 로직 클라이언트에서 처리

2. **오프라인 상태에서의 데이터 일관성**
   - 해결: 트랜잭션 기반 동기화, 충돌 해결 로직 강화

3. **대용량 의료 데이터 처리**
   - 해결: 페이지네이션, 레이지 로딩, 데이터 압축

### 🔐 규정 준수
1. **개인정보보호법 (PIPA)**
   - 개인 의료정보 암호화 저장
   - 접근 로그 관리
   - 데이터 보관 기간 관리

2. **의료법 관련 규정**
   - 의료기관 인증 연동
   - 의료진 자격 확인
   - 진료 기록 무결성 보장

## 📈 확장 가능성

### 🔮 향후 발전 방향
1. **AI 기반 건강 분석**
   - 검진 결과 패턴 분석
   - 질병 예측 모델
   - 개인화된 건강 권고

2. **외부 시스템 연동**
   - 병원 정보 시스템(HIS) 연동
   - 건강보험공단 API 연동
   - 웨어러블 디바이스 데이터 수집

3. **모바일 앱 확장**
   - 환자용 모바일 앱
   - 의료진용 태블릿 앱
   - 실시간 푸시 알림

## 💡 결론

현재의 단순한 텍스트 기반 시스템을 건강검진 시스템으로 확장하는 것은 **충분히 가능하며 체계적인 접근이 필요**합니다.

### ✅ 핵심 성공 요소
1. **점진적 마이그레이션**: 기존 시스템 중단 없이 단계적 확장
2. **PWA 특성 활용**: 오프라인 동작으로 현장 활용성 극대화
3. **확장 가능한 구조**: 향후 기능 추가에 유연한 아키텍처
4. **사용자 중심 설계**: 의료진 워크플로우에 최적화된 UI/UX

### 🎯 기대 효과
- **업무 효율성 향상**: 디지털화된 검진 프로세스
- **데이터 정확성**: 실시간 입력 및 검증
- **접근성 개선**: 오프라인 환경에서도 사용 가능
- **확장성**: 다양한 의료 서비스로 확장 가능

---
*설계 문서 작성일: 2025-09-29*
*설계자: Claude Code Assistant*