# 🗄️ MSSQL Server 설치 및 설정 가이드

## 📋 목차
1. [MSSQL Server 설치](#mssql-server-설치)
2. [데이터베이스 설정](#데이터베이스-설정)
3. [연결 테스트](#연결-테스트)
4. [문제 해결](#문제-해결)

## 🚀 MSSQL Server 설치

### **1. SQL Server Express 다운로드**

1. [Microsoft SQL Server 다운로드 페이지](https://www.microsoft.com/ko-kr/sql-server/sql-server-downloads) 방문
2. **Express** 버전 선택 (무료)
3. **Download now** 클릭

### **2. 설치 과정**

#### **기본 설정**
- **Feature Selection**: Database Engine Services 선택
- **Instance Configuration**: Default instance 사용
- **Server Configuration**: SQL Server Database Engine 서비스 계정 설정

#### **Database Engine Configuration**
- **Authentication Mode**: **SQL Server and Windows Authentication mode** 선택 ⭐
- **SQL Server administrators**: 현재 Windows 계정 추가
- **SQL Server service account**: NT Service\MSSQLSERVER 선택

#### **중요 설정**
- **SA 계정 비밀번호**: `YourPassword123!` (mssql-config.js와 일치해야 함)
- **Data Directories**: 기본값 사용

### **3. 설치 완료 확인**

1. **SQL Server Configuration Manager** 실행
2. **SQL Server Services**에서 **SQL Server (MSSQLSERVER)** 실행 중 확인
3. **SQL Server Network Configuration**에서 **TCP/IP** 프로토콜 활성화 확인

## 🗃️ 데이터베이스 설정

### **1. SQL Server Management Studio (SSMS) 설치**

1. [SSMS 다운로드](https://docs.microsoft.com/ko-kr/sql/ssms/download-sql-server-management-studio-ssms)
2. 설치 후 실행
3. **Connect to Server**에서:
   - **Server name**: `localhost` 또는 `.\MSSQLSERVER`
   - **Authentication**: **SQL Server Authentication**
   - **Login**: `sa`
   - **Password**: `YourPassword123!`

### **2. 데이터베이스 생성**

```sql
-- PWAPOC 데이터베이스 생성
CREATE DATABASE PWAPOC;
GO

-- 데이터베이스 사용
USE PWAPOC;
GO

-- 사용자 데이터 테이블 생성
CREATE TABLE user_data (
    id INT IDENTITY(1,1) PRIMARY KEY,
    text NVARCHAR(MAX) NOT NULL,
    timestamp NVARCHAR(50) NOT NULL,
    is_online BIT NOT NULL DEFAULT 0,
    sync_status NVARCHAR(20) DEFAULT 'synced',
    sync_direction NVARCHAR(20) DEFAULT 'none',
    local_id NVARCHAR(50),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    is_offline_created BIT DEFAULT 0,
    conflict_resolved BIT DEFAULT 0
);

-- 동기화 로그 테이블 생성
CREATE TABLE sync_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    operation NVARCHAR(50) NOT NULL,
    data_id INT,
    local_id NVARCHAR(50),
    sync_timestamp DATETIME2 DEFAULT GETDATE(),
    details NVARCHAR(MAX),
    status NVARCHAR(20) DEFAULT 'success'
);

-- 샘플 데이터 삽입
INSERT INTO user_data (text, timestamp, is_online, sync_status, sync_direction, is_offline_created)
VALUES 
    (N'온라인에서 생성된 샘플 데이터 1', '2025-08-22T10:00:00', 1, 'synced', 'none', 0),
    (N'온라인에서 생성된 샘플 데이터 2', '2025-08-22T10:01:00', 1, 'synced', 'none', 0),
    (N'온라인에서 생성된 샘플 데이터 3', '2025-08-22T10:02:00', 1, 'synced', 'none', 0);
```

## 🔌 연결 테스트

### **1. Node.js 연결 테스트**

```bash
# 프로젝트 디렉토리에서
npm install

# MSSQL 데이터베이스 초기화
npm run init-mssql

# 서버 실행
npm start
```

### **2. 연결 성공 메시지 확인**

```
🔄 MSSQL 데이터베이스 초기화를 시작합니다...
✅ MSSQL 서버에 연결되었습니다.
PWAPOC 데이터베이스가 생성되었습니다.
user_data 테이블이 생성되었습니다.
sync_log 테이블이 생성되었습니다.
샘플 데이터가 삽입되었습니다.
✅ MSSQL 데이터베이스 초기화가 완료되었습니다!
📊 테이블 정보:
   - user_data: 3 행
   - sync_log: 0 행
🚀 MSSQL API 서버가 포트 3000에서 실행 중입니다.
📱 PWA 클라이언트: http://localhost:3000
🔌 API 엔드포인트: http://localhost:3000/api
```

## 🛠️ 문제 해결

### **1. 연결 오류: "Login failed for user 'sa'**

**원인**: SA 계정 비밀번호 불일치 또는 계정 잠금

**해결 방법**:
```sql
-- SA 계정 비밀번호 재설정
ALTER LOGIN sa WITH PASSWORD = 'YourPassword123!';
ALTER LOGIN sa ENABLE;
GO
```

### **2. 연결 오류: "TCP/IP protocol is not enabled"**

**원인**: TCP/IP 프로토콜 비활성화

**해결 방법**:
1. **SQL Server Configuration Manager** 실행
2. **SQL Server Network Configuration** → **Protocols for MSSQLSERVER**
3. **TCP/IP** 더블클릭 → **Enabled: Yes**
4. **SQL Server Services** → **SQL Server (MSSQLSERVER)** 재시작

### **3. 연결 오류: "Server name cannot be resolved"**

**원인**: 서버 이름 해석 실패

**해결 방법**:
```bash
# mssql-config.js에서 서버 이름 변경
server: 'localhost' → '127.0.0.1'
# 또는
server: 'localhost' → 'DESKTOP-XXXXX' (컴퓨터 이름)
```

### **4. 포트 충돌: "Port 3000 is already in use"**

**해결 방법**:
```bash
# 포트 변경
# mssql-server.js에서
const PORT = process.env.PORT || 3001;  # 3000 → 3001

# 또는 기존 프로세스 종료
# Windows
netstat -ano | findstr :3000
taskkill /PID [프로세스ID] /F

# Linux/Mac
lsof -i :3000
kill -9 [프로세스ID]
```

### **5. 권한 오류: "CREATE DATABASE permission denied"**

**원인**: SA 계정 권한 부족

**해결 방법**:
```sql
-- SA 계정에 sysadmin 역할 부여
ALTER SERVER ROLE sysadmin ADD MEMBER sa;
GO
```

## 📱 PWA 클라이언트 연결

### **1. 클라이언트 실행**

```bash
# 별도 터미널에서
python -m http.server 8000
# 또는
npx http-server -p 8000
```

### **2. 브라우저에서 접속**

- **PWA 클라이언트**: `http://localhost:8000`
- **MSSQL API 서버**: `http://localhost:3000`

### **3. 동기화 테스트**

1. **온라인 상태에서 데이터 생성**
2. **오프라인 상태에서 데이터 생성** (Network → Offline)
3. **온라인 복귀 시 자동 동기화 확인**
4. **동기화 상태 모니터링**

## 🔒 보안 고려사항

### **프로덕션 환경**

1. **강력한 비밀번호 사용**
2. **Windows Authentication 활용**
3. **방화벽 설정**
4. **SSL/TLS 암호화**
5. **정기적인 백업**

### **개발 환경**

1. **로컬 네트워크에서만 접근**
2. **테스트용 계정 사용**
3. **데이터베이스 백업**

## 📚 추가 리소스

- [SQL Server 공식 문서](https://docs.microsoft.com/ko-kr/sql/sql-server/)
- [Node.js MSSQL 드라이버](https://github.com/tediousjs/node-mssql)
- [SQL Server Management Studio](https://docs.microsoft.com/ko-kr/sql/ssms/sql-server-management-studio-ssms)

---

## 🎯 다음 단계

MSSQL 서버가 정상적으로 실행되면:

1. **PWA 클라이언트에서 데이터 생성/수정/삭제 테스트**
2. **오프라인/온라인 동기화 테스트**
3. **충돌 해결 시스템 테스트**
4. **성능 모니터링 및 최적화**

문제가 발생하면 위의 **문제 해결** 섹션을 참조하거나, 로그를 확인하여 구체적인 오류 메시지를 파악하세요.











