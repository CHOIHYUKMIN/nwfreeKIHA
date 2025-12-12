const express = require('express');
const cors = require('cors');
const { sql, pool, poolConnect } = require('./mssql-config');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 정적 파일 서빙 설정
app.use(express.static(__dirname));

// 루트 경로 - index.html 서빙
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 헬스체크 엔드포인트
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// MSSQL 연결 확인
const initializeDatabase = async () => {
    try {
        
        await poolConnect;
        console.log('✅ MSSQL 데이터베이스에 연결되었습니다.');
        
        // 연결 상태 확인
        const request = pool.request();
        const result = await request.query('SELECT @@VERSION as version');
        console.log('📊 SQL Server 버전:', result.recordset[0].version.substring(0, 100) + '...');
        
    } catch (err) {
        console.error('❌ 데이터베이스 연결 실패:', err.message);
        console.error('🔍 상세 오류:', err);
        process.exit(1);
    }
};

// 테스트용 통계 라우트
app.get('/api/stats', async (req, res) => {
    try {
        const request = pool.request();
        const result = await request.query('SELECT COUNT(*) as total FROM user_data');
        res.json({ totalData: result.recordset[0].total });
    } catch (err) {
        console.error('통계 조회 실패:', err.message);
        res.status(500).json({ error: '통계 조회 실패' });
    }
});

// 데이터 조회 API
app.get('/api/data', async (req, res) => {
    try {
        const request = pool.request();
        const result = await request.query('SELECT * FROM user_data ORDER BY created_at DESC');
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('데이터 조회 실패:', err.message);
        res.status(500).json({ success: false, error: '데이터 조회 실패' });
    }
});

// 데이터 저장 API
app.post('/api/data', async (req, res) => {
    try {
        const { text, timestamp, is_online } = req.body;
        console.log('📝 저장 요청 데이터:', { text, timestamp, is_online });
        
        const request = pool.request();
        const result = await request
        .input('text', sql.NVarChar, text)
        .input('isOnline', sql.Bit, is_online ? 1 : 0)
        .input('isOfflineCreated', sql.Bit, is_online ? 0 : 1)
        .query(`
            INSERT INTO user_data (text, timestamp, is_online, sync_status, sync_direction, is_offline_created)
            OUTPUT INSERTED.id
            VALUES (@text, SYSDATETIME(), @isOnline, 'synced', 'none', @isOfflineCreated)
        `);
        
        console.log('✅ 데이터 저장 성공:', result.recordset[0]);
        
        res.json({ 
            success: true, 
            id: result.recordset[0].id,
            message: '데이터가 저장되었습니다.' 
        });
    } catch (err) {
        console.error('❌ 데이터 저장 실패:', err.message);
        console.error('🔍 상세 오류:', err);
        res.status(500).json({ success: false, error: '데이터 저장 실패' });
    }
});

// 데이터 삭제 API
app.delete('/api/data/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const request = pool.request();
        await request
            .input('id', sql.Int, parseInt(id))
            .query('DELETE FROM user_data WHERE id = @id');
        res.json({ success: true, message: '데이터가 삭제되었습니다.' });
    } catch (err) {
        console.error('데이터 삭제 실패:', err.message);
        res.status(500).json({ success: false, error: '데이터 삭제 실패' });
    }
});

// 데이터 수정 API
app.put('/api/data/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { text, timestamp, is_online } = req.body;
        
        console.log('📝 수정 요청 데이터:', { id, text, timestamp, is_online });
        
        const request = pool.request();
        const result = await request
            .input('id', sql.Int, parseInt(id))
            .input('text', sql.NVarChar, text)
            .input('isOnline', sql.Bit, is_online ? 1 : 0)
            .query(`
                UPDATE user_data 
                SET text = @text, timestamp = SYSDATETIME(), is_online = @isOnline
                WHERE id = @id
            `);
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, error: '수정할 데이터를 찾을 수 없습니다.' });
        }
        
        console.log('✅ 데이터 수정 성공:', id);
        
        res.json({ 
            success: true, 
            id: parseInt(id),
            message: '데이터가 수정되었습니다.' 
        });
    } catch (err) {
        console.error('❌ 데이터 수정 실패:', err.message);
        console.error('🔍 상세 오류:', err);
        res.status(500).json({ success: false, error: '데이터 수정 실패' });
    }
});

