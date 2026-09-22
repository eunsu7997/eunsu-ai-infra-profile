# SK hynix AI Hackathon portfolio copy

## 한 줄 소개
**장애 로그를 AI와 함께 분석해 원인 후보·조치 순서·검증 절차로 바꾸는 AI Infrastructure 운영 도구**

## 문제
운영 장애는 로그가 많고 원인이 여러 계층에 걸쳐 있어 초동 조사 순서를 잡는 데 시간이 듭니다.

## 해결
FastAPI로 로그를 입력받아 구조화된 incident report를 반환합니다. API 키가 없는 환경에서는 deterministic analyzer로 재현할 수 있고, OpenAI-compatible adapter를 통해 vLLM 등 LLM endpoint로 확장할 수 있습니다.

## 차별점
AI 답을 정답으로 취급하지 않습니다. 원인 후보와 조치안을 실제 로그·메트릭·Kubernetes 이벤트로 검증하도록 workflow 자체에 Human Verification을 넣었습니다.

## 보여줄 수 있는 구현
FastAPI, pytest, Docker, Kubernetes probes/resources, Prometheus metrics, Grafana provisioning/dashboard, Locust 부하테스트 시나리오, OpenAI-compatible LLM adapter와 fallback.

## 정직한 검증 범위
코드/자동 테스트와 실제 실행 캡처를 구분합니다. GPU/vLLM, Kubernetes 클러스터, Grafana 화면 및 부하테스트 수치는 실제 실행 증거를 확보한 뒤에만 완료로 표시합니다.
