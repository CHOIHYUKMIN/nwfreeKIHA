const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 데이터베이스 파일 경로
const dbPath = path.join(__dirname, 'data', 'pwa-poc.db');

// 데이터베이스 연결
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('데이터베이스 연결 실패:', err.message);
    } else {
        console.log('SQLite 데이터베이스에 연결되었습니다.');
        initDatabase();
    }
});

function initDatabase() {
    // 사용자 데이터 테이블 생성
    db.run(`
        CREATE TABLE IF NOT EXISTS user_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            is_online BOOLEAN NOT NULL,
            sync_status TEXT DEFAULT 'synced',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('테이블 생성 실패:', err.message);
        } else {
            console.log('user_data 테이블이 생성되었습니다.');
        }
    });

    // 동기화 로그 테이블 생성
    db.run(`
        CREATE TABLE IF NOT EXISTS sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation TEXT NOT NULL,
            data_id INTEGER,
            status TEXT NOT NULL,
            error_message TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (data_id) REFERENCES user_data (id)
        )
    `, (err) => {
        if (err) {
            console.error('sync_logs 테이블 생성 실패:', err.message);
        } else {
            console.log('sync_logs 테이블이 생성되었습니다.');
        }
    });

    // 샘플 데이터 삽입
    const sampleData = [
        {
            text: '온라인에서 생성된 샘플 데이터',
            timestamp: new Date().toISOString(),
            is_online: true
        },
        {
            text: '오프라인 테스트용 데이터',
            timestamp: new Date().toISOString(),
            is_online: false
        }
    ];

    const insertStmt = db.prepare(`
        INSERT INTO user_data (text, timestamp, is_online)
        VALUES (?, ?, ?)
    `);

    sampleData.forEach(data => {
        insertStmt.run([data.text, data.timestamp, data.is_online], (err) => {
            if (err) {
                console.error('샘플 데이터 삽입 실패:', err.message);
            } else {
                console.log('샘플 데이터가 삽입되었습니다:', data.text);
            }
        });
    });

    insertStmt.finalize();

    // 데이터베이스 연결 종료
    setTimeout(() => {
        db.close((err) => {
            if (err) {
                console.error('데이터베이스 연결 종료 실패:', err.message);
            } else {
                console.log('데이터베이스 연결이 종료되었습니다.');
                console.log('✅ 데이터베이스 초기화가 완료되었습니다!');
            }
        });
    }, 1000);
}

