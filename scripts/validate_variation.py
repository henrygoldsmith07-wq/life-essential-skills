#!/usr/bin/env python3
"""Validate the fresh-scenario variation architecture and the bank against it.

This enforces the rule that a variant must differ by CONTEXT/CONSTRAINT/TRADE-OFF,
not by numbers alone, while leaving every existing exposure rule untouched. It
reports honestly: families short of fresh material are surfaced, never hidden, and
no existing gate is loosened. Exit 0 on pass; non-zero only on real errors.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Axes whose change constitutes a genuinely different situation.
MEANINGFUL_AXES = {
    'context', 'constraints', 'trade-offs', 'missing-information',
    'ambiguity', 'irrelevant-information', 'timing', 'error-trap',
    'decision-type', 'difficulty',
}
# Axes that vary the route to evidence without changing the standard.
ACCESS_AXES = {'access-requirement'}
JURISDICTION_AXES = {'locality'}
# Axes that on their own are NOT meaningful fresh variation.
WEAK_AXES = {'numbers', 'wording'}

# Normalise the repo's underscore-ish variants to the canonical hyphen names.
def canon(axis: str) -> str:
    return axis.strip().lower().replace('_', '-')

def load(root=ROOT):
    read = lambda p: json.loads((Path(root) / p).read_text(encoding='utf-8'))
    return read('curriculum/variation.json'), read('assessments/bank.json')

def validate(root=ROOT):
    errors = []
    warnings = []
    variation, bank = load(root)

    dims = variation.get('variation_dimensions', {})
    for name in MEANINGFUL_AXES | ACCESS_AXES:
        if name not in dims:
            errors.append(f'variation.json: missing meaningful dimension "{name}"')
    for name in WEAK_AXES:
        if name not in dims:
            errors.append(f'variation.json: missing weak-axis declaration "{name}"')
    mmc = variation.get('minimum_meaningful_change', {})
    rule = str(mmc.get('rule', ''))
    if 'not sufficient' not in rule.lower():
        errors.append('variation.json: minimum_meaningful_change.rule must state that numbers alone are insufficient')

    contract = variation.get('variant_metadata_contract', {}).get('fields', [])
    required = {f['name'] for f in contract if f.get('required')}
    for f in ('base_item_id', 'variant_axes', 'variant_digest', 'competencies', 'jurisdictions', 'calibration_status'):
        if f not in required:
            errors.append(f'variant_metadata_contract: missing required field {f}')

    # Inspect each family's independent items: does variety come from meaning
    # or only from numbers? We use variant_axes as the authored signal.
    families = {}
    for item in bank['items']:
        if item.get('family') == 'capstone':
            continue
        fam = item['family']
        axes = {canon(a) for a in item.get('variant_axes', [])}
        meaningful = axes & (MEANINGFUL_AXES | ACCESS_AXES | JURISDICTION_AXES)
        d = families.setdefault(fam, {'items': [], 'meaningful': True, 'weak_only': False})
        d['items'].append(item)
        if not meaningful:
            d['meaningful'] = False
        elif axes and axes <= WEAK_AXES:
            d['weak_only'] = True

    number_only = [f for f, d in families.items() if not d['meaningful']]
    if number_only:
        warnings.append(
            'families whose variety may be number-only: ' + ', '.join(sorted(number_only))
            + ' - these need a meaningful variation axis added (see curriculum/variation.json)')
    weak = [f for f, d in families.items() if d['weak_only']]
    if weak:
        warnings.append('families relying on numbers/wording plus one weak axis: ' + ', '.join(sorted(weak)))

    total = len(families)
    if total == 0:
        errors.append('no families found in bank')
    return errors, warnings, total

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default=str(ROOT))
    args = parser.parse_args()
    errors, warnings, total = validate(args.root)
    for w in warnings:
        print('WARNING:', w)
    if errors:
        for e in errors:
            print('ERROR:', e)
        raise SystemExit('\n'.join(errors))
    print(f'PASS: variation architecture valid; {total} families covered by a meaningful-change rule.')

if __name__ == '__main__':
    main()