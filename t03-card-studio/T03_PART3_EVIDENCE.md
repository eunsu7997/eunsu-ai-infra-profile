# T03 Part 3 조건 검증 — PIXEL CARD STUDIO

검증 범위: **C25~C32**  
기준 편집기: PNG/JPEG 1장 + 문구 1개 + 1:1 / 4:5 / 9:16 + PNG 저장 + 템플릿 CRUD + JSON 백업/복원

## C25 — 완성 이미지 3개
- `final-examples/final_01_square.png` — 1:1 / `CREATE\nYOUR MOMENT`
- `final-examples/final_02_feed.png` — 4:5 / `BUILD.\nTEST.\nSHIP.`
- `final-examples/final_03_story.png` — 9:16 / `KEEP MOVING\n한 걸음씩 앞으로`
- 서로 다른 문구와 비율을 사용함.
- **PASS**

## C26 — 완성 이미지 3개 정상 열림
- Pillow 디코딩/검증 PASS.
- 1:1 = `1080×1080` PNG
- 4:5 = `1080×1350` PNG
- 9:16 = `1080×1920` PNG
- **PASS**

## C27 — 제작 방식/출처 기록
완성 이미지 3개 모두 **PIXEL CARD STUDIO의 기본 그라데이션 배경 + 직접 입력한 문구**로 생성했습니다. 외부 사진·외부 이미지·외부 폰트 파일을 사용하지 않았습니다. 따라서 외부 원본 URL이나 제3자 라이선스 증빙이 필요한 요소가 없습니다.
- `final_01_square.png`: 직접 제작
- `final_02_feed.png`: 직접 제작
- `final_03_story.png`: 직접 제작
- **PASS**

## C28 — 공개 이미지 위치정보 메타데이터 0
세 PNG를 다시 열어 EXIF/GPS를 검사했습니다.
- `final_01_square.png`: GPS 없음, EXIF entry 0
- `final_02_feed.png`: GPS 없음, EXIF entry 0
- `final_03_story.png`: GPS 없음, EXIF entry 0
- GPS 포함 이미지: **0건**
- **PASS**

## C29 — 공개 화면/제출물 개인정보 0
`index.html`, `script.js`, `style.css`, `README.md`, 제출 문서에서 이메일·한국 전화번호·주민번호 형태를 검사했습니다. 발견 0건.
- **PASS**

## C30 — 공개 화면/배포 파일/제출물 비밀값 0
OpenAI key, GitHub token, AWS access key, private key, JWT 형태를 검사했습니다. 발견 0건.
- **PASS**

## C31 — 제출용 짧은 확인법 4요소
`SUBMISSION_TEXT.md`에 다음을 각각 분리해 작성했습니다.
1. 어디로 가나요
2. 무엇을 하나요(3단계 이내)
3. 무엇이 보이면 통과
4. 안 될 때
- **PASS**

## C32 — AI/학생 판단 3요소
`SUBMISSION_TEXT.md`에 다음을 각각 분리해 작성했습니다.
1. AI에게 맡긴 일
2. 내가 직접 판단한 일
3. AI 제안을 따르지 않은 일(없으면 그 이유)
- **PASS**

## Part 3 자동 QA 요약
- C25~C30: **6/6 PASS**
- Console/Page error: **0**
- C31/C32: 제출 문서 구조 검사 **PASS**
- 상세 원시 결과: `qa-results/T03_PART3_QA.json`

## 4차에서 남길 최종 확인
Part 3 기능 구현은 완료했습니다. 4차에서는 공개 GitHub Pages에 올린 뒤 C01 공개 URL, 실제 배포 origin에서 C21 새로고침 유지, 전체 C03~C32 회귀, 고정 commit URL, 최종 제출 문구를 다시 확인합니다.
