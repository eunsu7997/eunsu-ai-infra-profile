# SK hynix AI Hackathon 2026 — AI Incident Copilot

## 한 줄 소개
**장애 로그를 AI가 원인 후보·조치 순서·검증 절차로 구조화하고, 사람이 운영 증거로 검증하는 AI Infrastructure Incident Copilot**

## 문제 정의
운영 장애에서는 로그가 여러 계층에 흩어지고 하나의 증상이 여러 원인에서 발생합니다. 단순 로그 요약보다 중요한 것은 초동 조사 순서를 만들고, 잘못된 AI 판단이 곧바로 운영 조치로 이어지지 않도록 검증하는 것입니다.

## AI가 실제로 맡는 역할
OpenAI-compatible analyzer는 서비스명과 원시 로그를 입력받아 severity, summary, signals, likely causes, recommended actions를 구조화합니다. 로그 내부 문장을 명령으로 취급하지 않도록 prompt에 명시하고, 결과 severity를 허용된 enum으로 제한합니다. endpoint 실패나 잘못된 응답에서는 deterministic analyzer로 fallback합니다.

## 사람이 맡는 역할
AI의 원인 후보와 조치 추천은 자동 실행하지 않습니다. API가 verification 절차를 함께 반환하며, 운영자는 로그·Prometheus metrics·Kubernetes events와 대조한 뒤 조치합니다. 즉 AI는 판단을 돕고, 최종 운영 판단은 증거 기반으로 사람이 수행합니다.

## SHOW & PROVE
GitHub Actions CI #47에서 pytest, 8-case severity evaluation, Docker Compose validation, Kubernetes manifest lint, Docker image build/runtime, API smoke, Prometheus/Grafana runtime, Prometheus scrape, Locust load smoke가 모두 성공했습니다.

최신 load smoke: 10 users / 10 seconds, 299 requests, 0 failures, 약 31.02 req/s, median 2 ms, p95 3 ms. 이는 deterministic analyzer의 API/운영 stack 검증이며 LLM/GPU benchmark로 과장하지 않습니다.

## 실패에서 개선한 과정
1. Python import failure → working-directory/PYTHONPATH 수정 → tests pass
2. Docker port collision → smoke container lifecycle 수정 → monitoring stack pass
3. Prometheus first-scrape race → polling 후 up=1 검증 → monitoring pass
4. LLM endpoint failure → deterministic fallback regression test
5. LLM structured success path → mock OpenAI-compatible response를 사용해 parsing·mode·verification contract 자동 검증

## 현재 검증 경계
실제 OpenAI-compatible/vLLM endpoint와 NVIDIA GPU inference는 별도 GPU 환경에서 아직 E2E 증거가 없습니다. 따라서 '실제 LLM 성능을 검증했다'고 주장하지 않습니다. 대신 LLM protocol success/failure path와 운영 fallback을 자동 테스트하고, 실제 실행 가능한 deterministic path로 전체 stack을 재현했습니다.

## 제출자가 보여주려는 역량
AI 결과를 그대로 믿는 것이 아니라 문제를 구조화하고, 실행 가능한 시스템으로 만들고, 실패를 재현하고, 관측하고, 검증 결과에 따라 수정하는 능력입니다.
