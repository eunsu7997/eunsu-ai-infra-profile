# Evidence ledger

완료 표시는 **실제 실행 결과가 확인된 항목에만** 사용합니다.

## Final automated validation

최종 AI success-path regression까지 포함한 GitHub Actions **run #53**도 전체 success이며 labeled severity evaluation은 **8/8**입니다.

GitHub Actions **run #53**: `conclusion=success`

검증 단계:
- Python dependencies installation
- pytest regression tests
- Docker Compose config validation
- Kubernetes manifest Helm lint
- Docker image build
- Docker container boot
- `GET /healthz`
- `POST /analyze` semantic assertion
- Prometheus metrics endpoint
- Prometheus + Grafana runtime
- Prometheus target scrape `up=1`
- Locust load smoke test

## Load smoke result

Environment: GitHub-hosted runner, deterministic analyzer, 10 users, 10 seconds.

- Requests: 300
- Failures: 0 (0.00%)
- Throughput: ~30.79 requests/s
- Median: 2 ms
- p95: 3 ms
- Observed max: ~33 ms

이 결과는 LLM/GPU inference benchmark가 아니라 **API 및 운영 stack의 재현 가능한 smoke-load 증거**입니다.

## Failure -> root cause -> correction

### Python import failure
Symptom: `ModuleNotFoundError: app`.
Correction: workflow working directory를 `incident-copilot`로 고정하고 `PYTHONPATH=.`, `python -m pytest`를 사용했습니다.
Result: regression tests success.

### Docker port collision
Symptom: monitoring Compose가 `Bind for 0.0.0.0:8000 failed: port is already allocated`로 실패했습니다.
Root cause: 앞 smoke-test container가 8000 포트를 점유했습니다.
Correction: smoke 검증 직후 container를 제거해 포트를 반환했습니다.

### Prometheus first-scrape race
Symptom: Prometheus/Grafana는 정상 기동했지만 query 결과가 empty vector였습니다.
Root cause: 첫 scrape 전에 `up{job="incident-copilot"}`을 조회했습니다.
Correction: 최대 30초 polling 후 `up=1`을 assert하도록 변경했습니다.

### Final result
run #53에서 test, Docker, Kubernetes lint, monitoring runtime, load smoke가 모두 success였습니다.

## Not claimed yet

- real OpenAI-compatible/vLLM endpoint E2E
- NVIDIA GPU allocation/model loading
- real Kubernetes cluster probe behavior capture
- GPU/LLM latency or throughput benchmark

증거가 없는 항목을 제출 자료에서 완료로 표현하지 않습니다.
