// DB 마이그레이션: checkups 테이블에 local_id 추가
// UUID 기반 중복 방지를 위한 마이그레이션

const { pool, poolConnect } = require('./mssql-config');

async function migrate() {
    try {
        console.log('🔄 DB 마이그레이션 시작: local_id 컬럼 추가...');

        await poolConnect;

        // 1. checkups 테이블에 local_id 컬럼이 있는지 확인
        const checkColumn = await pool.request().query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'checkups' AND COLUMN_NAME = 'local_id'
        `);

        if (checkColumn.recordset.length > 0) {
            console.log('⏭️  checkups.local_id 컬럼이 이미 존재합니다.');
        } else {
            // 2. checkups 테이블에 local_id 컬럼 추가
            await pool.request().query(`
                ALTER TABLE checkups
                ADD local_id NVARCHAR(50) NULL;
            `);
            console.log('✅ checkups.local_id 컬럼 추가 완료');

            // 3. local_id에 인덱스 추가 (중복 허용하지 않음)
            await pool.request().query(`
                CREATE UNIQUE INDEX IX_checkups_local_id
                ON checkups(local_id)
                WHERE local_id IS NOT NULL;
            `);
            console.log('✅ checkups.local_id 인덱스 생성 완료');
        }

        // 4. checkup_items 테이블에 local_id 컬럼이 있는지 확인
        const checkItemsColumn = await pool.request().query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'checkup_items' AND COLUMN_NAME = 'local_id'
        `);

        if (checkItemsColumn.recordset.length > 0) {
            console.log('⏭️  checkup_items.local_id 컬럼이 이미 존재합니다.');
        } else {
            // 5. checkup_items 테이블에 local_id 컬럼 추가
            await pool.request().query(`
                ALTER TABLE checkup_items
                ADD local_id NVARCHAR(50) NULL;
            `);
            console.log('✅ checkup_items.local_id 컬럼 추가 완료');

            // 6. local_id에 인덱스 추가
            await pool.request().query(`
                CREATE UNIQUE INDEX IX_checkup_items_local_id
                ON checkup_items(local_id)
                WHERE local_id IS NOT NULL;
            `);
            console.log('✅ checkup_items.local_id 인덱스 생성 완료');
        }

        console.log('');
        console.log('✅ DB 마이그레이션 완료!');
        console.log('');
        console.log('📋 변경사항:');
        console.log('  - checkups 테이블에 local_id NVARCHAR(50) 컬럼 추가');
        console.log('  - checkup_items 테이블에 local_id NVARCHAR(50) 컬럼 추가');
        console.log('  - local_id에 UNIQUE 인덱스 추가 (NULL 제외)');
        console.log('');
        console.log('💡 참고:');
        console.log('  - patients 테이블은 이미 local_id 컬럼이 있습니다.');
        console.log('  - 기존 데이터는 local_id가 NULL입니다.');
        console.log('  - 새로운 데이터부터 UUID가 자동 생성됩니다.');

        await pool.close();
    } catch (error) {
        console.error('❌ 마이그레이션 실패:', error);
        process.exit(1);
    }
}

migrate();
