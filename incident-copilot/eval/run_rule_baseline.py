from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.analyzers import RuleAnalyzer

DATASET = ROOT / "eval" / "incidents.json"
RESULT_DIR = ROOT / "eval" / "results"
RESULT_PATH = RESULT_DIR / "rule_baseline.json"


def main() -> None:
    cases = json.loads(DATASET.read_text(encoding="utf-8"))
    analyzer = RuleAnalyzer()

    results = []
    correct = 0

    for case in cases:
        analysis = analyzer.analyze(case["service"], case["logs"])
        severity_ok = analysis.severity == case["expected_severity"]
        correct += int(severity_ok)

        row = {
            "id": case["id"],
            "case_type": case.get("case_type", "unknown"),
            "expected_severity": case["expected_severity"],
            "actual_severity": analysis.severity,
            "severity_correct": severity_ok,
            "expected_signal": case["expected_signal"],
            "actual_signals": analysis.signals,
            "summary": analysis.summary,
            "likely_causes": analysis.likely_causes,
            "recommended_actions": analysis.recommended_actions,
            "mode": analysis.mode,
        }
        results.append(row)

        mark = "PASS" if severity_ok else "FAIL"
        print(
            f"[{mark}] {case['id']}: "
            f"expected={case['expected_severity']} actual={analysis.severity}"
        )

    total = len(cases)
    accuracy = correct / total if total else 0.0

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(
        json.dumps(
            {
                "analyzer": "RuleAnalyzer",
                "dataset": "eval/incidents.json",
                "total_cases": total,
                "severity_correct": correct,
                "severity_accuracy": accuracy,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print(f"Severity accuracy: {correct}/{total} ({accuracy:.1%})")
    print(f"Saved: {RESULT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
