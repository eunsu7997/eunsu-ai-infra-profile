from __future__ import annotations

import time
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, make_asgi_app

from app.analyzers import get_analyzer

app = FastAPI(title="AI Incident Copilot", version="0.2.0")
app.mount("/metrics", make_asgi_app())

ANALYSES = Counter("incident_analyses_total", "Number of incident analyses", ["severity", "mode"])
LATENCY = Histogram("incident_analysis_seconds", "Incident analysis latency")

class IncidentRequest(BaseModel):
    service: str = Field(min_length=1, max_length=80)
    logs: str = Field(min_length=1, max_length=20000)

class IncidentReport(BaseModel):
    service: str
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    summary: str
    signals: list[str]
    likely_causes: list[str]
    recommended_actions: list[str]
    verification: list[str]
    mode: str

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

@app.get("/readyz")
def readyz():
    return {"status": "ready"}

@app.post("/analyze", response_model=IncidentReport)
def analyze(req: IncidentRequest):
    start = time.perf_counter()
    result = get_analyzer().analyze(req.service, req.logs)
    verification = [
        "제안 내용을 그대로 실행하지 말고 실제 로그·메트릭·이벤트와 대조",
        "변경 전 현재 상태와 재현 절차를 기록",
        "조치 후 동일 요청을 재실행해 오류율·지연시간·상태를 비교",
    ]
    ANALYSES.labels(severity=result.severity, mode=result.mode).inc()
    LATENCY.observe(time.perf_counter() - start)
    return IncidentReport(
        service=req.service, severity=result.severity, summary=result.summary,
        signals=result.signals, likely_causes=result.likely_causes,
        recommended_actions=result.recommended_actions,
        verification=verification, mode=result.mode,
    )
