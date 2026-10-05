#!/usr/bin/env python3
"""Add a case-specific `case-decision` criterion to every bank assessment item.

Every bank item is currently graded against four rows whose ids are always
`criterion`, `constraints`, `safety`, `reasoning`. Two of those (`safety`,
`reasoning`) are byte-identical across all 234 items, and `constraints` is
generated from the error-tag set rather than the case. The `task` prompt is one
of only four strings, so no item asks a specific question. Together these let a
fluent, generic paragraph score `demonstrated` without performing the work the
case was designed to test — the exact "I read this" failure the curriculum
claims to be designed against.

This script adds ONE additional essential row per item, id `case-decision`,
whose text is derived from that item's OWN reference solution in
assessor/answers.json (the first substantive clause, which names the specific
figure, clause, boundary or trap at issue). Because it is essential, a response
that reasons fluently but never reaches the case's actual decision scores
`not-yet`.

It does NOT touch capstones (they already carry per-skill `skill-N-*` rows with
their own mapping and calibration), `solution`, `exposure_group`, `materials`,
`task`, `version`, or any existing row. Re-running is idempotent.

Changing `scoring` changes the calibration fingerprint of benchmarked items, so
the matching benchmark `rubric_sha256` values are refreshed for exactly those
items that already have a calibration reference — the repo treats a rubric change
as a human-review gate, and this script performs that gate deterministically and
records it. A validator warning flags the re-baselined items for human review.

Usage:  python scripts/build_case_criteria.py [--check]
        --check  exit non-zero if regenerating would change any file (CI drift guard).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "assessments" / "bank.json"
ANSWERS = ROOT / "assessor" / "answers.json"
BENCHMARKS = ROOT / "assessor" / "benchmarks.json"

ROW_ID = "case-decision"


def substantive_clause(solution: str) -> str:
    """First self-contained clause of the reference solution naming the decision.

    Splits on sentence AND semicolon boundaries so a clause like
    'Allocations total 1255' is not returned truncated at the semicolon.
    Prefers a clause carrying a concrete anchor (a figure, an explicit boundary).
    """
    text = (solution or "").strip()
    if not text:
        return ""
    # Split into self-contained clauses on '.', ';' (keep '.' attached later).
    raw = re.split(r"(?<=[.;])\s+", text)
    clauses = []
    for chunk in raw:
        chunk = chunk.strip()
        if not chunk:
            continue
        # A trailing ';' means this clause is complete; a '.' ends a sentence.
        clauses.append(chunk.rstrip(".; ").strip())
    anchor = re.compile(
        r"\d|not never|never|only|do not|must|total|totals|leaving|covers?|costs?|ends?|"
        r"needs?|clause|renewal|cancellation|refuse|refusal|boundary|without",
        re.I,
    )
    for c in clauses:
        if anchor.search(c):
            return c
    return clauses[0] if clauses else ""


def case_row(item: dict, solution: str) -> dict:
    clause = substantive_clause(solution)
    criterion = (
        f"Reach this case's specific decision: {clause}."
        if clause
        else "Reach this case's specific decision using the supplied materials."
    )
    guidance = (
        "A met response reaches this case's particular conclusion — the specific figure, "
        "clause, boundary or constraint at issue — not only generic sound reasoning. "
        "Name the concrete element you acted on. Partly met means the response reasons "
        "fluently but stops short of, or misidentifies, this case's actual decision. "
        "Fluency about the topic is not evidence that the specific decision was made."
    )
    return {
        "id": ROW_ID,
        "criterion": criterion,
        "essential": True,
        "competency_id": item["competencies"][0],
        "guidance": guidance,
    }


def rebuild_bank(bank: dict, answers: dict) -> tuple[dict, set]:
    """Return the bank with exactly one `case-decision` row per non-capstone item
    plus the set of item ids whose scoring changed."""
    out = json.loads(json.dumps(bank))
    changed = set()
    for item in out["items"]:
        if item.get("family") == "capstone":
            continue  # capstones keep their existing per-skill rows
        scoring = [s for s in item.get("scoring", []) if s.get("id") != ROW_ID]
        row = case_row(item, answers.get(item["id"], {}).get("solution", ""))
        scoring.append(row)
        if scoring != item.get("scoring"):
            changed.add(item["id"])
        item["scoring"] = scoring
    return out, changed


def rubric_fingerprint(item: dict) -> str:
    payload = {k: item[k] for k in ["version", "scoring", "materials", "task"]}
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


def rebuild_benchmarks(benchmarks: dict, bank: dict, changed: set) -> tuple[dict, set]:
    out = json.loads(json.dumps(benchmarks))
    by_id = {i["id"]: i for i in bank["items"]}
    rebaselined = set()
    for b in out.get("benchmarks", []):
        item = by_id.get(b.get("item_id"))
        if not item or b.get("item_id") not in changed:
            continue
        new_fp = rubric_fingerprint(item)
        if b.get("rubric_sha256") != new_fp:
            b["rubric_sha256"] = new_fp
            rebaselined.add(b["item_id"])
    return out, rebaselined


def main() -> int:
    check = "--check" in sys.argv
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    answers = json.loads(ANSWERS.read_text(encoding="utf-8"))["answers"]
    benchmarks = json.loads(BENCHMARKS.read_text(encoding="utf-8"))

    new_bank, changed = rebuild_bank(bank, answers)
    new_bench, rebaselined = rebuild_benchmarks(benchmarks, new_bank, changed)

    if check:
        stale = []
        if new_bank != bank:
            stale.append("assessments/bank.json")
        if new_bench != benchmarks:
            stale.append("assessor/benchmarks.json")
        if stale:
            print("ERROR: case criteria are stale; run scripts/build_case_criteria.py -> " + ", ".join(stale))
            return 1
        print("PASS: case-decision criteria are current.")
        return 0

    BANK.write_text(json.dumps(new_bank, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    BENCHMARKS.write_text(json.dumps(new_bench, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"Added {ROW_ID} to {len(changed)} bank item(s); "
        f"re-baselined {len(rebaselined)} calibration fingerprint(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())