import urllib.error

from fastapi.testclient import TestClient
import app.analyzers as analyzers
from app.main import app

client = TestClient(app)

def test_health():
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").status_code == 200

def test_oom_is_critical():
    r = client.post("/analyze", json={"service":"llm-serving","logs":"Pod terminated: OOMKilled. CUDA out of memory"})
    assert r.status_code == 200
    body = r.json()
    assert body["severity"] == "CRITICAL"
    assert body["mode"] == "deterministic-demo"
    assert body["verification"]

def test_connection_refused_is_high():
    r = client.post("/analyze", json={"service":"gateway","logs":"upstream connection refused"})
    assert r.json()["severity"] == "HIGH"

def test_unknown_log_is_low():
    r = client.post("/analyze", json={"service":"demo","logs":"application started normally"})
    assert r.json()["severity"] == "LOW"

def test_metrics_exposed():
    client.post("/analyze", json={"service":"demo","logs":"application started normally"})
    r = client.get("/metrics/", follow_redirects=True)
    assert r.status_code == 200
    assert "incident_analyses_total" in r.text
    assert "incident_analysis_seconds" in r.text

def test_timeout_is_high():
    r = client.post("/analyze", json={"service":"gateway","logs":"request timed out: deadline exceeded"})
    assert r.status_code == 200
    assert r.json()["severity"] == "HIGH"

def test_llm_endpoint_failure_falls_back(monkeypatch):
    monkeypatch.setenv("ANALYZER_MODE", "openai-compatible")
    monkeypatch.setenv("LLM_BASE_URL", "http://example.invalid/v1")
    monkeypatch.setenv("LLM_MODEL", "demo-model")

    def offline(*args, **kwargs):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr(analyzers.urllib.request, "urlopen", offline)
    r = client.post("/analyze", json={"service":"llm-serving","logs":"CUDA out of memory"})
    body = r.json()
    assert r.status_code == 200
    assert body["severity"] == "CRITICAL"
    assert body["mode"] == "deterministic-demo"
    assert "fallback" in body["summary"]
