# T02 최종 제출 체크리스트 — RAID//ZERO

> 과제 화면 기준 조건 번호는 **C01 + C03~C31 = 총 30개**입니다. C02는 과제 화면에 없습니다.
> 최종 게임 기준: **28초 / HP 5 / 3 Phase / 기본 패턴 간격 0.70초**.

| 조건 | 상태 | 최종 재검사 근거 |
|---|---|---|
| C01 | **PASS** | GitHub 저장소 public 확인 + 사용자 InPrivate에서 결과/소스 두 URL 무로그인 확인 완료. |
| C03 | PASS | 핵심 규칙 3개 상시 표시. |
| C04 | PASS | WASD/방향키, Space, P, 결과 화면 R 재시작 상시 표시. |
| C05 | PASS | Time, Phase, HP, Score, Combo, Dash, State 표시. |
| C06 | PASS | Space keydown 1회 → coreDashAction 1회, repeat 무시. |
| C07 | PASS | ROUND_SECONDS=28. 최종 제출 파일에 60초 값 없음. |
| C08 | PASS | 성공 후 restart 초기화 런타임 확인. |
| C09 | PASS | 실패 후 restart 초기화 런타임 확인. |
| C10 | PASS | 1366×768: 시작 모달 안 잘림, horizontal overflow 0. |
| C11 | PASS | 1920×1080: 시작 모달 안 잘림, horizontal overflow 0. |
| C12 | PASS | Space 10회 → input +10 / action +10. |
| C13 | PASS | viewport 변경 전후 state 동일, controls 유지. |
| C14 | PASS | blur pause → focus same-state resume → 이동 정상. |
| C15 | PASS | pause 중 게임 상태 정지, resume 후 이어짐. |
| C16 | PASS | 실제 Chromium 600.68초 연속 실행 후 이동 정상. |
| C17 | PASS | 600.68초 동안 console error 0, page error 0. |
| C18 | PASS | 0.65초 동일 조건 자동 입력 10회 기록 확보. |
| C19 | PASS | 0.70초 동일 조건 자동 입력 10회 기록 확보. |
| C20 | PASS | 비교 시 ATTACK_INTERVAL_MS 한 값만 변경. |
| C21 | PASS | 생존 중앙값 20.25→20.85초 + 직접 체감 ‘0.65초는 빡셈’ 근거로 0.70초 선택. |
| C22 | PASS | 새 게임 초기 ready state 확인. |
| C23 | PASS | wins/bestScore/bestTime reload 보존 확인. |
| C24 | PASS | 빈 storage → 0/0/0 기본값 정상. |
| C25 | PASS | 깨진 JSON → 0/0/0 복구 후 게임 시작 정상. |
| C26 | PASS | 화면 선언과 burst 호출 이벤트 일치: 대시/피격/Phase 전환/클리어·실패. |
| C27 | PASS | 줄이기 ON 즉시 particles/shake/dashFx/clearFx 제거. |
| C28 | PASS | 이메일/전화번호 패턴 0건, 공개 금지 개인정보 없음. |
| C29 | PASS | password/token/API key/private key 패턴 0건. |
| C30 | PASS | README에 위치/3단계 행동/통과/실패 4요소 분리. |
| C31 | PASS | README에 AI 맡김/내 판단/AI 제안 거절 3요소 분리. |

## 핵심 자동 검사 수치

- 1366×768: `innerWidth 1366 == scrollWidth 1366`
- 1920×1080: `innerWidth 1920 == scrollWidth 1920`
- 핵심 입력 10회: `coreInputEvents +10`, `coreActions +10`
- C16/C17 실제 연속 테스트: **600.68초**, 30판 시작/29판 종료, 종료 후 이동 정상, console/page errors 0
- C18 0.65초: 생존 범위 **19.3~25.1**, 중앙값 **20.25**
- C19 0.70초: 생존 범위 **18.3~25.1**, 중앙값 **20.85**

## 최종 제출 상태

- **C01 + C03~C31 전부 PASS**
- 최종 공개 게임은 **28초**
- 최종 기본 패턴 간격은 **0.70초**
- 60초 원본은 최종 제출 경로에서 사용하지 않음
