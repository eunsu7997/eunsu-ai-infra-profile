# AI Incident Copilot

운영 로그를 입력하면 장애 신호를 분류하고 **원인 후보 → 조치 → 검증 절차**를 구조화해 주는 AI 인프라 포트폴리오 프로젝트입니다.

> 현재 v0.1은 외부 API 키 없이 재현 가능한 **deterministic demo**입니다. 실제 LLM이 분석했다고 과장하지 않습니다. 다음 단계에서 LLM adapter를 연결하되, 운영 변경은 항상 사람이 검증하도록 설계합니다.

## Why

ITS 유지보수 현장에서는 장애를 발견하는 것보다 "어디부터 확인해야 하는가"를 빠르게 정리하는 일이 중요했습니다. 이 경험을 AI Infrastructure 학습과 연결해, 로그를 받으면 조사 순서를 구조화하는 작은 운영 도구를 만들었습니다.

## Architecture

```text
Operator / Log
      |
      v
 FastAPI Gateway
      |
      +--> Incident rule engine (v0.1 reproducible demo)
      |
      +--> /metrics (Prometheus format)
      |
      +--> healthz / readyz
```

Kubernetes에서는 startup/readiness/liveness probe와 resource request/limit을 정의했습니다.

## Run

```bash
cd incident-copilot
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

다른 터미널에서:

```bash
curl -X POST http://127.0.0.1:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"service":"llm-serving","logs":"Pod terminated: OOMKilled. CUDA out of memory"}'
```

예상 핵심 결과: `severity=CRITICAL`, OOM 신호/원인 후보/조치/검증 절차.

## Test

```bash
pytest -q
```

테스트는 health/readiness, OOM, connection refused, 정상 로그 경로를 확인합니다. GitHub Actions에서도 동일 테스트를 실행하도록 구성했습니다.

## Container

```bash
docker compose up --build
```

## Kubernetes

```bash
kubectl apply -f k8s/deployment.yaml
kubectl port-forward svc/incident-copilot 8000:80
```

로컬 이미지 사용 시 kind/minikube 환경에 이미지를 먼저 로드해야 합니다.

## Observability

`/metrics`에서 Prometheus 형식으로 다음 애플리케이션 지표를 노출합니다.

- `incident_analyses_total{severity=...}`
- `incident_analysis_seconds`

## SHOW & PROVE

| 주장 | 확인 방법 |
|---|---|
| API가 살아 있다 | `GET /healthz` |
| 트래픽 수신 준비 | `GET /readyz` |
| OOM 분류 | 테스트 또는 `POST /analyze` |
| 관측 가능 | `GET /metrics` |
| 컨테이너화 | `Dockerfile`, `docker-compose.yml` |
| K8s 운영 기본기 | probes + resources YAML |
| 회귀 방지 | pytest + GitHub Actions |

## AI 활용 원칙

AI는 설계·코드 초안·테스트 케이스·문서 검토에 활용합니다. 하지만 **실행 결과와 실제 구현 범위를 분리해 기록**하고, 생성된 조치안을 운영 환경에 자동 적용하지 않습니다.

## Next

v0.2: LLM adapter(vLLM/OpenAI-compatible endpoint), 구조화 출력 검증, Prometheus/Grafana 대시보드, 장애 시나리오 실험 기록.
