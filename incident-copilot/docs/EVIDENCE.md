# Evidence ledger

이 문서는 **실행 증거가 확인된 항목만 완료로 올리기 위한 장부**입니다.

## 자동 검증에서 확인된 항목

- Python dependencies 설치
- pytest API regression tests
- Docker Compose configuration validation
- Kubernetes manifest Helm lint
- Docker image build
- Docker container boot
- `GET /healthz`
- `POST /analyze` 장애 판정
- Prometheus metric endpoint
- Prometheus/Grafana runtime 검증 workflow
- Locust reproducible load smoke test workflow

## 실패 → 수정 기록

### CI #18 — Python import 실패
`ModuleNotFoundError: app`을 확인했습니다. workflow에서 `PYTHONPATH=.`과 `python -m pytest`를 사용하도록 수정했습니다.

### CI #26 — Docker port collision
smoke-test container가 8000 포트를 점유한 채 monitoring stack을 시작해 Compose가 실패했습니다. smoke test 직후 컨테이너를 제거하도록 lifecycle을 수정했습니다.

### CI #32 — Prometheus 첫 scrape race
Prometheus와 Grafana는 정상 기동했지만 첫 scrape 전에 `up`을 조회해 빈 vector가 반환됐습니다. 최대 30초 polling 후 `up=1`을 검증하도록 수정했습니다.

## 완료 판정 규칙

workflow에 단계가 존재하는 것만으로 완료라고 하지 않습니다. 해당 commit의 GitHub Actions run이 `conclusion=success`여야 완료입니다.

## 별도 환경이 필요한 증거

다음은 CI 성공과 별개로 실제 환경 증거가 필요합니다.

- 실제 OpenAI-compatible/vLLM endpoint E2E
- NVIDIA GPU 할당/모델 로딩
- 실제 Kubernetes cluster에서 probe 동작 캡처
- 실제 Grafana dashboard 화면 캡처/GIF

이 항목들은 증거가 생기기 전에는 포트폴리오에서 완료로 표현하지 않습니다.
