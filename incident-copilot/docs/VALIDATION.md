# Validation record

이 문서는 **실제로 확인한 것과 아직 확인하지 않은 것**을 분리하기 위한 기록입니다.

## 코드로 재현하도록 작성한 검증

- `GET /healthz`, `GET /readyz`
- OOM/CUDA memory → CRITICAL
- connection refused → HIGH
- 알려지지 않은 정상 로그 → LOW
- `/metrics` Prometheus endpoint
- OpenAI-compatible adapter가 실패하면 deterministic analyzer로 fallback

자동 테스트는 `tests/`와 GitHub Actions workflow에 정의합니다.

## 아직 완료했다고 주장하지 않는 검증

- 실제 GPU에서 vLLM 모델 로딩
- 실제 vLLM endpoint와 adapter end-to-end 호출
- Kubernetes 클러스터에서 probe 동작 캡처
- Prometheus/Grafana 실제 대시보드 캡처
- 부하 테스트 수치

위 항목은 실제 실행 증거가 생긴 뒤에만 README의 완료 항목으로 승격합니다.

## 장애 시나리오

| 시나리오 | 입력 | 기대 분류 | 다음 확인 |
|---|---|---|---|
| GPU/Pod OOM | `samples/oom.log` | CRITICAL | OOMKilled, GPU/메모리 사용량 |
| Backend down | `samples/backend-down.log` | HIGH | Pod, endpoint, readiness |
| Overload | `samples/overload.log` | HIGH | latency, queue, dependency |

## 검증 원칙

AI가 제안한 원인을 사실로 확정하지 않습니다. 로그·메트릭·Kubernetes 이벤트와 대조하고, 변경 전후 상태를 기록한 뒤 같은 요청으로 재검증합니다.
