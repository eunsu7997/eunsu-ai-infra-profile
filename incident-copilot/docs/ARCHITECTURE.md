# Architecture

```mermaid
flowchart LR
    A[Operator / Incident Log] --> B[FastAPI /analyze]
    B --> C{ANALYZER_MODE}
    C -->|default| D[Deterministic Rule Analyzer]
    C -->|openai-compatible| E[LLM Adapter]
    E -->|vLLM or compatible API| F[LLM Endpoint]
    E -->|failure| D
    D --> G[Structured Incident Report]
    E --> G
    G --> H[Human Verification]
    B --> I[/metrics]
    I --> J[Prometheus]
    J --> K[Grafana]
    L[Kubernetes] --> B
    L --> M[Startup / Readiness / Liveness]
```

## 설계 의도
심사자가 API 키 없이도 핵심 흐름을 재현할 수 있고, LLM endpoint가 있으면 같은 API 계약을 유지한 채 분석기만 교체할 수 있습니다. AI 출력은 운영 명령이 아니라 조사 가설이며 최종 단계는 Human Verification입니다.
