# 건강검진 시스템 데이터베이스 관계도

## 📊 테이블 구조 및 관계

### 1. **patients** (환자 정보 테이블)
- **기본키**: `id` (INT, IDENTITY)
- **고유키**: `patient_id` (NVARCHAR(20)) - **자동 생성**
- **자동 채번 규칙**: `P + 년도 + 3자리 일련번호`
  - 예: P2025001, P2025002, P2025003...
  - 2026년: P2026001, P2026002...

```sql
CREATE TABLE patients (
    id INT IDENTITY(1,1) PRIMARY KEY,
    patient_id NVARCHAR(20) UNIQUE NOT NULL,  -- 자동 생성
    name NVARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    gender NCHAR(1) CHECK (gender IN ('M', 'F')),
    phone NVARCHAR(20),
    email NVARCHAR(100),
    address NVARCHAR(500),
    emergency_contact NVARCHAR(200),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
```

### 2. **checkup_types** (검진 유형 테이블)
- **기본키**: `id` (INT, IDENTITY)
- **고유키**: `type_code` (NVARCHAR(20))
- **역할**: 검진 종류 마스터 데이터

```sql
CREATE TABLE checkup_types (
    id INT IDENTITY(1,1) PRIMARY KEY,
    type_code NVARCHAR(20) UNIQUE NOT NULL,
    type_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500),
    duration_minutes INT DEFAULT 60,
    is_active BIT DEFAULT 1
);
```

### 3. **checkups** (검진 기록 테이블)
- **기본키**: `id` (INT, IDENTITY)
- **고유키**: `checkup_no` (NVARCHAR(30))
- **외래키 관계**:
  - `patient_id` → `patients.id` (N:1)
  - `checkup_type_id` → `checkup_types.id` (N:1)

```sql
CREATE TABLE checkups (
    id INT IDENTITY(1,1) PRIMARY KEY,
    checkup_no NVARCHAR(30) UNIQUE NOT NULL,
    patient_id INT NOT NULL,                    -- FK → patients.id
    checkup_type_id INT NOT NULL,               -- FK → checkup_types.id
    checkup_date DATE NOT NULL,
    checkup_time TIME,
    status NVARCHAR(20) DEFAULT 'scheduled',
    doctor_name NVARCHAR(100),

    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (checkup_type_id) REFERENCES checkup_types(id)
);
```

### 4. **checkup_items** (검진 항목 테이블)
- **기본키**: `id` (INT, IDENTITY)
- **외래키 관계**:
  - `checkup_id` → `checkups.id` (N:1)

```sql
CREATE TABLE checkup_items (
    id INT IDENTITY(1,1) PRIMARY KEY,
    checkup_id INT NOT NULL,                    -- FK → checkups.id
    item_category NVARCHAR(50) NOT NULL,
    item_name NVARCHAR(100) NOT NULL,
    item_value NVARCHAR(200),
    reference_range NVARCHAR(100),
    unit NVARCHAR(20),
    status NVARCHAR(20),

    FOREIGN KEY (checkup_id) REFERENCES checkups(id)
);
```

## 🔗 테이블 관계도

```
┌─────────────────┐       ┌──────────────────┐
│    patients     │       │  checkup_types   │
│                 │       │                  │
│ 🔑 id (PK)      │       │ 🔑 id (PK)       │
│ 🆔 patient_id   │       │ 🏷️ type_code     │
│ 👤 name         │       │ 📝 type_name     │
│ 🎂 birth_date   │       │ 📄 description   │
│ ⚥ gender        │       │ ⏱️ duration      │
│ 📱 phone        │       └──────────────────┘
│ 📧 email        │                │
│ 🏠 address      │                │
└─────────────────┘                │
        │                          │
        │ 1:N                      │ 1:N
        │                          │
        ▼                          │
┌─────────────────┐                │
│    checkups     │◀───────────────┘
│                 │
│ 🔑 id (PK)      │
│ 🏷️ checkup_no   │
│ 👤 patient_id   │ (FK → patients.id)
│ 🏥 checkup_type_id│ (FK → checkup_types.id)
│ 📅 checkup_date │
│ ⏰ checkup_time │
│ 📊 status       │
│ 👨‍⚕️ doctor_name │
└─────────────────┘
        │
        │ 1:N
        ▼
┌─────────────────┐
│ checkup_items   │
│                 │
│ 🔑 id (PK)      │
│ 🏥 checkup_id   │ (FK → checkups.id)
│ 📂 item_category│
│ 📝 item_name    │
│ 📊 item_value   │
│ 📏 reference_range│
│ 📐 unit         │
│ ✅ status       │
└─────────────────┘
```

## 🎯 핵심 관계 설명

### 1. **환자 ↔ 검진 관계 (1:N)**
- 한 명의 환자는 여러 번의 검진을 받을 수 있음
- `patients.id` ← `checkups.patient_id`

### 2. **검진유형 ↔ 검진 관계 (1:N)**
- 하나의 검진 유형으로 여러 검진이 가능함
- `checkup_types.id` ← `checkups.checkup_type_id`

### 3. **검진 ↔ 검진항목 관계 (1:N)**
- 하나의 검진에는 여러 검진 항목이 포함됨
- `checkups.id` ← `checkup_items.checkup_id`

## 🔐 patient_id 자동 생성 로직

### 서버 API에서 구현:
```javascript
// 1. 현재 연도 가져오기
const currentYear = new Date().getFullYear();

// 2. 해당 연도의 마지막 일련번호 조회
const sequenceResult = await request.query(`
    SELECT MAX(CAST(RIGHT(patient_id, 3) AS INT)) as last_sequence
    FROM patients
    WHERE patient_id LIKE 'P${currentYear}%'
`);

// 3. 새로운 일련번호 생성
const lastSequence = sequenceResult.recordset[0].last_sequence || 0;
const newSequence = (lastSequence + 1).toString().padStart(3, '0');
const patient_id = `P${currentYear}${newSequence}`;
```

### 생성 예시:
- 2025년 첫 번째 환자: **P2025001**
- 2025년 두 번째 환자: **P2025002**
- 2026년 첫 번째 환자: **P2026001**

## 📋 주요 특징

1. **자동 채번**: 환자번호가 자동으로 생성되어 중복 방지
2. **연도별 관리**: 연도별로 일련번호가 새로 시작
3. **참조 무결성**: 외래키 제약으로 데이터 일관성 보장
4. **PWA 지원**: 오프라인 동기화를 위한 필드 포함
5. **확장 가능**: 새로운 검진 유형과 항목 추가 용이

## 🎯 사용자 인터페이스에서의 변화

### 이전:
- 환자 등록 시 환자번호를 직접 입력

### 현재:
- 환자 등록 시 환자번호 입력 필드 제거
- 서버에서 자동으로 P+년도+일련번호 형태로 생성
- 등록 완료 후 생성된 환자번호를 응답으로 반환