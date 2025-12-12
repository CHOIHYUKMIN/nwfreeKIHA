// WebRTC P2P 데이터 전송 모듈
class P2PTransferManager {
    constructor(app) {
        this.app = app;
        this.peerConnection = null;
        this.dataChannel = null;
        this.isSender = false;
        this.transferData = null;
        this.receivedChunks = [];
        this.chunkSize = 16384; // 16KB chunks
        this.totalChunks = 0;
        this.receivedChunkCount = 0;

        // 이벤트 콜백
        this.onProgress = null;
        this.onComplete = null;
        this.onError = null;
        this.onConnectionStateChange = null;
    }

    // WebRTC 설정
    getRTCConfiguration() {
        return {
            iceServers: [
                // STUN 서버 (공용, 무료) - 여러 개 추가
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            // ICE 후보 수집 정책 (모든 후보 수집)
            iceTransportPolicy: 'all',
            // Bundle 정책 (최적화)
            bundlePolicy: 'max-bundle',
            // RTP/RTCP 다중화 정책
            rtcpMuxPolicy: 'require',
            // ICE 후보 풀 크기
            iceCandidatePoolSize: 10
        };
    }

    // 송신자: Offer 생성
    async createOffer(data) {
        try {
            console.log('🚀 [송신자] Offer 생성 시작...');
            this.isSender = true;
            this.transferData = data;

            // PeerConnection 생성
            this.peerConnection = new RTCPeerConnection(this.getRTCConfiguration());
            console.log('📝 [송신자] PeerConnection 생성 완료');
            this.setupPeerConnectionListeners();

            // DataChannel 생성 (송신자가 생성)
            this.dataChannel = this.peerConnection.createDataChannel('dataTransfer', {
                ordered: true
            });
            console.log('📝 [송신자] DataChannel 생성 완료');
            this.setupDataChannelListeners();

            // Offer 생성
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            console.log('📝 [송신자] Local Description 설정 완료');

            // ICE 후보 수집 대기
            await this.waitForICEGathering();
            console.log('✅ [송신자] Offer 생성 완료');

            // Offer 정보 반환 (QR 코드로 변환될 데이터)
            return {
                type: 'offer',
                sdp: this.peerConnection.localDescription,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('❌ [송신자] Offer 생성 실패:', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }

    // 수신자: Answer 생성
    async createAnswer(offerData) {
        try {
            console.log('🚀 [수신자] Answer 생성 시작...');
            this.isSender = false;

            // PeerConnection 생성
            this.peerConnection = new RTCPeerConnection(this.getRTCConfiguration());
            console.log('📝 [수신자] PeerConnection 생성 완료');
            this.setupPeerConnectionListeners();

            // DataChannel 대기 (수신자는 송신자가 생성한 채널 사용)
            this.peerConnection.ondatachannel = (event) => {
                console.log('📝 [수신자] DataChannel 수신됨');
                this.dataChannel = event.channel;
                this.setupDataChannelListeners();
            };

            // Remote Description 설정
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.sdp));
            console.log('📝 [수신자] Remote Description 설정 완료 (Offer 수신)');

            // Answer 생성
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            console.log('📝 [수신자] Local Description 설정 완료 (Answer 생성)');

            // ICE 후보 수집 대기
            await this.waitForICEGathering();
            console.log('✅ [수신자] Answer 생성 완료');

            // Answer 정보 반환 (QR 코드로 변환될 데이터)
            return {
                type: 'answer',
                sdp: this.peerConnection.localDescription,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('❌ [수신자] Answer 생성 실패:', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }

    // 송신자: Answer 처리
    async handleAnswer(answerData) {
        try {
            console.log('🚀 [송신자] Answer 처리 시작...');

            if (!this.peerConnection) {
                throw new Error('[송신자] PeerConnection이 초기화되지 않았습니다. Offer를 먼저 생성해야 합니다.');
            }

            if (this.peerConnection.signalingState === 'closed') {
                throw new Error('[송신자] PeerConnection이 이미 닫혔습니다.');
            }

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerData.sdp));
            console.log('✅ [송신자] Answer 처리 완료, 연결 대기 중...');
        } catch (error) {
            console.error('❌ [송신자] Answer 처리 실패:', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }

    // ICE 후보 수집 대기
    waitForICEGathering() {
        return new Promise((resolve) => {
            if (!this.peerConnection) {
                resolve();
                return;
            }

            if (this.peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (this.peerConnection && this.peerConnection.iceGatheringState === 'complete') {
                        this.peerConnection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                this.peerConnection.addEventListener('icegatheringstatechange', checkState);

                // 타임아웃 (30초 후 강제 완료 - 증가)
                setTimeout(() => {
                    if (this.peerConnection) {
                        this.peerConnection.removeEventListener('icegatheringstatechange', checkState);
                    }
                    resolve();
                }, 30000);
            }
        });
    }

    // PeerConnection 이벤트 리스너 설정
    setupPeerConnectionListeners() {
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 ICE 후보:', event.candidate.candidate);
                console.log('   - 타입:', event.candidate.type);
                console.log('   - 프로토콜:', event.candidate.protocol);
            } else {
                console.log('🧊 ICE 후보 수집 완료 (null candidate)');
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('🔌 연결 상태:', this.peerConnection.connectionState);
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(this.peerConnection.connectionState);
            }

            if (this.peerConnection.connectionState === 'connected') {
                console.log('✅ P2P 연결 성공!');
            } else if (this.peerConnection.connectionState === 'failed') {
                console.error('❌ P2P 연결 실패');
                if (this.onError) this.onError(new Error('P2P 연결 실패'));
            } else if (this.peerConnection.connectionState === 'disconnected') {
                console.warn('⚠️ P2P 연결 끊김');
            }
        };

        this.peerConnection.onicegatheringstatechange = () => {
            console.log('🧊 ICE 수집 상태:', this.peerConnection.iceGatheringState);
        };

        // ICE connection state 추가
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('🧊 ICE 연결 상태:', this.peerConnection.iceConnectionState);

            if (this.peerConnection.iceConnectionState === 'failed') {
                console.error('❌ ICE 연결 실패 - NAT/방화벽 문제일 수 있습니다');
                if (this.onError) this.onError(new Error('ICE 연결 실패 - 네트워크 문제'));
            } else if (this.peerConnection.iceConnectionState === 'disconnected') {
                console.warn('⚠️ ICE 연결 끊김');
            } else if (this.peerConnection.iceConnectionState === 'connected') {
                console.log('✅ ICE 연결 성공!');
            } else if (this.peerConnection.iceConnectionState === 'completed') {
                console.log('✅ ICE 연결 완료!');
            }
        };

        // Signaling state 추가
        this.peerConnection.onsignalingstatechange = () => {
            console.log('📡 Signaling 상태:', this.peerConnection.signalingState);
        };
    }

    // DataChannel 이벤트 리스너 설정
    setupDataChannelListeners() {
        this.dataChannel.onopen = () => {
            console.log('✅ DataChannel 열림');

            // 송신자: 데이터 전송 시작
            if (this.isSender && this.transferData) {
                this.sendData(this.transferData);
            }
        };

        this.dataChannel.onclose = () => {
            console.log('DataChannel 닫힘');
        };

        this.dataChannel.onerror = (error) => {
            console.error('DataChannel 오류:', error);
            if (this.onError) this.onError(error);
        };

        this.dataChannel.onmessage = (event) => {
            // 모든 메시지 수신 (송수신자 모두)
            console.log('📨 메시지 수신:', event.data.substring(0, 100) + '...');
            this.receiveData(event.data);
        };

        // 버퍼 용량 모니터링
        this.dataChannel.onbufferedamountlow = () => {
            console.log('버퍼 용량 낮음, 전송 재개 가능');
        };
    }

    // 데이터 전송 (송신자)
    async sendData(data) {
        try {
            const dataString = JSON.stringify(data);
            const dataBytes = new TextEncoder().encode(dataString);
            const totalSize = dataBytes.length;
            this.totalChunks = Math.ceil(totalSize / this.chunkSize);

            console.log(`📤 데이터 전송 시작: ${(totalSize / 1024 / 1024).toFixed(2)} MB, ${this.totalChunks}개 청크`);

            // 메타데이터 전송
            const metadata = {
                type: 'metadata',
                totalChunks: this.totalChunks,
                totalSize: totalSize,
                timestamp: Date.now()
            };
            this.dataChannel.send(JSON.stringify(metadata));

            // 청크 단위로 전송
            for (let i = 0; i < this.totalChunks; i++) {
                const start = i * this.chunkSize;
                const end = Math.min(start + this.chunkSize, totalSize);
                const chunk = dataBytes.slice(start, end);

                // 버퍼가 가득 차면 대기
                while (this.dataChannel.bufferedAmount > this.chunkSize * 10) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                // 청크 전송
                const chunkData = {
                    type: 'chunk',
                    index: i,
                    data: Array.from(chunk)
                };
                this.dataChannel.send(JSON.stringify(chunkData));

                // 진행률 업데이트
                if (this.onProgress) {
                    this.onProgress({
                        current: i + 1,
                        total: this.totalChunks,
                        percentage: Math.round(((i + 1) / this.totalChunks) * 100)
                    });
                }
            }

            // 완료 메시지 전송
            const completeMessage = {
                type: 'complete'
            };
            this.dataChannel.send(JSON.stringify(completeMessage));

            console.log('✅ 데이터 전송 완료');

            // 송신자 완료 콜백 호출
            if (this.onComplete) {
                this.onComplete({ success: true, type: 'sender' });
            }

        } catch (error) {
            console.error('데이터 전송 실패:', error);
            if (this.onError) this.onError(error);
        }
    }

    // 데이터 수신 (송수신자 모두)
    receiveData(messageData) {
        try {
            const message = JSON.parse(messageData);
            console.log('📬 메시지 타입:', message.type, '| 역할:', this.isSender ? '송신자' : '수신자');

            // 송신자는 데이터 메시지를 무시
            if (this.isSender) {
                console.log('⚠️ 송신자는 데이터를 수신하지 않습니다.');
                return;
            }

            if (message.type === 'metadata') {
                // 메타데이터 수신
                this.totalChunks = message.totalChunks;
                this.receivedChunks = new Array(this.totalChunks);
                this.receivedChunkCount = 0;
                console.log(`📥 데이터 수신 시작: ${(message.totalSize / 1024 / 1024).toFixed(2)} MB, ${this.totalChunks}개 청크`);

            } else if (message.type === 'chunk') {
                // 청크 수신
                if (!this.receivedChunks) {
                    console.error('❌ receivedChunks가 초기화되지 않았습니다. metadata를 먼저 받아야 합니다.');
                    return;
                }

                this.receivedChunks[message.index] = new Uint8Array(message.data);
                this.receivedChunkCount++;

                console.log(`📦 청크 수신: ${this.receivedChunkCount}/${this.totalChunks}`);

                // 진행률 업데이트
                if (this.onProgress) {
                    this.onProgress({
                        current: this.receivedChunkCount,
                        total: this.totalChunks,
                        percentage: Math.round((this.receivedChunkCount / this.totalChunks) * 100)
                    });
                }

            } else if (message.type === 'complete') {
                // 전송 완료
                console.log('✅ 데이터 수신 완료, 조합 중...');
                this.assembleReceivedData();
            } else {
                console.warn('⚠️ 알 수 없는 메시지 타입:', message.type);
            }

        } catch (error) {
            console.error('데이터 수신 처리 실패:', error);
            if (this.onError) this.onError(error);
        }
    }

    // 수신한 청크 조합
    assembleReceivedData() {
        try {
            // 유효성 검사
            if (!this.receivedChunks || this.receivedChunks.length === 0) {
                throw new Error('수신한 청크가 없습니다.');
            }

            // null 체크
            const nullChunks = this.receivedChunks.filter((chunk, index) => {
                if (!chunk) {
                    console.error(`❌ 청크 ${index}가 null입니다.`);
                    return true;
                }
                return false;
            });

            if (nullChunks.length > 0) {
                throw new Error(`${nullChunks.length}개의 청크가 누락되었습니다.`);
            }

            console.log(`🔨 ${this.receivedChunks.length}개 청크 조합 시작...`);

            // 모든 청크 합치기
            const totalLength = this.receivedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combinedArray = new Uint8Array(totalLength);

            let offset = 0;
            for (const chunk of this.receivedChunks) {
                combinedArray.set(chunk, offset);
                offset += chunk.length;
            }

            console.log(`📊 전체 크기: ${(totalLength / 1024).toFixed(2)} KB`);

            // 문자열로 변환
            const dataString = new TextDecoder().decode(combinedArray);

            // JSON 파싱
            const data = JSON.parse(dataString);

            console.log('✅ 데이터 조합 완료:', {
                patients: data.patients?.length || 0,
                checkups: data.checkups?.length || 0,
                checkupTypes: data.checkupTypes?.length || 0,
                checkupItems: data.checkupItems?.length || 0
            });

            // 완료 콜백 호출
            if (this.onComplete) {
                this.onComplete(data);
            }

        } catch (error) {
            console.error('데이터 조합 실패:', error);
            if (this.onError) this.onError(error);
        }
    }

    // 연결 종료
    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        console.log('P2P 연결 종료');
    }

    // 연결 상태 확인
    getConnectionState() {
        if (!this.peerConnection) return 'closed';
        return this.peerConnection.connectionState;
    }

    // DataChannel 상태 확인
    getDataChannelState() {
        if (!this.dataChannel) return 'closed';
        return this.dataChannel.readyState;
    }
}

// 전역으로 노출
window.P2PTransferManager = P2PTransferManager;
