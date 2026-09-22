from locust import HttpUser, between, task

SAMPLES = [
    {"service":"llm-serving","logs":"Pod terminated: OOMKilled. CUDA out of memory"},
    {"service":"gateway","logs":"upstream connection refused"},
    {"service":"gateway","logs":"request timed out: deadline exceeded"},
]

class IncidentUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task
    def analyze(self):
        for sample in SAMPLES:
            with self.client.post("/analyze", json=sample, catch_response=True) as response:
                if response.status_code != 200:
                    response.failure(f"HTTP {response.status_code}")