// 전체 데이터 삭제 API
app.delete('/api/data', async (req, res) => {
    try {
        const request = pool.request();
        await request.query('DELETE FROM user_data');
        res.json({ success: true, message: '모든 데이터가 삭제되었습니다.' });
    } catch (err) {
        console.error('전체 데이터 삭제 실패:', err.message);
        res.status(500).json({ success: false, error: '전체 데이터 삭제 실패' });
    }
});

// 오프라인 데이터 동기화 API
app.post('/api/sync/offline-data', async (req, res) => {
    try {
        const { offlineData } = req.body;
        let successCount = 0;
        let updateCount = 0;
        
        console.log('🔄 동기화 요청 데이터:', offlineData);
        
        for (const data of offlineData) {
            try {
                const request = pool.request();
                
                // 수정된 데이터인지 확인 (서버 ID가 있고 sync_direction이 'to_server'인 경우)
                if (data.id && data.sync_direction === 'to_server') {
                    console.log(`📝 수정된 데이터 동기화: ID ${data.id}, 텍스트: ${data.text}`);
                    
                    // 수정된 데이터인 경우 UPDATE
                    const result = await request
                        .input('id', sql.Int, parseInt(data.id))
                        .input('text', sql.NVarChar, data.text)
                        .input('isOnline', sql.Bit, data.is_online ? 1 : 0)
                        .query(`
                            UPDATE user_data 
                            SET text = @text, timestamp = SYSDATETIME(), is_online = @isOnline
                            WHERE id = @id
                        `);
                    
                    if (result.rowsAffected[0] > 0) {
                        updateCount++;
                        console.log(`✅ 데이터 수정 동기화 성공: ID ${data.id}`);
                    } else {
                        console.log(`⚠️ 수정할 데이터를 찾을 수 없음: ID ${data.id}`);
                    }
                } else {
                    console.log(`🆕 새 데이터 동기화: 텍스트: ${data.text}, Local ID: ${data.localId}`);
                    
                    // 새로운 데이터인 경우 INSERT
                    await request
                        .input('text', sql.NVarChar, data.text)
                        .input('isOnline', sql.Bit, data.is_online ? 1 : 0)
                        .input('localId', sql.Int, data.localId)
                        .query(`
                            INSERT INTO user_data (text, timestamp, is_online, sync_status, sync_direction, is_offline_created, local_id)
                            VALUES (@text, SYSDATETIME(), @isOnline, 'synced', 'to_server', 1, @localId)
                        `);
                    successCount++;
                    console.log(`✅ 새 데이터 동기화 성공: Local ID ${data.localId}`);
                }
            } catch (error) {
                console.error(`❌ 데이터 ${data.localId || data.id} 동기화 실패:`, error);
            }
        }
        
        console.log(`📊 동기화 완료: 새 데이터 ${successCount}개, 수정 데이터 ${updateCount}개`);
        
        res.json({ 
            success: true, 
            successCount: successCount,
            updateCount: updateCount,
            message: `${successCount}개 새 데이터, ${updateCount}개 수정 데이터가 동기화되었습니다.` 
        });
    } catch (err) {
        console.error('❌ 오프라인 데이터 동기화 실패:', err.message);
        res.status(500).json({ success: false, error: '동기화 실패' });
    }
});

// ===== 건강검진 시스템 API =====

