from fastapi.testclient import TestClient
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
