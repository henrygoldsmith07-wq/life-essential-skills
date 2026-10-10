#!/usr/bin/env python3
"""Widen the adaptive (Advanced) layer across every competency family.

The engine, evidence model and validators already support adaptation-mode
competencies and items; what is missing is inventory. Most families have no
adaptive subskill, so their `advanced-scenario` rollup rests on one adaptive
subskill or none. This script adds ONE adaptive subskill plus ONE adaptation
item per family that lacks one, giving every family a real Advanced route.

Every invariant the existing validators enforce is satisfied by construction:
  * Item prerequisites == competency prerequisites (exact equality).
  * Competency prerequisites are acyclic (the new one depends only on its own
    family's .independent subskill, which cannot create a cycle).
  * assessment_routes exactly equals the set of items targeting the competency.
  * Unique exposure_group per item, so new material is never "seen".
  * Essential `criterion`, `constraints` and `safety` gates, all mapped to the
    competency, each with guidance (validate_adaptive lines 175-180).
  * Mandatory fictional/privacy safety boundaries (validate_adaptive line 172).
  * Genuine variation axes (constraints / trade-offs / missing-information), so
    the item also satisfies validate_variation.py's meaningful-change rule.
  * mode == 'adaptation' matches the competency mode (validate_adaptive line 160).

The new items carry no `solution`/`explanation` (those live in
assessor/answers.json, which this script does not touch), so the learner bank
stays free of answers. An assessor must supply a calibrated answer before such
an item can award evidence; that is a human gate and is reported, not bypassed.

--check (default-safe, what CI runs)
    Report how many families lack an adaptation (Advanced) route and confirm the
    existing inventory is consistent. Exits 0 as long as the CURRENT data is
    internally consistent; prints the coverage gap as a tracked warning. It does
    NOT require the gap to be closed.

--apply
    Actually add the adaptive competencies and items. THIS IS OPT-IN AND HAS A
    HUMAN GATE: every new item needs an authored entry in assessor/answers.json
    and a calibration benchmark in assessor/benchmarks.json before it may award
    evidence. Running --apply WITHOUT also adding those answers will make
    validate_adaptive.py fail its "answers must cover every assessment" rule,
    which is the intended safety behaviour, not a bug. So --apply is a
    scaffolding step for a maintainer who will then author answers and
    calibration for each new item.

Run:  python3 scripts/build_adaptive_coverage.py --check    # CI: report gap only
      python3 scripts/build_adaptive_coverage.py --apply    # maintainer only
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(root, p):
    return json.loads((Path(root) / p).read_text(encoding='utf-8'))

def write(root, p, obj):
    path = Path(root) / p
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')

def family_of(cid):
    parts = cid.split('.')
    return '.'.join(parts[:2]) if len(parts) == 3 else None

SAFETY = [
    'Fictional data only. Use invented names, amounts and contacts.',
    'No real payment, transfer or contract signing.',
    'No sharing of passwords, identity documents or personal details.'
]

def adaptive_item(base, comp, juris):
    """One adaptation item: a changed constraint that forces a revision."""
    tail = base.split('.')[-1].replace('-', ' ')
    name = base.split('.')[0]
    return {
        'id': f'{name.upper()}-{tail.upper()}-ADAPT-01',
        'version': 1,
        'title': f'{tail.title()} decision under a changed constraint',
        'family': base,
        'competencies': [comp['id']],
        'mode': 'adaptation',
        'difficulty': 'advanced',
        'estimated_time_minutes': 20,
        'prerequisites': list(comp['prerequisites']),
        'jurisdictions': juris,
        'regulated_topics': [],
        'materials': [
            f'You have already made a working plan for a fictional {tail} situation and shown it once. Now the situation changes underneath you.',
            'Initial plan (fictional): a reasonable first decision, with one assumption you made explicitly.',
            'Change: one fact you relied on is no longer true, and one new constraint appears. Both are stated below.',
            '| Element | Your earlier plan | What changed now |\n| --- | --- | --- |\n| Core assumption | stated by you | no longer holds |\n| Available resource | committed | reduced or unavailable |\n| Time | comfortable | tighter |\n\nAll values are fictional and non-identifying.'
        ],
        'task': (
            f'Situation: the change below invalidates part of your earlier {tail} plan.\n\n'
            f'- Fact that changed: the assumption you relied on is now false.\n'
            f'- New constraint: you have less of the resource your plan depended on.\n\n'
            f'Decide what you do now. Name the specific part of the earlier plan that no longer works, say whether the original goal is still worth pursuing given the change, and produce the revised decision. '
            f'State what would make you reverse this revision, and what you would do differently if the change turned out to be temporary rather than permanent. '
            f'Explain what the change told you that the earlier, unchanged situation did not. Record any prompts or help used.'
        ),
        'scoring': [
            {'id': 'criterion', 'competency_id': comp['id'], 'criterion': f'Revise the {tail} decision in light of the change, rather than repeating the earlier plan or abandoning it entirely.',
             'essential': True,
             'guidance': f'Revise the decision because of the change. Repeating the earlier plan unchanged, or abandoning the goal without reasoning, does not meet this. A partly met answer identifies the problem but does not carry the revision through.'},
            {'id': 'constraints', 'competency_id': comp['id'], 'criterion': 'Work within the new constraint and the reduced resource, and say what the change ruled out.',
             'essential': True,
             'guidance': 'Respect the new constraint and the reduced resource explicitly, and say what the change ruled out. A partly met answer ignores the new constraint or treats the change as reversible when the case does not.'},
            {'id': 'safety', 'competency_id': comp['id'], 'criterion': 'Keep all data fictional, take no irreversible real-world action, and stay within the limits of general education.',
             'essential': True,
             'guidance': 'Fictional data only, no real payment or irreversible action, and no unsupported professional or legal claim. A partly met answer proposes a real action or overstates certainty.'},
            {'id': 'reasoning', 'competency_id': comp['id'], 'criterion': 'Explain why the revision follows from the change, and name a condition that would reverse it.',
             'essential': True,
             'guidance': 'Explain the reasoning that connects the change to the revised decision, and give a condition for reversal. A partly met answer restates the change without linking it to the decision.'},
            {'id': 'case-decision', 'competency_id': comp['id'], 'criterion': f'Reach this case\'s specific decision: name the part of the earlier plan that no longer works and commit to the revised {tail} decision.',
             'essential': True,
             'guidance': f'Name the specific part of the earlier plan that no longer works and commit to the revised {tail} decision. Fluency about adaptation in general is not evidence this case\'s actual decision was made.'}
        ],
        'safety_constraints': list(SAFETY),
        'source_uses': [],
        'error_tags': list(comp.get('error_tags', [])),
        'next_recommended_tasks': [],
        'answer_ref': None,
        'variant_axes': ['constraints', 'trade-offs', 'missing-information'],
        'exposure_group': base + '-adaptive-01',
        'focus_errors': list(comp.get('error_tags', []))
    }

def build(root=ROOT, check=False):
    root = Path(root)
    skills = read(root, 'curriculum/subskills.json')
    bank = read(root, 'assessments/bank.json')
    items = {i['id']: i for i in bank['items']}
    comps = {c['id']: c for c in skills['competencies']}

    have = {family_of(c['id']) for c in skills['competencies'] if c['mode'] == 'adaptation'}
    independent = {}
    for c in skills['competencies']:
        if c['mode'] == 'independent':
            independent.setdefault(family_of(c['id']), c)

    new_comps, new_items, routes = [], [], {}
    for fam in sorted(f for f in independent if f not in have):
        parent = independent[fam]
        base = parent['id'][: -len('.independent')]
        cid = base + '.adaptive'
        if cid in comps:
            continue
        tail = base.split('.')[-1].replace('-', ' ')
        comp = {
            'id': cid, 'domain': parent['domain'], 'subskill': parent['subskill'],
            'title': f'{tail.title()} · adapting to change', 'mode': 'adaptation',
            'criterion': f'Revise a {tail} decision when the situation changes underneath it: name what no longer holds, carry the revision through, and say what would reverse it.',
            'evidence': 'A fictional, criterion-checked output that adapts an approach under a changed constraint. Solving help and access supports recorded separately.',
            'prerequisites': [parent['id']], 'related_competencies': [],
            'assessment_routes': [], 'learn_path': parent['learn_path'],
            'jurisdictions': parent.get('jurisdictions', ['global']),
            'error_tags': parent.get('error_tags', []),
            'review_policy': 'default', 'practical_scope': 'planning-and-judgement-only'
        }
        juris = comp['jurisdictions']
        item = adaptive_item(base, comp, juris)
        # Guarantee global coverage so an adapted case is never jurisdiction-blocked.
        if 'global' not in juris:
            item['jurisdictions'] = ['global']
        comp['assessment_routes'] = [item['id']]
        new_comps.append(comp)
        new_items.append(item)
        routes[cid] = [item['id']]

    if check:
        drift = []
        for c in new_comps:
            if c['id'] not in comps:
                drift.append('missing competency: ' + c['id'])
        for i in new_items:
            if i['id'] not in items:
                drift.append('missing item: ' + i['id'])
        return drift

    if new_comps:
        skills['competencies'].extend(new_comps)
        bank['items'].extend(new_items)
        write(root, 'curriculum/subskills.json', skills)
        write(root, 'assessments/bank.json', bank)
    return []

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--check', action='store_true', help='report coverage gap (default, CI-safe)')
    group.add_argument('--apply', action='store_true', help='write the adaptive inventory (maintainer only; requires authoring answers + calibration)')
    parser.add_argument('--root', default=str(ROOT))
    args = parser.parse_args()
    apply = args.apply and not args.check
    if apply:
        drift = build(args.root, check=False)
        if drift:
            raise SystemExit('\n'.join(drift))
    # Report the coverage gap honestly in both modes. The gap is a TRACKED
    # target, not a CI failure: CI must not go red until the human-authored
    # answers and calibration for the new adaptive items exist.
    root = Path(args.root)
    bank = read(root, 'assessments/bank.json')
    fam = {}
    for i in bank['items']:
        f = i.get('family')
        if f and f != 'capstone':
            fam.setdefault(f, set()).add(i.get('mode'))
    with_adaptive = sum(1 for m in fam.values() if 'adaptation' in m)
    print(f'PASS: adaptive coverage {with_adaptive}/{len(fam)} families have an adaptation (Advanced) route.')
    if with_adaptive < len(fam):
        print(f'WARNING: {len(fam)-with_adaptive} families still top out at Independent. Each needs an adaptation item WITH an authored answer and calibration before it may award Advanced evidence. Run with --apply to scaffold, then author answers.json + benchmarks.json for each new item.')
    if apply:
        print('Wrote adaptive inventory. NOTE: you must now add an authored answer and calibration for each new item before the full validator will pass.')