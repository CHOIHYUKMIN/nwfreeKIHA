const sql = require('mssql');
const { config } = require('./mssql-config');

async function initHealthCheckupDatabase() {
    try {
        console.log('🏥 건강검진 데이터베이스 초기화를 시작합니다...');

        // 데이터베이스에 연결
        const pool = await sql.connect(config);
        console.log('✅ MSSQL 서버에 연결되었습니다.');

        // PWAPOC 데이터베이스 사용
        await pool.request().query('USE PWAPOC');

        // 1. 환자 정보 테이블 생성
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[patients]') AND type in (N'U'))
            BEGIN
                CREATE TABLE patients (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    patient_id NVARCHAR(20) UNIQUE NOT NULL,
                    name NVARCHAR(100) NOT NULL,
                    birth_date DATE NOT NULL,
                    gender NCHAR(1) CHECK (gender IN ('M', 'F')),
                    phone NVARCHAR(20),
                    email NVARCHAR(100),
                    address NVARCHAR(500),
                    emergency_contact NVARCHAR(200),
                    created_at DATETIME2 DEFAULT GETDATE(),
                    updated_at DATETIME2 DEFAULT GETDATE(),

                    -- PWA 동기화 필드
                    sync_status NVARCHAR(20) DEFAULT 'synced',
                    local_id NVARCHAR(50),
                    is_offline_created BIT DEFAULT 0,
                    conflict_resolved BIT DEFAULT 0
                );
                PRINT '✅ patients 테이블이 생성되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '📋 patients 테이블이 이미 존재합니다.';
            END
        `);

        // 2. 검진 유형 테이블 생성
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[checkup_types]') AND type in (N'U'))
            BEGIN
                CREATE TABLE checkup_types (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    type_code NVARCHAR(20) UNIQUE NOT NULL,
                    type_name NVARCHAR(100) NOT NULL,
                    description NVARCHAR(500),
                    duration_minutes INT DEFAULT 60,
                    is_active BIT DEFAULT 1,
                    created_at DATETIME2 DEFAULT GETDATE()
                );
                PRINT '✅ checkup_types 테이블이 생성되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '📋 checkup_types 테이블이 이미 존재합니다.';
            END
        `);

        // 3. 검진 기록 테이블 생성
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[checkups]') AND type in (N'U'))
            BEGIN
                CREATE TABLE checkups (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    checkup_no NVARCHAR(30) UNIQUE NOT NULL,
                    patient_id INT NOT NULL,
                    checkup_type_id INT NOT NULL,
                    checkup_date DATE NOT NULL,
                    checkup_time TIME,
                    status NVARCHAR(20) DEFAULT 'scheduled',
                    doctor_name NVARCHAR(100),
                    notes NVARCHAR(1000),
                    total_score INT,
                    risk_level NVARCHAR(20),

                    -- 검진 결과 요약
                    result_summary NVARCHAR(MAX),
                    recommendations NVARCHAR(MAX),
                    next_checkup_date DATE,

                    created_at DATETIME2 DEFAULT GETDATE(),
                    updated_at DATETIME2 DEFAULT GETDATE(),
                    completed_at DATETIME2,

                    -- PWA 동기화 필드
                    sync_status NVARCHAR(20) DEFAULT 'synced',
                    local_id NVARCHAR(50),
                    is_offline_created BIT DEFAULT 0,
                    conflict_resolved BIT DEFAULT 0,

                    FOREIGN KEY (patient_id) REFERENCES patients(id),
                    FOREIGN KEY (checkup_type_id) REFERENCES checkup_types(id)
                );
                PRINT '✅ checkups 테이블이 생성되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '📋 checkups 테이블이 이미 존재합니다.';
            END
        `);

        // 4. 검진 항목 테이블 생성
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[checkup_items]') AND type in (N'U'))
            BEGIN
                CREATE TABLE checkup_items (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    checkup_id INT NOT NULL,
                    item_category NVARCHAR(50) NOT NULL,
                    item_name NVARCHAR(100) NOT NULL,
                    item_value NVARCHAR(200),
                    reference_range NVARCHAR(100),
                    unit NVARCHAR(20),
                    status NVARCHAR(20),
                    notes NVARCHAR(500),
                    measured_at DATETIME2,
                    created_at DATETIME2 DEFAULT GETDATE(),

                    -- PWA 동기화 필드
                    sync_status NVARCHAR(20) DEFAULT 'synced',
                    local_id NVARCHAR(50),
                    is_offline_created BIT DEFAULT 0,

                    FOREIGN KEY (checkup_id) REFERENCES checkups(id)
                );
                PRINT '✅ checkup_items 테이블이 생성되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '📋 checkup_items 테이블이 이미 존재합니다.';
            END
        `);

        // 5. 기본 검진 유형 데이터 삽입
        await pool.request().query(`
            IF NOT EXISTS (SELECT TOP 1 * FROM checkup_types)
            BEGIN
                INSERT INTO checkup_types (type_code, type_name, description, duration_minutes) VALUES
                ('GEN', '일반건강검진', '기본적인 건강상태 점검', 90),
                ('COM', '종합건강검진', '심화된 전반적 건강상태 검사', 180),
                ('CAR', '심혈관검진', '심장 및 혈관 건강 집중 검사', 120),
                ('CAN', '암검진', '각종 암 조기 발견 검사', 150),
                ('WOM', '여성건강검진', '여성 특화 건강검사', 120),
                ('SEN', '노인건강검진', '고령자 특화 건강검사', 100);
                PRINT '✅ 기본 검진 유형 데이터가 삽입되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '📋 검진 유형 데이터가 이미 존재합니다.';
            END
        `);

        // 6. 샘플 환자 데이터 삽입
        await pool.request().query(`
            IF NOT EXISTS (SELECT TOP 1 * FROM patients)
            BEGIN
                INSERT INTO patients (patient_id, name, birth_date, gender, phone, email, address, emergency_contact) VALUES
                ('P2025001', '김건강', '1985-03-15', 'M', '010-1234-5678', 'kim@email.com', '서울시 강남구 테헤란로 123', '010-9876-5432'),
                ('P2025002', '이튼튼', '1990-07-22', 'F', '010-2345-6789', 'lee@email.com', '서울시 서초구 서초대로 456', '010-8765-4321'),
                ('P2025003', '박안전', '1978-11-08', 'M', '010-3456-7890', 'park@email.com', '경기도 성남시 분당구 정자로 789', '010-7654-3210'),
                ('P2025004', '최웰니스', '1995-05-30', 'F', '010-4567-8901', 'choi@email.com', '부산시 해운대구 해운대로 321', '010-6543-2109'),
                ('P2025005', '정헬스', '1982-09-14', 'M', '010-5678-9012', 'jung@email.com', '대구시 수성구 동대구로 654', '010-5432-1098');
                PRINT '✅ 샘플 환자 데이터가 삽입되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '📋 환자 데이터가 이미 존재합니다.';
            END
        `);

        // 7. 샘플 검진 기록 데이터 삽입
        await pool.request().query(`
            IF NOT EXISTS (SELECT TOP 1 * FROM checkups)
            BEGIN
                INSERT INTO checkups (checkup_no, patient_id, checkup_type_id, checkup_date, checkup_time, status, doctor_name, notes, total_score, risk_level) VALUES
                ('CHK2025001', 1, 1, '2025-09-29', '09:00:00', 'completed', '김의사', '정상 소견', 85, 'low'),
                ('CHK2025002', 2, 2, '2025-09-29', '10:30:00', 'in_progress', '이의사', '진행 중', NULL, NULL),
                ('CHK2025003', 3, 3, '2025-09-30', '14:00:00', 'scheduled', '박의사', '심혈관 정밀검사 예정', NULL, NULL),
                ('CHK2025004', 4, 4, '2025-10-01', '11:00:00', 'scheduled', '최의사', '암검진 예약', NULL, NULL),
                ('CHK2025005', 1, 1, '2025-10-02', '15:30:00', 'scheduled', '김의사', '정기검진', NULL, NULL);
                PRINT '✅ 샘플 검진 기록 데이터가 삽입되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '📋 검진 기록 데이터가 이미 존재합니다.';
            END
        `);

        // 8. 샘플 검진 항목 데이터 삽입
        await pool.request().query(`
            IF NOT EXISTS (SELECT TOP 1 * FROM checkup_items)
            BEGIN
                INSERT INTO checkup_items (checkup_id, item_category, item_name, item_value, reference_range, unit, status, notes) VALUES
                -- 검진 ID 1 (김건강 - 완료된 검진)
                (1, '신체계측', '신장', '175', '160-190', 'cm', 'normal', '정상'),
                (1, '신체계측', '체중', '72', '55-85', 'kg', 'normal', '정상'),
                (1, '신체계측', 'BMI', '23.5', '18.5-24.9', 'kg/m²', 'normal', '정상 범위'),
                (1, '혈압', '수축기혈압', '120', '90-139', 'mmHg', 'normal', '정상'),
                (1, '혈압', '이완기혈압', '80', '60-89', 'mmHg', 'normal', '정상'),
                (1, '혈액검사', '총콜레스테롤', '180', '<200', 'mg/dL', 'normal', '정상'),
                (1, '혈액검사', '혈당', '95', '70-99', 'mg/dL', 'normal', '정상'),
                (1, '혈액검사', '헤모글로빈', '14.5', '13.5-17.5', 'g/dL', 'normal', '정상'),

                -- 검진 ID 2 (이튼튼 - 진행 중)
                (2, '신체계측', '신장', '162', '160-190', 'cm', 'normal', '정상'),
                (2, '신체계측', '체중', '58', '45-70', 'kg', 'normal', '정상'),
                (2, '혈압', '수축기혈압', '110', '90-139', 'mmHg', 'normal', '정상'),
                (2, '혈압', '이완기혈압', '75', '60-89', 'mmHg', 'normal', '정상');
                PRINT '✅ 샘플 검진 항목 데이터가 삽입되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '📋 검진 항목 데이터가 이미 존재합니다.';
            END
        `);

        console.log('✅ 건강검진 데이터베이스 초기화가 완료되었습니다!');
        console.log('📊 테이블 정보:');

        // 테이블 정보 조회
        const tablesResult = await pool.request().query(`
            SELECT
                t.TABLE_NAME,
                ISNULL(p.rows, 0) as TABLE_ROWS
            FROM INFORMATION_SCHEMA.TABLES t
            LEFT JOIN sys.partitions p ON p.object_id = OBJECT_ID(t.TABLE_NAME) AND p.index_id IN (0,1)
            WHERE t.TABLE_TYPE = 'BASE TABLE' AND t.TABLE_NAME IN ('patients', 'checkup_types', 'checkups', 'checkup_items', 'user_data')
            ORDER BY t.TABLE_NAME
        `);

        tablesResult.recordset.forEach(table => {
            console.log(`   - ${table.TABLE_NAME}: ${table.TABLE_ROWS || 0} 행`);
        });

        await pool.close();

    } catch (err) {
        console.error('❌ 건강검진 데이터베이스 초기화 실패:', err);
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    initHealthCheckupDatabase();
}

module.exports = { initHealthCheckupDatabase };