// 환자 목록 조회
app.get('/api/patients', async (req, res) => {
    try {
        const request = pool.request();
        const result = await request.query(`
            SELECT
                p.*,
                COUNT(c.id) as total_checkups,
                MAX(c.checkup_date) as last_checkup_date
            FROM patients p
            LEFT JOIN checkups c ON p.id = c.patient_id
            GROUP BY p.id, p.patient_id, p.name, p.birth_date, p.gender, p.phone, p.email, p.address, p.emergency_contact, p.created_at, p.updated_at, p.sync_status, p.local_id, p.is_offline_created, p.conflict_resolved
            ORDER BY p.created_at DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('환자 목록 조회 실패:', err.message);
        res.status(500).json({ success: false, error: '환자 목록 조회 실패' });
    }
});

// 환자 상세 조회
app.get('/api/patients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const request = pool.request();

        // 환자 기본 정보
        const patientResult = await request
            .input('patientId', sql.Int, id)
            .query('SELECT * FROM patients WHERE id = @patientId');

        if (patientResult.recordset.length === 0) {
            return res.status(404).json({ success: false, error: '환자를 찾을 수 없습니다.' });
        }

        // 환자의 검진 이력
        const checkupsResult = await request
            .input('patientId2', sql.Int, id)
            .query(`
                SELECT
                    c.*,
                    ct.type_name,
                    ct.type_code,
                    ct.description as type_description
                FROM checkups c
                LEFT JOIN checkup_types ct ON c.checkup_type_id = ct.id
                WHERE c.patient_id = @patientId2
                ORDER BY c.checkup_date DESC
            `);

        res.json({
            success: true,
            patient: patientResult.recordset[0],
            checkups: checkupsResult.recordset
        });
    } catch (err) {
        console.error('환자 상세 조회 실패:', err.message);
        res.status(500).json({ success: false, error: '환자 상세 조회 실패' });
    }
});

// 환자 등록
app.post('/api/patients', async (req, res) => {
    try {
        const { name, birth_date, gender, phone, email, address, emergency_contact, uuid } = req.body;

        let patient_id = req.body.patient_id;
        let result;

        // UUID(local_id)가 있으면 기존 환자 확인 (중복 방지)
        if (uuid) {
            const checkRequest = pool.request();
            const existingCheck = await checkRequest
                .input('uuid', sql.NVarChar, uuid)
                .query('SELECT * FROM patients WHERE local_id = @uuid');

            if (existingCheck.recordset.length > 0) {
                // 기존 환자 UPDATE
                const existing = existingCheck.recordset[0];
                const updateRequest = pool.request();
                result = await updateRequest
                    .input('id', sql.Int, existing.id)
                    .input('name', sql.NVarChar, name)
                    .input('birthDate', sql.Date, birth_date)
                    .input('gender', sql.NChar, gender)
                    .input('phone', sql.NVarChar, phone)
                    .input('email', sql.NVarChar, email)
                    .input('address', sql.NVarChar, address)
                    .input('emergencyContact', sql.NVarChar, emergency_contact)
                    .query(`
                        UPDATE patients
                        SET name = @name,
                            birth_date = @birthDate,
                            gender = @gender,
                            phone = @phone,
                            email = @email,
                            address = @address,
                            emergency_contact = @emergencyContact,
                            updated_at = GETDATE()
                        OUTPUT INSERTED.*
                        WHERE id = @id
                    `);

                console.log(`✅ 환자 업데이트 (UUID: ${uuid})`);
                return res.json({
                    success: true,
                    data: result.recordset[0],
                    patient: result.recordset[0],
                    message: '환자 정보가 업데이트되었습니다.',
                    isUpdate: true
                });
            }
        }

        // 신규 환자 INSERT
        // patient_id 자동 생성 (P+년도+3자리 일련번호)
        if (!patient_id || patient_id.startsWith('TEMP_')) {
            const currentYear = new Date().getFullYear();
            const request = pool.request();

            // 해당 연도의 마지막 일련번호 조회
            const sequenceResult = await request.query(`
                SELECT MAX(CAST(RIGHT(patient_id, 3) AS INT)) as last_sequence
                FROM patients
                WHERE patient_id LIKE 'P${currentYear}%'
            `);

            const lastSequence = sequenceResult.recordset[0].last_sequence || 0;
            const newSequence = (lastSequence + 1).toString().padStart(3, '0');
            patient_id = `P${currentYear}${newSequence}`;
        }

        const insertRequest = pool.request();
        result = await insertRequest
            .input('patientId', sql.NVarChar, patient_id)
            .input('name', sql.NVarChar, name)
            .input('birthDate', sql.Date, birth_date)
            .input('gender', sql.NChar, gender)
            .input('phone', sql.NVarChar, phone)
            .input('email', sql.NVarChar, email)
            .input('address', sql.NVarChar, address)
            .input('emergencyContact', sql.NVarChar, emergency_contact)
            .input('uuid', sql.NVarChar, uuid || null)
            .query(`
                INSERT INTO patients (patient_id, name, birth_date, gender, phone, email, address, emergency_contact, local_id)
                OUTPUT INSERTED.*
                VALUES (@patientId, @name, @birthDate, @gender, @phone, @email, @address, @emergencyContact, @uuid)
            `);

        const insertedPatient = result.recordset[0];

        console.log(`✅ 환자 등록 (UUID: ${uuid})`);
        res.json({
            success: true,
            data: insertedPatient,
            patient: insertedPatient,
            message: '환자가 등록되었습니다.',
            isUpdate: false
        });
    } catch (err) {
        console.error('환자 등록/업데이트 실패:', err.message);
        res.status(500).json({ success: false, error: '환자 등록/업데이트 실패' });
    }
});

// 검진 유형 목록 조회
app.get('/api/checkup-types', async (req, res) => {
    try {
        const request = pool.request();
        const result = await request.query('SELECT * FROM checkup_types WHERE is_active = 1 ORDER BY type_name');
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('검진 유형 조회 실패:', err.message);
        res.status(500).json({ success: false, error: '검진 유형 조회 실패' });
    }
});

// 검진 기록 목록 조회
app.get('/api/checkups', async (req, res) => {
    try {
        const request = pool.request();
        const result = await request.query(`
            SELECT
                c.*,
                p.name as patient_name,
                p.patient_id,
                ct.type_name,
                ct.type_code
            FROM checkups c
            LEFT JOIN patients p ON c.patient_id = p.id
            LEFT JOIN checkup_types ct ON c.checkup_type_id = ct.id
            ORDER BY c.checkup_date DESC, c.checkup_time DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('검진 기록 조회 실패:', err.message);
        res.status(500).json({ success: false, error: '검진 기록 조회 실패' });
    }
});

// 모든 검진 항목 조회 (전체 데이터 동기화용) - 라우트 순서 중요: :id 보다 먼저 정의
app.get('/api/checkups/all-items', async (req, res) => {
    try {
        const request = pool.request();
        const result = await request.query(`
            SELECT ci.*, c.checkup_no, c.patient_id, p.name as patient_name
            FROM checkup_items ci
            LEFT JOIN checkups c ON ci.checkup_id = c.id
            LEFT JOIN patients p ON c.patient_id = p.id
            ORDER BY ci.checkup_id, ci.item_category, ci.item_name
        `);

        res.json({
            success: true,
            data: result.recordset
        });
    } catch (err) {
        console.error('모든 검진 항목 조회 실패:', err.message);
        res.status(500).json({ success: false, error: '검진 항목 조회 실패' });
    }
});

// 검진 상세 조회 (모든 탭 데이터)
app.get('/api/checkups/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // ID 유효성 검사
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) {
            return res.status(400).json({
                success: false,
                error: '유효하지 않은 검진 ID입니다. (임시 저장 데이터는 오프라인 모드에서만 조회 가능합니다.)'
            });
        }

        const request = pool.request();

        // 검진 기본 정보
        const checkupResult = await request
            .input('checkupId', sql.Int, parsedId)
            .query(`
                SELECT
                    c.*,
                    p.name as patient_name,
                    p.patient_id,
                    p.birth_date,
                    p.gender,
                    p.phone,
                    p.email,
                    ct.type_name,
                    ct.type_code,
                    ct.description as type_description,
                    ct.duration_minutes
                FROM checkups c
                LEFT JOIN patients p ON c.patient_id = p.id
                LEFT JOIN checkup_types ct ON c.checkup_type_id = ct.id
                WHERE c.id = @checkupId
            `);

        if (checkupResult.recordset.length === 0) {
            return res.status(404).json({ success: false, error: '검진 기록을 찾을 수 없습니다.' });
        }

        // 검진 항목들
        const itemsResult = await request
            .input('checkupId2', sql.Int, id)
            .query(`
                SELECT * FROM checkup_items
                WHERE checkup_id = @checkupId2
                ORDER BY item_category, item_name
            `);

        res.json({
            success: true,
            checkup: checkupResult.recordset[0],
            items: itemsResult.recordset
        });
    } catch (err) {
        console.error('검진 상세 조회 실패:', err.message);
        res.status(500).json({ success: false, error: '검진 상세 조회 실패' });
    }
});

