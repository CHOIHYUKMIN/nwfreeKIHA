const sql = require('mssql');
const { config } = require('./mssql-config');

async function initMSSQLDatabase() {
    try {
        console.log('🔄 MSSQL 데이터베이스 초기화를 시작합니다...');
        
        // 데이터베이스에 연결
        const pool = await sql.connect(config);
        console.log('✅ MSSQL 서버에 연결되었습니다.');
        
        // 데이터베이스 생성 (없는 경우)
        await pool.request().query(`
            IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'PWAPOC')
            BEGIN
                CREATE DATABASE PWAPOC;
                PRINT 'PWAPOC 데이터베이스가 생성되었습니다.';
            END
            ELSE
            BEGIN
                PRINT 'PWAPOC 데이터베이스가 이미 존재합니다.';
            END
        `);
        
        // PWAPOC 데이터베이스 사용
        await pool.request().query('USE PWAPOC');
        
        // 사용자 데이터 테이블 생성
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[user_data]') AND type in (N'U'))
            BEGIN
                CREATE TABLE user_data (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    text NVARCHAR(MAX) NOT NULL,
                    timestamp NVARCHAR(50) NOT NULL,
                    is_online BIT NOT NULL DEFAULT 0,
                    sync_status NVARCHAR(20) DEFAULT 'synced',
                    sync_direction NVARCHAR(20) DEFAULT 'none', -- 'to_server', 'from_server', 'conflict'
                    local_id NVARCHAR(50), -- IndexedDB의 ID
                    created_at DATETIME2 DEFAULT GETDATE(),
                    updated_at DATETIME2 DEFAULT GETDATE(),
                    is_offline_created BIT DEFAULT 0, -- 오프라인에서 생성된 데이터 여부
                    conflict_resolved BIT DEFAULT 0 -- 충돌 해결 여부
                );
                PRINT 'user_data 테이블이 생성되었습니다.';
            END
            ELSE
            BEGIN
                PRINT 'user_data 테이블이 이미 존재합니다.';
            END
        `);
        
        // 동기화 로그 테이블 생성
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[sync_log]') AND type in (N'U'))
            BEGIN
                CREATE TABLE sync_log (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    operation NVARCHAR(50) NOT NULL, -- 'sync_to_server', 'sync_from_server', 'conflict_resolved'
                    data_id INT,
                    local_id NVARCHAR(50),
                    sync_timestamp DATETIME2 DEFAULT GETDATE(),
                    details NVARCHAR(MAX),
                    status NVARCHAR(20) DEFAULT 'success'
                );
                PRINT 'sync_log 테이블이 생성되었습니다.';
            END
            ELSE
            BEGIN
                PRINT 'sync_log 테이블이 이미 존재합니다.';
            END
        `);
        
        // 샘플 데이터 삽입 (테스트용)
        await pool.request().query(`
            IF NOT EXISTS (SELECT TOP 1 * FROM user_data)
            BEGIN
                INSERT INTO user_data (text, timestamp, is_online, sync_status, sync_direction, is_offline_created)
                VALUES 
                    (N'온라인에서 생성된 샘플 데이터 1', '2025-08-22T10:00:00', 1, 'synced', 'none', 0),
                    (N'온라인에서 생성된 샘플 데이터 2', '2025-08-22T10:01:00', 1, 'synced', 'none', 0),
                    (N'온라인에서 생성된 샘플 데이터 3', '2025-08-22T10:02:00', 1, 'synced', 'none', 0);
                PRINT '샘플 데이터가 삽입되었습니다.';
            END
            ELSE
            BEGIN
                PRINT '샘플 데이터가 이미 존재합니다.';
            END
        `);
        
        console.log('✅ MSSQL 데이터베이스 초기화가 완료되었습니다!');
        console.log('📊 테이블 정보:');
        
        // 테이블 정보 조회
        const tablesResult = await pool.request().query(`
            SELECT TABLE_NAME, TABLE_ROWS = SUM(row_count)
            FROM INFORMATION_SCHEMA.TABLES t
            LEFT JOIN sys.dm_db_partition_stats p ON t.TABLE_NAME = OBJECT_NAME(p.object_id)
            WHERE t.TABLE_TYPE = 'BASE TABLE'
            GROUP BY TABLE_NAME
        `);
        
        tablesResult.recordset.forEach(table => {
            console.log(`   - ${table.TABLE_NAME}: ${table.TABLE_ROWS || 0} 행`);
        });
        
        await pool.close();
        
    } catch (err) {
        console.error('❌ MSSQL 데이터베이스 초기화 실패:', err);
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    initMSSQLDatabase();
}

module.exports = { initMSSQLDatabase };

