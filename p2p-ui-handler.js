// P2P UI 핸들러 - app.js에서 사용
class P2PUIHandler {
    constructor(app) {
        this.app = app;
        this.p2pManager = null;
        this.currentStep = null; // 'offer_created', 'answer_created', etc.
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 데이터 보내기 버튼
        const sendBtn = document.getElementById('p2p-send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.startSending());
        }

        // 데이터 받기 버튼
        const receiveBtn = document.getElementById('p2p-receive-btn');
        if (receiveBtn) {
            receiveBtn.addEventListener('click', () => this.startReceiving());
        }

        // 복사 버튼
        const copyBtn = document.getElementById('p2p-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyCode());
        }

        // 붙여넣기 확인 버튼
        const pasteConfirmBtn = document.getElementById('p2p-paste-confirm-btn');
        if (pasteConfirmBtn) {
            pasteConfirmBtn.addEventListener('click', () => this.handlePastedCode());
        }

        // Answer 입력 버튼 (송신자용)
        const inputAnswerBtn = document.getElementById('p2p-input-answer-btn');
        if (inputAnswerBtn) {
            inputAnswerBtn.addEventListener('click', () => {
                this.closeQRModal();
                this.showAnswerInputModal();
            });
        }

        // 모달 닫기 이벤트
        const p2pQrModal = document.getElementById('p2p-qr-modal');
        const p2pScanModal = document.getElementById('p2p-scan-modal');

        if (p2pQrModal) {
            p2pQrModal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal') || e.target.classList.contains('modal-close')) {
                    this.closeQRModal();
                }
            });
        }

        if (p2pScanModal) {
            p2pScanModal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal') || e.target.classList.contains('modal-close')) {
                    this.closeScanModal();
                }
            });
        }
    }

    // 데이터 보내기 시작
    async startSending() {
        try {
            // 이미 P2P 전송 중인지 확인
            if (this.p2pManager && this.currentStep) {
                this.app.showNotification('⚠️ 이미 P2P 전송이 진행 중입니다. 페이지를 새로고침하고 다시 시도하세요.', 'warning');
                return;
            }

            // 전송할 데이터 준비
            const dataToSend = await this.prepareDataForTransfer();

            if (!dataToSend.patients.length && !dataToSend.checkups.length) {
                this.app.showNotification('전송할 데이터가 없습니다.', 'warning');
                return;
            }

            console.log('📤 [UI] 데이터 보내기 시작...');

            // P2P Manager 생성
            this.p2pManager = new P2PTransferManager(this.app);
            this.setupP2PCallbacks();

            // 버튼 비활성화
            this.disableP2PButtons();

            // Offer 생성
            this.updateP2PStatus('Offer 생성 중...', 'connecting');
            const offerData = await this.p2pManager.createOffer(dataToSend);

            // 텍스트 코드 표시
            this.showCodeText(offerData, 'Offer 코드 (송신자)', '아래 코드를 복사해서 수신자에게 전달하세요');
            this.currentStep = 'offer_created';
            this.updateP2PStatus('수신자가 코드를 입력할 때까지 대기 중...', 'waiting');

            // Answer 대기 안내
            setTimeout(() => {
                if (this.currentStep === 'offer_created') {
                    this.app.showNotification('📱 수신자가 "데이터 받기"를 누르고 이 코드를 입력한 후, Answer 코드를 보내주면 입력해주세요.', 'info');
                }
            }, 3000);

        } catch (error) {
            console.error('❌ [UI] 전송 시작 실패:', error);
            this.app.showNotification('데이터 전송 시작에 실패했습니다: ' + error.message, 'error');
            this.updateP2PStatus('전송 실패', 'error');
            this.enableP2PButtons();
        }
    }

    // 데이터 받기 시작
    async startReceiving() {
        try {
            // 이미 P2P 전송 중인지 확인
            if (this.p2pManager && this.currentStep) {
                this.app.showNotification('⚠️ 이미 P2P 전송이 진행 중입니다. 페이지를 새로고침하고 다시 시도하세요.', 'warning');
                return;
            }

            console.log('📥 [UI] 데이터 받기 시작...');

            // 버튼 비활성화
            this.disableP2PButtons();

            // 입력 모달 표시
            this.showScanModal('Offer 코드 입력 (수신자)', '송신자로부터 받은 Offer 코드를 붙여넣으세요');
            this.currentStep = 'waiting_offer';
            this.updateP2PStatus('Offer 코드 입력 대기 중...', 'waiting');

        } catch (error) {
            console.error('❌ [UI] 수신 시작 실패:', error);
            this.app.showNotification('데이터 수신 시작에 실패했습니다: ' + error.message, 'error');
            this.updateP2PStatus('수신 실패', 'error');
            this.enableP2PButtons();
        }
    }

    // 붙여넣은 코드 처리
    async handlePastedCode() {
        try {
            const codeInput = document.getElementById('p2p-code-input');
            const codeText = codeInput.value.trim();

            if (!codeText) {
                this.app.showNotification('코드를 입력해주세요.', 'warning');
                return;
            }

            // JSON 파싱 시도
            let codeData;
            try {
                codeData = JSON.parse(codeText);
            } catch (error) {
                this.app.showNotification('올바르지 않은 코드 형식입니다.', 'error');
                return;
            }

            this.closeScanModal();

            // Offer 코드 처리
            if (codeData.type === 'offer') {
                // P2P Manager 생성
                this.p2pManager = new P2PTransferManager(this.app);
                this.setupP2PCallbacks();

                // Answer 생성
                this.updateP2PStatus('Answer 생성 중...', 'connecting');
                const answerData = await this.p2pManager.createAnswer(codeData);

                // Answer 코드 표시
                this.showCodeText(answerData, 'Answer 코드', '아래 코드를 복사해서 송신자에게 전달하세요');
                this.currentStep = 'answer_created';
                this.updateP2PStatus('송신자가 Answer 코드를 입력할 때까지 대기 중...', 'waiting');

            // Answer 코드 처리 (송신자가 입력)
            } else if (codeData.type === 'answer') {
                if (!this.p2pManager) {
                    throw new Error('P2P 연결이 초기화되지 않았습니다.');
                }

                // Answer 처리
                await this.p2pManager.handleAnswer(codeData);
                this.currentStep = 'answer_processed';
                this.updateP2PStatus('연결 중...', 'connecting');
                this.app.showNotification('연결을 시작합니다...', 'info');

            } else {
                this.app.showNotification('올바르지 않은 코드 타입입니다.', 'error');
            }

        } catch (error) {
            console.error('코드 처리 실패:', error);
            this.app.showNotification('코드 처리 실패: ' + error.message, 'error');
        }
    }

    // P2P 콜백 설정
    setupP2PCallbacks() {
        if (!this.p2pManager) return;

        // 진행률 업데이트
        this.p2pManager.onProgress = (progress) => {
            this.updateP2PProgress(progress.percentage);
            this.updateP2PStatus(`데이터 전송 중: ${progress.current}/${progress.total} 청크`, 'transferring');
        };

        // 전송 완료
        this.p2pManager.onComplete = async (data) => {
            console.log('✅ onComplete 호출:', data);

            // 송신자 완료 처리
            if (data.type === 'sender') {
                console.log('📤 송신자: 데이터 전송 완료');
                this.updateP2PStatus('데이터 전송 완료!', 'success');
                this.app.showNotification('데이터를 성공적으로 전송했습니다!', 'success');

                // 연결 종료
                setTimeout(() => {
                    this.cleanup();
                }, 3000);

                return;
            }

            // 수신자 완료 처리
            console.log('📥 수신자: 데이터 수신 완료');
            this.updateP2PStatus('데이터 수신 완료, 저장 중...', 'success');

            try {
                // 데이터 병합
                await this.mergeReceivedData(data);
                this.app.showNotification('데이터를 성공적으로 받았습니다!', 'success');
                this.updateP2PStatus('완료', 'success');

                // 화면 갱신
                this.app.refreshCurrentView();

                // 연결 종료
                setTimeout(() => {
                    this.cleanup();
                }, 3000);

            } catch (error) {
                console.error('데이터 병합 실패:', error);
                this.app.showNotification('데이터 저장 실패: ' + error.message, 'error');
                this.updateP2PStatus('저장 실패', 'error');
            }
        };

        // 에러 처리
        this.p2pManager.onError = (error) => {
            console.error('❌ [UI] P2P 에러:', error);
            this.app.showNotification('❌ P2P 연결 오류: ' + error.message, 'error');
            this.updateP2PStatus('오류 발생', 'error');

            // 에러 발생 시 정리
            setTimeout(() => {
                this.cleanup();
            }, 3000);
        };

        // 연결 상태 변경
        this.p2pManager.onConnectionStateChange = (state) => {
            console.log('🔌 [UI] 연결 상태:', state);

            if (state === 'connected') {
                this.updateP2PStatus('연결 성공!', 'connected');
                this.app.showNotification('✅ P2P 연결되었습니다.', 'success');

                // 송신자: 데이터 전송 시작 (DataChannel이 열리면 자동 시작)
                if (this.p2pManager.isSender) {
                    this.updateP2PStatus('데이터 전송 중...', 'transferring');
                }
            } else if (state === 'failed') {
                this.updateP2PStatus('연결 실패', 'error');
                this.app.showNotification('❌ P2P 연결에 실패했습니다. 두 기기가 같은 Wi-Fi 네트워크에 연결되어 있는지 확인하세요.', 'error');

                // 연결 실패 시 정리
                setTimeout(() => {
                    this.cleanup();
                }, 3000);
            }
        };
    }

    // 전송할 데이터 준비
    async prepareDataForTransfer() {
        try {
            const patients = await this.app.getAllFromStore('patients');
            const checkups = await this.app.getAllFromStore('checkups');
            const checkupTypes = await this.app.getAllFromStore('checkupTypes');
            const checkupItems = await this.app.getAllFromStore('checkupItems');

            return {
                patients: patients || [],
                checkups: checkups || [],
                checkupTypes: checkupTypes || [],
                checkupItems: checkupItems || [],
                timestamp: Date.now(),
                version: this.app.VERSION
            };
        } catch (error) {
            console.error('데이터 준비 실패:', error);
            throw error;
        }
    }

    // 수신한 데이터 병합
    async mergeReceivedData(data) {
        try {
            let stats = {
                patients: { added: 0, skipped: 0 },
                checkups: { added: 0, skipped: 0 },
                checkupTypes: { added: 0, skipped: 0 },
                checkupItems: { added: 0, skipped: 0 }
            };

            // 검진 유형 병합
            for (const type of data.checkupTypes || []) {
                try {
                    const existing = await this.app.getFromStore('checkupTypes', type.id);
                    if (!existing) {
                        await this.app.addToStore('checkupTypes', type);
                        stats.checkupTypes.added++;
                    } else {
                        stats.checkupTypes.skipped++;
                    }
                } catch (error) {
                    console.error('검진 유형 추가 실패:', error);
                }
            }

            // 환자 병합
            for (const patient of data.patients || []) {
                try {
                    const existing = await this.app.getFromStore('patients', patient.id);
                    if (!existing) {
                        await this.app.addToStore('patients', patient);
                        stats.patients.added++;
                    } else {
                        stats.patients.skipped++;
                    }
                } catch (error) {
                    console.error('환자 추가 실패:', error);
                }
            }

            // 검진 병합
            for (const checkup of data.checkups || []) {
                try {
                    const existing = await this.app.getFromStore('checkups', checkup.id);
                    if (!existing) {
                        await this.app.addToStore('checkups', checkup);
                        stats.checkups.added++;
                    } else {
                        stats.checkups.skipped++;
                    }
                } catch (error) {
                    console.error('검진 추가 실패:', error);
                }
            }

            // 검진 항목 병합
            for (const item of data.checkupItems || []) {
                try {
                    const existing = await this.app.getFromStore('checkupItems', item.id);
                    if (!existing) {
                        await this.app.addToStore('checkupItems', item);
                        stats.checkupItems.added++;
                    } else {
                        stats.checkupItems.skipped++;
                    }
                } catch (error) {
                    console.error('검진 항목 추가 실패:', error);
                }
            }

            console.log('✅ 데이터 병합 완료:', stats);
            this.app.showNotification(
                `환자 ${stats.patients.added}개, 검진 ${stats.checkups.added}개 추가됨`,
                'success'
            );

        } catch (error) {
            console.error('데이터 병합 실패:', error);
            throw error;
        }
    }

    // 텍스트 코드 표시
    showCodeText(data, title, instruction) {
        const modal = document.getElementById('p2p-qr-modal');
        const titleEl = document.getElementById('p2p-qr-title');
        const instructionEl = document.getElementById('p2p-qr-instruction');
        const codeText = document.getElementById('p2p-code-text');

        if (!modal || !codeText) return;

        // 제목 및 설명 설정
        if (titleEl) titleEl.textContent = title;
        if (instructionEl) instructionEl.textContent = instruction;

        // JSON 문자열로 변환
        const dataString = JSON.stringify(data);
        codeText.value = dataString;

        // 모달 표시
        modal.style.display = 'flex';

        // 다음 단계 버튼 표시/숨김
        const nextStepOffer = document.getElementById('p2p-next-step-offer');
        const nextStepAnswer = document.getElementById('p2p-next-step-answer');

        if (nextStepOffer) nextStepOffer.style.display = 'none';
        if (nextStepAnswer) nextStepAnswer.style.display = 'none';

        // Offer 코드인 경우 (송신자) - Answer 입력 버튼 표시
        if (data.type === 'offer' && this.currentStep === 'offer_created') {
            if (nextStepOffer) {
                nextStepOffer.style.display = 'block';
            }
        }

        // Answer 코드인 경우 (수신자) - 안내 메시지 표시
        if (data.type === 'answer' && this.currentStep === 'answer_created') {
            if (nextStepAnswer) {
                nextStepAnswer.style.display = 'block';
            }
            this.app.showNotification('코드를 복사해서 송신자에게 전달하세요.', 'info');
        }
    }

    // Answer 입력 프롬프트
    promptInputAnswer() {
        const result = confirm('수신자가 Answer 코드를 보내주었나요?\n\n확인을 누르면 Answer 코드 입력 화면이 나타납니다.');
        if (result) {
            this.closeQRModal();
            this.showAnswerInputModal();
        }
    }

    // Answer 입력 모달 표시
    showAnswerInputModal() {
        this.showScanModal('Answer 코드 입력', '수신자로부터 받은 Answer 코드를 붙여넣으세요');
        this.updateP2PStatus('Answer 코드 입력 대기 중...', 'waiting');
    }

    // 입력 모달 표시
    showScanModal(title, instruction) {
        const modal = document.getElementById('p2p-scan-modal');
        const titleEl = document.getElementById('p2p-scan-title');
        const instructionEl = document.getElementById('p2p-scan-instruction');
        const codeInput = document.getElementById('p2p-code-input');

        if (!modal) return;

        if (titleEl) titleEl.textContent = title;
        if (instructionEl) instructionEl.textContent = instruction;

        // 입력 필드 초기화
        if (codeInput) codeInput.value = '';

        modal.style.display = 'flex';
    }

    // 코드 복사
    async copyCode() {
        const codeText = document.getElementById('p2p-code-text');
        if (!codeText) return;

        try {
            await navigator.clipboard.writeText(codeText.value);
            this.app.showNotification('코드가 복사되었습니다!', 'success');

            // 복사 버튼 피드백
            const copyBtn = document.getElementById('p2p-copy-btn');
            if (copyBtn) {
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> 복사 완료!';
                copyBtn.disabled = true;

                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.disabled = false;
                }, 2000);
            }
        } catch (error) {
            console.error('복사 실패:', error);
            this.app.showNotification('복사에 실패했습니다. 수동으로 선택해서 복사하세요.', 'error');

            // 폴백: 텍스트 선택
            codeText.select();
        }
    }

    // QR 모달 닫기
    closeQRModal() {
        const modal = document.getElementById('p2p-qr-modal');
        if (modal) modal.style.display = 'none';
    }

    // 입력 모달 닫기
    closeScanModal() {
        const modal = document.getElementById('p2p-scan-modal');
        const codeInput = document.getElementById('p2p-code-input');

        if (modal) modal.style.display = 'none';
        if (codeInput) codeInput.value = '';
    }

    // P2P 상태 업데이트
    updateP2PStatus(text, state) {
        const statusDiv = document.getElementById('p2p-status');
        const statusIcon = document.getElementById('p2p-status-icon');
        const statusText = document.getElementById('p2p-status-text');

        if (!statusDiv || !statusIcon || !statusText) return;

        statusDiv.style.display = 'block';
        statusText.textContent = text;

        // 아이콘 색상
        const colors = {
            waiting: '#ffc107',
            connecting: '#2196f3',
            connected: '#4caf50',
            transferring: '#4f46e5',
            success: '#4caf50',
            error: '#f44336'
        };

        statusIcon.style.color = colors[state] || '#6c757d';
    }

    // P2P 진행률 업데이트
    updateP2PProgress(percentage) {
        const progressDiv = document.getElementById('p2p-progress');
        const progressBar = document.getElementById('p2p-progress-bar');
        const progressText = document.getElementById('p2p-progress-text');

        if (!progressDiv || !progressBar || !progressText) return;

        progressDiv.style.display = 'block';
        progressBar.style.width = percentage + '%';
        progressText.textContent = percentage + '%';
    }

    // P2P 버튼 비활성화
    disableP2PButtons() {
        const sendBtn = document.getElementById('start-p2p-send');
        const receiveBtn = document.getElementById('start-p2p-receive');

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
        }
        if (receiveBtn) {
            receiveBtn.disabled = true;
            receiveBtn.style.opacity = '0.5';
        }
    }

    // P2P 버튼 활성화
    enableP2PButtons() {
        const sendBtn = document.getElementById('start-p2p-send');
        const receiveBtn = document.getElementById('start-p2p-receive');

        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
        }
        if (receiveBtn) {
            receiveBtn.disabled = false;
            receiveBtn.style.opacity = '1';
        }
    }

    // 정리
    cleanup() {
        if (this.p2pManager) {
            this.p2pManager.close();
            this.p2pManager = null;
        }

        this.closeQRModal();
        this.closeScanModal();

        this.currentStep = null;

        // 버튼 재활성화
        this.enableP2PButtons();

        // 상태 초기화
        const statusDiv = document.getElementById('p2p-status');
        const progressDiv = document.getElementById('p2p-progress');

        if (statusDiv) statusDiv.style.display = 'none';
        if (progressDiv) progressDiv.style.display = 'none';
    }
}

// 전역으로 노출
window.P2PUIHandler = P2PUIHandler;