// 검진 예약/기록 생성
app.post('/api/checkups', async (req, res) => {
    try {
        const {
            patient_id, checkup_type_id, checkup_date,
            checkup_time, doctor_name, notes, uuid
        } = req.body;

        let checkup_no = req.body.checkup_no;
        let result;

        // UUID(local_id)가 있으면 기존 검진 확인 (중복 방지)
        if (uuid) {
            const checkRequest = pool.request();
            const existingCheck = await checkRequest
                .input('uuid', sql.NVarChar, uuid)
                .query('SELECT * FROM checkups WHERE local_id = @uuid');

            if (existingCheck.recordset.length > 0) {
                // 기존 검진 UPDATE
                const existing = existingCheck.recordset[0];
                const updateRequest = pool.request();
                result = await updateRequest
                    .input('id', sql.Int, existing.id)
                    .input('patientId', sql.Int, patient_id)
                    .input('checkupTypeId', sql.Int, checkup_type_id)
                    .input('checkupDate', sql.Date, checkup_date)
                    .input('checkupTime', sql.NVarChar, checkup_time)
                    .input('doctorName', sql.NVarChar, doctor_name)
                    .input('notes', sql.NVarChar, notes)
                    .query(`
                        UPDATE checkups
                        SET patient_id = @patientId,
                            checkup_type_id = @checkupTypeId,
                            checkup_date = @checkupDate,
                            checkup_time = ${checkup_time ? `CAST(@checkupTime AS TIME)` : 'NULL'},
                            doctor_name = @doctorName,
                            notes = @notes,
                            updated_at = GETDATE()
                        OUTPUT INSERTED.*
                        WHERE id = @id
                    `);

                console.log(`✅ 검진 업데이트 (UUID: ${uuid})`);
                return res.json({
                    success: true,
                    data: result.recordset[0],
                    checkup: result.recordset[0],
                    message: '검진 정보가 업데이트되었습니다.',
                    isUpdate: true
                });
            }
        }

        // 신규 검진 INSERT
        // checkup_no 자동 생성 (CHK+년도+일련번호)
        if (!checkup_no || checkup_no.startsWith('TEMP_')) {
            const currentYear = new Date().getFullYear();
            const request = pool.request();

            // 해당 연도의 마지막 일련번호 조회
            const sequenceResult = await request.query(`
                SELECT MAX(CAST(RIGHT(checkup_no, 3) AS INT)) as last_sequence
                FROM checkups
                WHERE checkup_no LIKE 'CHK${currentYear}%'
            `);

            const lastSequence = sequenceResult.recordset[0].last_sequence || 0;
            const newSequence = (lastSequence + 1).toString().padStart(3, '0');
            checkup_no = `CHK${currentYear}${newSequence}`;
        }

        const insertRequest = pool.request();
        result = await insertRequest
            .input('checkupNo', sql.NVarChar, checkup_no)
            .input('patientId', sql.Int, patient_id)
            .input('checkupTypeId', sql.Int, checkup_type_id)
            .input('checkupDate', sql.Date, checkup_date)
            .input('checkupTime', sql.NVarChar, checkup_time)
            .input('doctorName', sql.NVarChar, doctor_name)
            .input('notes', sql.NVarChar, notes)
            .input('uuid', sql.NVarChar, uuid || null)
            .query(`
                INSERT INTO checkups (checkup_no, patient_id, checkup_type_id, checkup_date, checkup_time, doctor_name, notes, local_id)
                OUTPUT INSERTED.*
                VALUES (@checkupNo, @patientId, @checkupTypeId, @checkupDate,
                    ${checkup_time ? `CAST(@checkupTime AS TIME)` : 'NULL'},
                    @doctorName, @notes, @uuid)
            `);

        const insertedCheckup = result.recordset[0];

        console.log(`✅ 검진 등록 (UUID: ${uuid})`);
        res.json({
            success: true,
            data: insertedCheckup,
            checkup: insertedCheckup,
            message: '검진이 예약되었습니다.',
            isUpdate: false
        });
    } catch (err) {
        console.error('검진 예약/업데이트 실패:', err.message);
        res.status(500).json({ success: false, error: '검진 예약/업데이트 실패' });
    }
});

