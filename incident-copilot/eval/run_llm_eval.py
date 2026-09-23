from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.analyzers import OpenAICompatibleAnalyzer

DATASET = ROOT / "eval" / "incidents.json"
RESULT_DIR = ROOT / "eval" / "results"
RESULT_PATH = RESULT_DIR / "llm_eval.json"

DEFAULT_BASE_URL = "http://localhost:8001/v1"


def main() -> None:
    os.environ.setdefault("LLM_BASE_URL", DEFAULT_BASE_URL)
    os.environ.setdefault("LLM_API_KEY", "EMPTY")
    if not os.getenv("LLM_MODEL"):
        raise SystemExit(
            "LLM_MODEL is required. Set it to the exact model served by vLLM."
        )

    cases = json.loads(DATASET.read_text(encoding="utf-8"))
    analyzer = OpenAICompatibleAnalyzer()

    results = []
    llm_responses = 0
    fallback_responses = 0
    correct = 0
    explicit_correct = 0
    explicit_total = 0
    semantic_correct = 0
    semantic_total = 0

    print(f"LLM base URL: {analyzer.base_url}")
    print(f"LLM model: {analyzer.model}")
    print(f"Cases: {len(cases)}")
    print()

    for case in cases:
        analysis = analyzer.analyze(case["service"], case["logs"])
        is_llm = analysis.mode == "openai-compatible"
        severity_ok = analysis.severity == case["expected_severity"]

        if is_llm:
            llm_responses += 1
            correct += int(severity_ok)
            if case.get("case_type") == "explicit":
                explicit_total += 1
                explicit_correct += int(severity_ok)
            elif case.get("case_type") == "semantic":
                semantic_total += 1
                semantic_correct += int(severity_ok)
        else:
            fallback_responses += 1

        row = {
            "id": case["id"],
            "case_type": case.get("case_type", "unknown"),
            "expected_severity": case["expected_severity"],
            "actual_severity": analysis.severity,
            "severity_correct": severity_ok if is_llm else None,
            "expected_signal": case["expected_signal"],
            "actual_signals": analysis.signals,
            "summary": analysis.summary,
            "likely_causes": analysis.likely_causes,
            "recommended_actions": analysis.recommended_actions,
            "mode": analysis.mode,
        }
        results.append(row)

        if not is_llm:
            mark = "FALLBACK"
        else:
            mark = "PASS" if severity_ok else "FAIL"

        print(
            f"[{mark}] {case['id']}: "
            f"expected={case['expected_severity']} actual={analysis.severity} "
            f"mode={analysis.mode}"
        )

    total = len(cases)
    clean_run = fallback_responses == 0 and llm_responses == total
    accuracy = correct / total if clean_run and total else None

    result_doc = {
        "analyzer": "OpenAICompatibleAnalyzer",
        "dataset": "eval/incidents.json",
        "base_url": analyzer.base_url,
        "model": analyzer.model,
        "total_cases": total,
        "actual_llm_responses": llm_responses,
        "fallback_responses": fallback_responses,
        "clean_llm_run": clean_run,
        "severity_correct": correct if clean_run else None,
        "severity_accuracy": accuracy,
        "explicit_severity_correct": explicit_correct if clean_run else None,
        "explicit_total": explicit_total if clean_run else None,
        "semantic_severity_correct": semantic_correct if clean_run else None,
        "semantic_total": semantic_total if clean_run else None,
        "results": results,
    }

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(
        json.dumps(result_doc, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print(f"Actual LLM responses: {llm_responses}/{total}")
    print(f"Fallback responses: {fallback_responses}/{total}")

    if clean_run:
        print(f"LLM severity accuracy: {correct}/{total} ({accuracy:.1%})")
        print(
            f"Explicit: {explicit_correct}/{explicit_total} | "
            f"Semantic: {semantic_correct}/{semantic_total}"
        )
    else:
        print("LLM severity accuracy: NOT REPORTABLE")
        print(
            "Reason: at least one request used deterministic fallback. "
            "Keep this output as failure evidence, fix the endpoint, and rerun."
        )

    print(f"Saved: {RESULT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
