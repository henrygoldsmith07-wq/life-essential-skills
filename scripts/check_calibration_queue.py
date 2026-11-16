"""Keep the case-decision calibration review queue in step with the validators.

The validators warn for each benchmarked item whose rubric gained the
case-decision gate. Those warnings are a human-review signal, not a build
failure, so they are easy to ignore. This guard makes the set explicit: a new
warning must be acknowledged by adding the item to the reviewed queue, and an
item that stops warning must be removed from it.
"""
from pathlib import Path
import re
import sys

from validate_adaptive import validate

ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / 'docs' / 'calibration-review-queue.md'
GATE_WARNING = re.compile(r'^(\S+): calibration rubric includes the case-decision gate')


def queued_ids(text):
    """Item ids in the first column of the queue's Markdown table."""
    ids = []
    for line in text.splitlines():
        if not line.startswith('|'):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        first = cells[0] if cells else ''
        if not first or first == 'Item' or set(first) <= set('-: '):
            continue
        ids.append(first)
    return ids


def main():
    _, warnings = validate(ROOT)
    warned = sorted(m.group(1) for w in warnings if (m := GATE_WARNING.match(w)))
    tracked = queued_ids(QUEUE.read_text(encoding='utf-8'))

    untracked = [i for i in warned if i not in tracked]
    stale = [i for i in tracked if i not in warned]
    duplicates = sorted({i for i in tracked if tracked.count(i) > 1})

    for ident in untracked:
        print(f'ERROR: {ident} gained the case-decision gate; add it to docs/calibration-review-queue.md')
    for ident in stale:
        print(f'ERROR: {ident} no longer warns; remove it from docs/calibration-review-queue.md')
    for ident in duplicates:
        print(f'ERROR: {ident} is listed twice in docs/calibration-review-queue.md')

    if untracked or stale or duplicates:
        return 1
    print(f'PASS: {len(warned)} case-decision calibration items are tracked for human review')
    return 0


if __name__ == '__main__':
    sys.exit(main())
