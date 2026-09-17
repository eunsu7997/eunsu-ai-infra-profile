# T02 최종 제출 체크리스트 — RAID//ZERO

> 과제 화면 기준 조건 번호는 **C01 + C03~C31 = 총 30개**입니다. C02는 과제 화면에 없습니다.
> 최종 게임 기준: **28초 / HP 5 / 3 Phase / 기본 패턴 간격 0.70초 / 대시 0.5초 무적 / 실드 코어 1.5초 무적**.

| 조건 | 상태 | 최종 재검사 근거 |
|---|---|---|
| C01 | **PASS** | GitHub 저장소 public + 사용자 InPrivate에서 결과/소스 URL 무로그인 확인. |
| C03 | PASS | 핵심 규칙에 실드/대시 무적 포함하여 표시. |
| C04 | PASS | WASD/방향키, Space 대시(+0.5초 무적), P, 결과 화면 R 표시. |
| C05 | PASS | Time, Phase, HP, Score, Combo, Dash, Shield, State 표시. |
| C06 | PASS | Space keydown 1회 → dash action 1회, repeat 무시. |
| C07 | PASS | 한 판 28초, HP0이면 즉시 실패. |
| C08 | PASS | 성공 후 restart → 28초/HP5/Score0/Combo0/Phase1/(480,385). |
| C09 | PASS | 실패 후 restart도 동일 초기화. |
| C10 | PASS | 1366×768 horizontal overflow 0, 시작 모달 viewport 내부. |
| C11 | PASS | 1920×1080 horizontal overflow 0, 시작 모달 viewport 내부. |
| C12 | PASS | Space 10회 → input +10 / action +10. |
| C13 | PASS | viewport 변경 전후 state 동일, controls 유지. |
| C14 | PASS | blur pause → focus resume, pause 중 elapsed 변화 0. |
| C15 | PASS | pause 중 elapsed/HP/hazard 정지, resume 후 이어짐. |
| C16 | **재확인 필요** | 실드/대시 기능 추가 전 600.68초 연속 실행 PASS. 최종 빌드 기준 10분 1회 다시 확인 필요. |
| C17 | **재확인 필요** | 이전 600.68초 테스트 console/page error 0. 최종 빌드 기준 Console red error 0 재확인 필요. |
| C18 | PASS | 최종 gameplay에서 0.65초 자동 QA 10회 기록 확보. |
| C19 | PASS | 최종 gameplay에서 0.70초 자동 QA 10회 기록 확보. |
| C20 | PASS | 비교 시 기본 패턴 간격 한 값만 650↔700 변경. |
| C21 | PASS | 성공 4/10 동일, 최소 생존 22.4→25.9초 개선 + 직접 체감 근거로 0.70초 선택. |
| C22 | PASS | 새 게임 ready: 28초/Phase1/HP5/Score0/Combo0/Dodge0/(480,385). |
| C23 | PASS | wins/bestScore/bestTime reload 보존. |
| C24 | PASS | 빈 storage → 0/0/0 기본값. |
| C25 | PASS | 깨진 JSON → 0/0/0 복구 후 게임 시작 정상. |
| C26 | PASS | 파티클 이벤트 선언: 대시/피격/Phase 전환/실드 획득/클리어·실패. |
| C27 | PASS | 효과 줄이기 ON 즉시 particles 52→0, dashFx null, shake 0. |
| C28 | PASS | 공개 금지 개인정보 없음. |
| C29 | PASS | password/token/API key/private key 없음. |
| C30 | PASS | README/SUBMISSION_TEXT에 위치/3단계 행동/통과/실패 4요소 분리. |
| C31 | PASS | AI 맡김/내 판단/AI 제안 거절 3요소 분리. |

## 최종 기능 확인
- 대시 직후 무적: **0.5초** (`DASH_INVULN=0.5`) 확인.
- 실드 코어: 한 판 **1~2회** 등장, 획득 시 **1.5초 무적** 확인.
- SHIELD HUD에서 남은 무적 시간 표시.
- 0.65초 10회: 성공 4/10, 생존 범위 **22.4~28.0초**, 중앙값 **27.15초**.
- 0.70초 10회: 성공 4/10, 생존 범위 **25.9~28.0초**, 중앙값 **27.1초**.

## 제출 직전 남은 것
1. 최종 공개 URL을 10분 켜 둔다.
2. 10분 뒤 이동/대시/실드 획득 등 조작이 계속 되는지 확인한다.
3. DevTools Console의 빨간 오류가 0건인지 확인한다.
4. 이상 없으면 C16/C17도 PASS로 체크하고 제출한다.
