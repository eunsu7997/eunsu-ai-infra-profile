# AI-assisted problem-solving record

## 1. 문제 정의
운영 장애에서 중요한 것은 로그를 단순 요약하는 것이 아니라 **어디부터 확인할지 조사 순서를 빠르게 만드는 것**이라고 정의했습니다.

## 2. AI에게 맡긴 범위
- FastAPI API/테스트 초안
- 장애 패턴과 실패 시나리오 후보
- Docker/Kubernetes/observability 구성 검토
- 문서 누락 및 과장 표현 점검

## 3. 사람이 판단한 범위
- 운영 변경을 AI가 자동 실행하지 않도록 제한
- AI 원인 추정을 사실로 표현하지 않고 `likely_causes`로 표현
- 실제 검증하지 않은 GPU/vLLM/Kubernetes/Grafana 결과는 완료로 표시하지 않음
- API 키 없이도 심사자가 재현할 수 있도록 deterministic fallback 유지

## 4. 실제 수정 사례
초기 GitHub Actions 파일을 `incident-copilot/.github/workflows/`에 두어 CI가 실행되지 않는 문제가 있었습니다. GitHub Actions가 저장소 루트의 `.github/workflows/`를 사용한다는 점을 다시 확인해 루트 workflow를 추가했습니다.

이 사례는 AI가 만든 결과도 그대로 신뢰하지 않고 **실행 여부 → 원인 확인 → 수정 → 재검증**해야 한다는 프로젝트 원칙으로 반영했습니다.

## 5. LLM 안전장치
OpenAI-compatible adapter의 프롬프트는 로그를 명령이 아니라 데이터로 취급하도록 지시합니다. 응답은 구조화 JSON으로 제한하며, endpoint 실패 시 deterministic analyzer로 fallback합니다. 어떤 모드에서도 조치안을 자동 실행하지 않습니다.