// 검진 항목 추가/수정
app.post('/api/checkups/:id/items', async (req, res) => {
    try {
        const { id } = req.params;
        const { items } = req.body; // 배열로 여러 항목 처리

        // 트랜잭션 시작
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);

            // 기존 항목들 삭제
            await request
                .input('checkupId', sql.Int, id)
                .query('DELETE FROM checkup_items WHERE checkup_id = @checkupId');

            let successCount = 0;

            // 새 항목들 삽입 (UUID 포함)
            for (const item of items) {
                try {
                    const itemRequest = new sql.Request(transaction);

                    // UUID가 있으면 기존 항목 확인 (중복 방지)
                    let existingItem = null;
                    if (item.uuid) {
                        const checkRequest = new sql.Request(transaction);
                        const existingCheck = await checkRequest
                            .input('uuid', sql.NVarChar, item.uuid)
                            .query('SELECT * FROM checkup_items WHERE local_id = @uuid');

                        if (existingCheck.recordset.length > 0) {
                            existingItem = existingCheck.recordset[0];
                        }
                    }

                    if (existingItem) {
                        // 기존 항목 UPDATE
                        await itemRequest
                            .input('id', sql.Int, existingItem.id)
                            .input('checkupId', sql.Int, id)
                            .input('itemCategory', sql.NVarChar, item.item_category)
                            .input('itemName', sql.NVarChar, item.item_name)
                            .input('itemValue', sql.NVarChar, item.item_value)
                            .input('referenceRange', sql.NVarChar, item.reference_range)
                            .input('unit', sql.NVarChar, item.unit)
                            .input('status', sql.NVarChar, item.status)
                            .input('notes', sql.NVarChar, item.notes)
                            .query(`
                                UPDATE checkup_items
                                SET checkup_id = @checkupId,
                                    item_category = @itemCategory,
                                    item_name = @itemName,
                                    item_value = @itemValue,
                                    reference_range = @referenceRange,
                                    unit = @unit,
                                    status = @status,
                                    notes = @notes,
                                    measured_at = GETDATE()
                                WHERE id = @id
                            `);
                        console.log(`✅ 검진항목 업데이트 (UUID: ${item.uuid})`);
                    } else {
                        // 신규 항목 INSERT
                        await itemRequest
                            .input('checkupId', sql.Int, id)
                            .input('itemCategory', sql.NVarChar, item.item_category)
                            .input('itemName', sql.NVarChar, item.item_name)
                            .input('itemValue', sql.NVarChar, item.item_value)
                            .input('referenceRange', sql.NVarChar, item.reference_range)
                            .input('unit', sql.NVarChar, item.unit)
                            .input('status', sql.NVarChar, item.status)
                            .input('notes', sql.NVarChar, item.notes)
                            .input('uuid', sql.NVarChar, item.uuid || null)
                            .query(`
                                INSERT INTO checkup_items (checkup_id, item_category, item_name, item_value, reference_range, unit, status, notes, measured_at, local_id)
                                VALUES (@checkupId, @itemCategory, @itemName, @itemValue, @referenceRange, @unit, @status, @notes, GETDATE(), @uuid)
                            `);
                        console.log(`✅ 검진항목 등록 (UUID: ${item.uuid})`);
                    }
                    successCount++;
                } catch (itemErr) {
                    console.error('검진 항목 저장 실패:', itemErr.message);
                    throw itemErr;
                }
            }

            // 트랜잭션 커밋
            await transaction.commit();

            res.json({
                success: true,
                successCount,
                message: `${successCount}개 항목이 저장되었습니다.`
            });
        } catch (transactionErr) {
            // 트랜잭션 롤백
            await transaction.rollback();
            throw transactionErr;
        }
    } catch (err) {
        console.error('검진 항목 저장 실패:', err.message);
        res.status(500).json({ success: false, error: '검진 항목 저장 실패' });
    }
});

