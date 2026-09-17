# T02 최종 제출 체크리스트 — RAID//ZERO

> 과제 화면 기준 조건 번호는 **C01 + C03~C31 = 총 30개**입니다. C02는 과제 화면에 없습니다.
> 최종 게임 기준: **28초 / HP 5 / 3 Phase / 기본 패턴 간격 0.75초 / 대시 0.5초 무적 / 실드 코어 1.5초 무적**.

| 조건 | 상태 | 최종 재검사 근거 |
|---|---|---|
| C01 | **PASS** | 저장소 public + 사용자 InPrivate에서 결과/소스 무로그인 확인. |
| C03 | PASS | 핵심 규칙에 장판/HP/실드 1.5초/대시 0.5초/28초 성공 조건 표시. |
| C04 | PASS | WASD/방향키, Space 대시(+0.5초 무적), P, 결과 화면 R 표시. |
| C05 | PASS | Time, Phase, HP, Score, Combo, Dash, Shield, State 표시. |
| C06 | PASS | Space keydown 1회 → dash 처리 1회, repeat 무시. |
| C07 | PASS | 한 판 28초, HP0이면 즉시 실패. |
| C08 | PASS | 성공 후 restart 시 fresh state로 초기화. |
| C09 | PASS | 실패 후 restart도 동일 초기화. |
| C10 | PASS | 최종 0.75초 빌드 1366×768 overflow 0, 시작 모달 viewport 내부. |
| C11 | PASS | 최종 0.75초 빌드 1920×1080 overflow 0, 시작 모달 viewport 내부. |
| C12 | PASS | 최종 빌드 Space 10회 → input +10 / action +10. |
| C13 | PASS | resize 시 game state 재생성 없음; 기존 Chromium 상태 유지 검사 PASS. |
| C14 | PASS | blur pause → focus resume; 기존 Chromium 검사 PASS. |
| C15 | PASS | 최종 빌드 pause 중 elapsed 변화 0.0. |
| C16 | **재확인 필요** | 실드/대시/0.75 최종 빌드 공개 URL에서 10분 연속 조작 재확인 필요. |
| C17 | **재확인 필요** | 같은 10분 동안 DevTools Console red error 0 재확인 필요. |
| C18 | PASS | 최종 gameplay에서 0.65초 자동 QA 10회 기록 확보. |
| C19 | PASS | 최종 gameplay에서 0.75초 자동 QA 10회 기록 확보. |
| C20 | PASS | 비교 시 `INT` 한 값만 650↔750 변경. |
| C21 | PASS | 자동 QA는 0.65초 6/10, 0.75초 5/10으로 우열이 단순하지 않음. 최소 생존 22.4→24.0초 + 직접 체감/완화 요청 근거로 0.75초 선택. |
| C22 | PASS | ready: 28초/Phase1/HP5/Score0/Combo0/Dodge0/(480,385). |
| C23 | PASS | wins/bestScore/bestTime reload 보존. |
| C24 | PASS | 빈 storage → 0/0/0 기본값. |
| C25 | PASS | 깨진 JSON → 0/0/0 복구 후 정상 시작. |
| C26 | PASS | 파티클 이벤트: 대시/피격/Phase 전환/실드 획득/클리어·실패. |
| C27 | PASS | 효과 줄이기 ON 즉시 particles/shake/dashFx/clearFx 제거, 판정 유지. |
| C28 | PASS | 공개 금지 개인정보 없음. |
| C29 | PASS | password/token/API key/private key 없음. |
| C30 | PASS | README/SUBMISSION_TEXT에 위치/3단계 행동/통과/실패 4요소 분리. |
| C31 | PASS | AI 맡김/내 판단/AI 제안 거절 3요소 분리. |

## 최종 기능 값
- 기본 패턴 간격: **0.75초** (`INT=750`)
- 대시 직후 무적: **0.5초** (`DASH_I=.5`)
- 실드 코어: 한 판 **1~2회**, 획득 시 **1.5초 무적** (`SHIELD_I=1.5`)
- SHIELD HUD: 실드 무적 남은 시간 표시
- Phase 3 추적 도넛: **inner 50 / outer 120**으로 축소
- 난이도 비교: 0.65초 성공 6/10·생존 범위 22.4~28.0초 → 0.75초 성공 5/10·생존 범위 24.0~28.0초

## 제출 직전 남은 것
1. 최종 공개 URL을 열고 10분 동안 여러 판 플레이/재시작한다.
2. 10분 뒤에도 이동, 대시, 실드 획득이 정상인지 확인한다.
3. DevTools Console 빨간 오류가 0건인지 확인한다.
4. 이상 없으면 C16/C17도 PASS로 체크하고 제출한다.
