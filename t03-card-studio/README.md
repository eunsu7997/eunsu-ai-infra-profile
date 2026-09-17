# PIXEL CARD STUDIO — ALEPH T03 최종본

브라우저에서 PNG/JPEG 이미지를 불러와 문구를 배치하고, 1:1 · 4:5 · 9:16 카드로 미리보기/저장하는 편집기입니다.

## 최종 기능
- PNG / JPEG 불러오기
- 지원하지 않거나 손상된 파일은 거부하고 기존 편집 상태 유지
- 이미지 Cover/Contain, 확대, X/Y 위치
- 문구 내용, X/Y 위치, 크기, 색상, 정렬, 줄 간격, 그림자
- 1:1(1080×1080) / 4:5(1080×1350) / 9:16(1080×1920)
- 미리보기와 PNG 다운로드는 동일 Canvas 렌더링 사용
- 사용자 템플릿 생성/불러오기/수정/삭제
- IndexedDB 기반 템플릿 저장
- 현재 편집 상태 JSON 내보내기/가져오기
- 손상 JSON / 필수 항목 누락 JSON 안전 거부
- 완성 이미지 3개 및 조건별 QA 기록

## 조건 검증 요약
- C03~C16: 14/14 PASS
- C17~C24: 8/8 자동 회귀 PASS
- C25~C32: 8/8 PASS
- Console/Page error: 0
- C21은 실제 공개 GitHub Pages origin에서 템플릿 저장 → F5 → 유지 여부를 제출 직전 브라우저에서 한 번 더 확인합니다.

## 완성 이미지
- `final-examples/final_01_square.png` — 1:1
- `final-examples/final_02_feed.png` — 4:5
- `final-examples/final_03_story.png` — 9:16

세 이미지는 기본 그라데이션 배경과 직접 입력한 문구로 제작했습니다. 외부 사진·외부 이미지·외부 폰트 파일을 사용하지 않았습니다.

## 제출용 문서
- `T03_PART1_EVIDENCE.md`
- `T03_PART2_EVIDENCE.md`
- `T03_PART3_EVIDENCE.md`
- `T03_FINAL_CHECKLIST.md`
- `SUBMISSION_TEXT.md`