// 검진 상태 업데이트
app.put('/api/checkups/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, total_score, risk_level, result_summary, recommendations } = req.body;

        const request = pool.request();
        const result = await request
            .input('checkupId', sql.Int, id)
            .input('status', sql.NVarChar, status)
            .input('totalScore', sql.Int, total_score)
            .input('riskLevel', sql.NVarChar, risk_level)
            .input('resultSummary', sql.NVarChar, result_summary)
            .input('recommendations', sql.NVarChar, recommendations)
            .query(`
                UPDATE checkups
                SET status = @status,
                    total_score = @totalScore,
                    risk_level = @riskLevel,
                    result_summary = @resultSummary,
                    recommendations = @recommendations,
                    updated_at = GETDATE(),
                    completed_at = CASE WHEN @status = 'completed' THEN GETDATE() ELSE completed_at END
                WHERE id = @checkupId
            `);

        res.json({
            success: true,
            message: '검진 상태가 업데이트되었습니다.'
        });
    } catch (err) {
        console.error('검진 상태 업데이트 실패:', err.message);
        res.status(500).json({ success: false, error: '검진 상태 업데이트 실패' });
    }
});

// 환자 삭제
app.delete('/api/patients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const request = pool.request();

        // 환자와 연관된 검진 기록도 함께 삭제 (CASCADE)
        await request
            .input('patientId', sql.Int, parseInt(id))
            .query('DELETE FROM patients WHERE id = @patientId');

        res.json({ success: true, message: '환자 정보가 삭제되었습니다.' });
    } catch (err) {
        console.error('환자 삭제 실패:', err.message);
        res.status(500).json({ success: false, error: '환자 삭제 실패' });
    }
});

