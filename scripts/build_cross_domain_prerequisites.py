#!/usr/bin/env python3
"""Encode the documented cross-domain dependency map into machine prerequisites.

`curriculum/dependency-map.md` documents a real cross-domain preparation graph
(critical-thinking -> digital-safety -> money -> life-admin; health/emergencies/
money -> home -> major-decisions; learning-time & relationships -> work, etc.).
Only 3 of ~10 of those edges existed in `curriculum/subskills.json`; the rest
lived in prose only. The engine's prerequisite gate (learner/engine.js) therefore
recommended cross-domain tasks in an order the documentation does not describe.

This script adds the missing cross-domain prerequisites to each domain's
`*.independent` subskills, using the source domain's `*.foundation` competency
(the pattern already used by the three existing edges), while:

  * preserving every existing intra-family and cross-domain prerequisite,
  * refusing to introduce a prerequisite cycle (the adaptive validator's own
    cycle check is the final backstop),
  * never touching capstones, error tags, review policy, or assessment routes.

It is idempotent. The legacy domain-level `rollups` are left unchanged, because
`validate_adaptive.py` pins them against `curriculum/index.json` `derived_from`.

Usage:  python scripts/build_cross_domain_prerequisites.py [--check]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "curriculum" / "subskills.json"
BANK = ROOT / "assessments" / "bank.json"
CAPS = ROOT / "assessments" / "capstones.json"

# Edges transcribed from curriculum/dependency-map.md ("Recommended preparation").
# target domain -> (source domain, source subskill used as its foundation gate)
EDGES = {
    "digital-safety": [("critical-thinking", "verification")],
    "money": [("critical-thinking", "verification"), ("digital-safety", "accounts")],
    "work": [("learning-time", "planning"), ("relationships", "communication")],
    "life-admin": [("money", "budget"), ("digital-safety", "accounts"), ("work", "evidence")],
    "home": [("emergencies", "preparedness"), ("health", "access"), ("money", "budget")],
    "major-decisions": [("money", "budget"), ("home", "meals"), ("life-admin", "contracts"),
                        ("critical-thinking", "verification")],
}


def would_cycle(competencies, candidate_id, new_prereq):
    """True if adding new_prereq to candidate_id's prerequisites creates a cycle."""
    graph = {c["id"]: list(c.get("prerequisites", [])) for c in competencies}
    graph.setdefault(candidate_id, [])
    if new_prereq not in graph.get(candidate_id, []):
        graph[candidate_id] = list(graph.get(candidate_id, [])) + [new_prereq]
    visiting, done = set(), set()

    def visit(node):
        if node in visiting:
            return True
        if node in done:
            return False
        visiting.add(node)
        for pre in graph.get(node, []):
            if visit(pre):
                return True
        visiting.discard(node)
        done.add(node)
        return False

    return visit(candidate_id)


def build(skills: dict):
    comps = skills["competencies"]
    by_id = {c["id"]: c for c in comps}
    changed = set()
    for target_domain, sources in EDGES.items():
        independent = [c for c in comps if c["id"].startswith(target_domain + ".") and c["mode"] == "independent"]
        for c in independent:
            for src_domain, src_subskill in sources:
                prereq = f"{src_domain}.{src_subskill}.foundation"
                if prereq not in by_id:
                    continue  # source competency does not exist; skip defensively
                if prereq in c.get("prerequisites", []):
                    continue
                # Never create a prerequisite cycle.
                if would_cycle(comps, c["id"], prereq):
                    continue
                c.setdefault("prerequisites", []).append(prereq)
                changed.add(c["id"])
    # Preserve a stable, de-duplicated prerequisite order per competency.
    for c in comps:
        pre = c.get("prerequisites", [])
        seen, ordered = set(), []
        for p in pre:
            if p not in seen:
                seen.add(p)
                ordered.append(p)
        c["prerequisites"] = ordered
    return changed


def ordered_unique(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def sync_item_prerequisites(bank: dict, caps: dict, skills: dict):
    """Mirror competency prerequisites onto assessment items.

    Non-capstone items must equal their single competency's prerequisites; capstone
    items equal the ordered union of their target competencies' prerequisites
    (the exact rule validate_adaptive.py enforces). This keeps the engine's
    eligibility filter and the validator in agreement so a newly dependency-aware
    prerequisite graph actually changes what is recommended and what is eligible.
    """
    comps = {c["id"]: c for c in skills["competencies"]}
    changed = set()

    def targets_preqs(targets):
        out = []
        for cid in targets:
            out.extend(comps[cid].get("prerequisites", []) if cid in comps else [])
        return ordered_unique(out)

    for item in bank["items"]:
        if item.get("family") == "capstone":
            continue
        targets = item.get("competencies", [])
        if not targets or targets[0] not in comps:
            continue
        new_pre = list(comps[targets[0]].get("prerequisites", []))
        if item.get("prerequisites") != new_pre:
            item["prerequisites"] = new_pre
            changed.add(item["id"])

    for item in caps["items"]:
        new_pre = targets_preqs(item.get("competencies", []))
        if item.get("prerequisites") != new_pre:
            item["prerequisites"] = new_pre
            changed.add(item["id"])

    return changed


def main() -> int:
    check = "--check" in sys.argv
    skills = json.loads(SKILLS.read_text(encoding="utf-8"))
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    caps = json.loads(CAPS.read_text(encoding="utf-8"))
    import copy

    cand_skills = copy.deepcopy(skills)
    comp_changed = build(cand_skills)
    cand_bank = copy.deepcopy(bank)
    cand_caps = copy.deepcopy(caps)
    item_changed = sync_item_prerequisites(cand_bank, cand_caps, cand_skills)

    if check:
        stale = []
        if cand_skills != skills:
            stale.append("curriculum/subskills.json")
        if cand_bank != bank:
            stale.append("assessments/bank.json")
        if cand_caps != caps:
            stale.append("assessments/capstones.json")
        if stale:
            print("ERROR: cross-domain prerequisites are stale; run scripts/build_cross_domain_prerequisites.py -> " + ", ".join(stale))
            return 1
        print("PASS: cross-domain prerequisites are current.")
        return 0

    SKILLS.write_text(json.dumps(cand_skills, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    BANK.write_text(json.dumps(cand_bank, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    CAPS.write_text(json.dumps(cand_caps, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added cross-domain prerequisites to {len(comp_changed)} subskill(s); synced {len(item_changed)} assessment item(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())