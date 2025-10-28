// MSSQL 서버 연결 설정
require('dotenv').config();

const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'PWAPOC',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// 필수 환경 변수 검증
if (!config.password) {
    console.error('⚠️  경고: DB_PASSWORD 환경 변수가 설정되지 않았습니다.');
    console.error('   .env 파일을 생성하고 .env.example을 참고하여 설정해주세요.');
    process.exit(1);
}

// 연결 풀 생성

const pool = new sql.ConnectionPool(config);

const poolConnect = pool.connect();

pool.on('error', err => {
    console.error('MSSQL 연결 풀 오류:', err);
});

module.exports = {
    sql,
    pool,
    poolConnect,
    config
};