// 검진 삭제
app.delete('/api/checkups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);

            // 검진 항목 먼저 삭제
            await request
                .input('checkupId', sql.Int, parseInt(id))
                .query('DELETE FROM checkup_items WHERE checkup_id = @checkupId');

            // 검진 기록 삭제
            const request2 = new sql.Request(transaction);
            await request2
                .input('checkupId', sql.Int, parseInt(id))
                .query('DELETE FROM checkups WHERE id = @checkupId');

            await transaction.commit();
            res.json({ success: true, message: '검진 기록이 삭제되었습니다.' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('검진 삭제 실패:', err.message);
        res.status(500).json({ success: false, error: '검진 삭제 실패' });
    }
});

// 대시보드 통계
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const request = pool.request();

        // 전체 통계 조회
        const statsResult = await request.query(`
            SELECT
                (SELECT COUNT(*) FROM patients) as total_patients,
                (SELECT COUNT(*) FROM checkups) as total_checkups,
                (SELECT COUNT(*) FROM checkups WHERE status = 'completed') as completed_checkups,
                (SELECT COUNT(*) FROM checkups WHERE status = 'scheduled' AND checkup_date = CAST(GETDATE() AS DATE)) as today_checkups,
                (SELECT COUNT(*) FROM checkups WHERE status = 'in_progress') as in_progress_checkups
        `);

        res.json({ success: true, stats: statsResult.recordset[0] });
    } catch (err) {
        console.error('대시보드 통계 조회 실패:', err.message);
        res.status(500).json({ success: false, error: '대시보드 통계 조회 실패' });
    }
});

const startServer = async () => {
    try {
        console.log('🚀 서버 시작 중...');
        console.log(`🌐 포트: ${PORT}`);
        console.log(`📅 시작 시간: ${new Date().toLocaleString('ko-KR')}`);
        
        await initializeDatabase();
        
        app.listen(PORT, () => {
            console.log('🎉 서버가 성공적으로 시작되었습니다!');
            console.log(`🌐 서버 주소: http://localhost:${PORT}`);
            console.log(`📊 API 엔드포인트: http://localhost:${PORT}/api/stats`);
            console.log('⏹️  서버 중지: Ctrl+C');
        });
        
    } catch (error) {
        console.error('❌ 서버 시작 실패:', error);
        process.exit(1);
    }
};

startServer();