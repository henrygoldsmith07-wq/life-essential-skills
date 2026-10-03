"""Render the readable source registry from the canonical JSON records."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def render(root=ROOT):
    sources = json.loads((root / 'data/sources.json').read_text(encoding='utf-8'))['sources']
    lines = [
        '# Source register', '',
        '[Curriculum](README.md) · [Localisation](locales/README.md) · [Canonical data](data/sources.json)', '',
        'Generated from `data/sources.json` with `python scripts/render_registry.py`. Edit the data, then regenerate this page.', '',
        'Last-checked dates record review of public publisher pages or their indexed records, not a legal/clinical review or a guarantee of continued availability. Link automation records reachability separately. Reopen the original source before a personal high-stakes decision.', '',
        'Prefer official authorities, recognised professional/advice bodies, high-quality research reviews, then strong educational sources. Original scenarios are fictional teaching material and do not need invented research citations.', '',
        '## Find a source', '', '| ID and title | Topic | Jurisdiction |', '| --- | --- | --- |'
    ]
    for source in sources:
        lines.append(f'| [{source["id"]} · {source["title"]}](#{source["id"]}) | {source["topic"]} | {source["jurisdiction"]} |')
    for source in sources:
        dependencies = ', '.join(f'[{path}]({path})' for path in source['lesson_dependencies']) or 'Used by a locality pack; no generic lesson relies on its rules.'
        lines += ['', f'## {source["id"]}', '',
                  f'**[{source["title"]}]({source["url"]})**', '',
                  f'- Organisation: {source["organisation"]}',
                  f'- Topic/purpose: {source["topic"]}',
                  f'- Jurisdiction: {source["jurisdiction"]}',
                  f'- Source type: {source["source_type"]}',
                  f'- Last checked: {source["last_checked"]}',
                  f'- Notes: {source["notes"]}', '', f'Dependent lessons and assessments: {dependencies}']
    lines += ['', '## Review policy', '',
              'Check scope, authorship, current status, date, and relevance when editing a lesson. Do not copy changing rates, eligibility rules, contact hours, or entitlements into generic exercises. A source being reachable does not mean it supports a claim.', '',
              'The validator warns when a source review is over 180 days old. Update a review date only after actually reviewing the resource. Replace withdrawn guidance, and keep any restricted-access or historical-use limitation explicit. Document external-link exceptions with a reason and expiry; never treat a blocked page as verified reachable.', '',
              'Linked publications retain their own copyright and licence. Repository licensing applies to original curriculum content and code.']
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    expected = render()
    target = ROOT / 'RESOURCES.md'
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8') != expected:
            raise SystemExit('RESOURCES.md is out of date. Run python scripts/render_registry.py.')
        print('Source registry render is current.')
    else:
        target.write_text(expected, encoding='utf-8', newline='\n')
        print('Rendered RESOURCES.md.')
