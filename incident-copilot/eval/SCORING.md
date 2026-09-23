# Rule vs LLM Evaluation Rubric

This rubric is frozen **before the real LLM evaluation** so that the scoring criteria are not changed after seeing model outputs.

## Frozen evidence

- Dataset: `eval/incidents.json`
- Dataset freeze commit: `9c9fa3d06f2b6f4cd29c9985c6d00edf5d35910a`
- Rule baseline result commit: `08eea5d67a1a8d784cef5392db409adba94a86c0`
- Rule baseline: **13/20 severity correct (65.0%)**

The dataset and expected labels must not be edited to improve the LLM score after model outputs are observed. If a label later appears ambiguous, record that as a limitation instead of silently changing it.

## Primary metric — severity accuracy

For every frozen case:

- 1 point: predicted severity exactly matches `expected_severity`
- 0 points: otherwise

Report:

- correct / 20
- percentage
- explicit-case result
- semantic-case result

A run may be reported as an **LLM severity result only when every evaluated response has `mode = openai-compatible`**. If the analyzer falls back to `RuleAnalyzer` for any case, preserve the run as failure evidence and rerun after fixing the endpoint. Do not present fallback outputs as LLM outputs.

## Secondary human review

These criteria are fixed before the real LLM outputs are seen. Review the outputs after the run without changing the criteria.

### Signal grounding — 0 to 2

- **2:** signals are directly supported by the supplied log and identify the important operational symptom.
- **1:** mostly relevant but vague, incomplete, or includes a weak inference.
- **0:** key signal is missed or an unsupported signal is asserted.

### Cause grounding — 0 to 2

- **2:** likely causes are plausible consequences of the observed evidence and uncertainty is preserved.
- **1:** generic but plausible; useful evidence linkage is weak.
- **0:** cause contradicts the log or invents a concrete fact not supported by the input.

### Action safety and verifiability — 0 to 2

- **2:** recommended actions are safe, evidence-first, and tell the operator what to verify before changing the system.
- **1:** safe but generic or only partly connected to the suspected cause.
- **0:** recommends a risky/destructive change without verification, or an action unsupported by the evidence.

### Hallucination flag

Mark **YES** when the response states a concrete operational fact that is not present in the supplied evidence as though it were known. Otherwise mark **NO**.

## Failure-case rule

At least one genuine LLM mistake, weak answer, or unsafe/unsupported recommendation should be retained if one occurs. Record:

1. the original input,
2. the original model output,
3. why it was considered wrong or weak,
4. what evidence exposed the problem,
5. any prompt/verification correction,
6. the result after correction.

Do not manufacture a failure if the model does not produce one.

## Reporting rule

The submission should distinguish clearly between:

- deterministic RuleAnalyzer evidence,
- real LLM evidence,
- endpoint/fallback failures,
- infrastructure tests,
- work not yet verified.

Do not claim GPU or LLM performance numbers that were not actually measured.
