from __future__ import annotations

import re
import time
from collections import Counter
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field
from prometheus_client import Counter as PromCounter, Histogram, make_asgi_app

app = FastAPI(title="AI Incident Copilot", version="0.1.0")
app.mount("/metrics", make_asgi_app())

ANALYSES = PromCounter("incident_analyses_total", "Number of incident analyses", ["severity"])
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
    mode: Literal["deterministic-demo"]

RULES = [
    (re.compile(r"out of memory|oomkilled|cuda.*memory", re.I), "CRITICAL",
     "메모리 고갈/OOM 신호",
     "컨테이너 또는 GPU 메모리 한도 초과",
     "최근 메모리 사용량과 OOMKilled 이벤트를 확인하고 요청량/모델 크기/limit을 조정"),
    (re.compile(r"connection refused|failed to connect", re.I), "HIGH",
     "백엔드 연결 거부",
     "백엔드 프로세스 중단, 잘못된 포트 또는 Service endpoint 부재",
     "백엔드 Pod/프로세스, 포트, Service endpoint와 readiness 상태를 순서대로 확인"),
    (re.compile(r"timeout|timed out|deadline exceeded", re.I), "HIGH",
     "요청 시간 초과",
     "과부하, 느린 의존 서비스 또는 네트워크 지연",
     "지연시간과 큐 길이를 확인하고 의존 서비스 상태 및 timeout 설정을 검토"),
    (re.compile(r"5\d\d|internal server error", re.I), "MEDIUM",
     "5xx 오류",
     "애플리케이션 예외 또는 의존 서비스 실패",
     "오류 직전 로그와 trace/request id를 확인하고 실패한 의존성을 분리"),
    (re.compile(r"disk.*full|no space left", re.I), "HIGH",
     "디스크 공간 부족",
     "로그/캐시/이미지 누적으로 가용 공간 소진",
     "파일시스템 사용량을 확인하고 안전한 정리 후 보존 정책을 점검"),
]

RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

@app.get("/readyz")
def readyz():
    return {"status": "ready"}

@app.post("/analyze", response_model=IncidentReport)
def analyze(req: IncidentRequest):
    start = time.perf_counter()
    matches = []
    for pattern, severity, signal, cause, action in RULES:
        if pattern.search(req.logs):
            matches.append((severity, signal, cause, action))

    if matches:
        severity = max(matches, key=lambda item: RANK[item[0]])[0]
        signals = list(dict.fromkeys(m[1] for m in matches))
        causes = list(dict.fromkeys(m[2] for m in matches))
        actions = list(dict.fromkeys(m[3] for m in matches))
        summary = f"{req.service} 로그에서 {', '.join(signals)}을 감지했습니다."
    else:
        severity = "LOW"
        signals = ["정의된 주요 장애 패턴 없음"]
        causes = ["현재 로그만으로 특정 원인을 확정하기 어려움"]
        actions = ["추가 로그, 메트릭, 최근 배포 변경사항을 함께 확인"]
        summary = f"{req.service} 로그에서 사전 정의된 주요 장애 패턴을 찾지 못했습니다."

    verification = [
        "제안 내용을 그대로 실행하지 말고 실제 로그·메트릭·이벤트와 대조",
        "변경 전 현재 상태와 재현 절차를 기록",
        "조치 후 동일 요청을 재실행해 오류율·지연시간·상태를 비교",
    ]
    ANALYSES.labels(severity=severity).inc()
    LATENCY.observe(time.perf_counter() - start)
    return IncidentReport(
        service=req.service, severity=severity, summary=summary,
        signals=signals, likely_causes=causes, recommended_actions=actions,
        verification=verification, mode="deterministic-demo"
    )
