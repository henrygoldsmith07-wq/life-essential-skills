"""Validate curriculum metadata, relationships, Markdown structure, and internal links."""
import argparse
from datetime import date
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
LEVELS = ['foundation', 'applied', 'independent', 'advanced-scenario']
GROUPS = ['domains', 'scenarios', 'capstones', 'pathways', 'locales']


def load(root, path, errors):
    try:
        value = json.loads((root / path).read_text(encoding='utf-8'))
        if not isinstance(value, dict):
            raise ValueError('expected an object')
        return value
    except (OSError, ValueError) as exc:
        errors.append(f'{path}: {exc}')
        return {}


def anchors(text):
    found = set()
    counts = {}
    in_fence = False
    for line in text.splitlines():
        if line.startswith('```'):
            in_fence = not in_fence
            continue
        if in_fence or not re.match(r'^#{1,6} ', line):
            continue
        heading = re.sub(r'^#{1,6} ', '', line).strip().lower()
        heading = re.sub(r'[^\w\s-]', '', heading)
        slug = re.sub(r'\s', '-', heading)
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        found.add(slug if count == 0 else f'{slug}-{count}')
    found.update(re.findall(r'<a\s+(?:id|name)="([^"]+)"', text))
    return found


def markdown_links(text):
    # The curriculum uses ordinary inline links; ignore fenced teaching examples.
    text = re.sub(r'(?ms)^```[^\n]*\n.*?^```\s*$', '', text)
    return re.findall(r'\[[^\]\n]+\]\(([^)\n]+)\)', text)


def validate(root=ROOT, today=None):
    root = Path(root).resolve()
    today = today or date.today()
    errors, warnings = [], []
    index = load(root, 'curriculum/index.json', errors)
    registry = load(root, 'data/sources.json', errors)
    if index.get('schema_version') != 1 or index.get('levels') != LEVELS:
        errors.append('Curriculum schema_version or levels are invalid')
    if registry.get('schema_version') != 1:
        errors.append('Source schema_version must be 1')

    groups = {}
    for group in GROUPS:
        items = index.get(group)
        if not isinstance(items, list):
            errors.append(f'{group}: expected a list')
            items = []
        valid = []
        for record in items:
            if not isinstance(record, dict):
                errors.append(f'{group}: record must be an object')
                continue
            if not isinstance(record.get('id'), str) or not record['id']:
                errors.append(f'{group}: record missing string id')
                continue
            valid.append(record)
        ids = [r['id'] for r in valid]
        if len(ids) != len(set(ids)):
            errors.append(f'{group}: duplicate IDs')
        groups[group] = {r['id']: r for r in valid}
    if len(groups['domains']) != 12:
        errors.append('Expected twelve domains')
    if len(groups['scenarios']) < 12 or len(groups['capstones']) < 5 or len(groups['pathways']) < 5:
        errors.append('Missing required scenarios, capstones, or pathways')

    def file_path(value, context):
        if not isinstance(value, str) or not value:
            errors.append(f'{context}: invalid path')
            return None
        path = (root / value).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            errors.append(f'{context}: missing or unsafe path {value}')
            return None
        return path

    def field(record, key, kind, context):
        if not isinstance(record.get(key), kind):
            errors.append(f'{context}: {key} must be {kind.__name__}')
            return [] if kind is list else None
        return record[key]

    def string_list(record, key, context):
        result = field(record, key, list, context)
        if any(not isinstance(item, str) or not item for item in result):
            errors.append(f'{context}: {key} must contain nonempty strings')
            return []
        if len(result) != len(set(result)):
            errors.append(f'{context}: duplicate {key}')
        return result

    def time_and_review(record, context):
        value = record.get('estimated_time_minutes')
        if type(value) is not int or value <= 0:
            errors.append(f'{context}: invalid estimated_time_minutes')
        days = field(record, 'review_interval_days', list, context)
        if not days or any(type(d) is not int or d <= 0 for d in days) or days != sorted(set(days)):
            errors.append(f'{context}: invalid review_interval_days')
        if record.get('mastery_level') not in LEVELS:
            errors.append(f'{context}: invalid mastery_level')
        field(record, 'difficulty', str, context)

    sources = {}
    urls = set()
    source_records = registry.get('sources', [])
    if not isinstance(source_records, list):
        errors.append('sources must be a list')
        source_records = []
    for source in source_records:
        if not isinstance(source, dict):
            errors.append('Source record must be an object')
            continue
        sid = source.get('id')
        if not isinstance(sid, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', sid):
            errors.append('Source has invalid id')
            continue
        if sid in sources:
            errors.append(f'Duplicate source ID: {sid}')
        sources[sid] = source
        for key in ['title', 'organisation', 'url', 'topic', 'jurisdiction', 'source_type', 'last_checked', 'notes']:
            if not isinstance(source.get(key), str) or not source[key]:
                errors.append(f'{sid}: missing source field {key}')
        url = source.get('url', '')
        if not isinstance(url, str):
            url = ''
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
            errors.append(f'{sid}: source URL must be public HTTPS without credentials')
        if url in urls:
            errors.append(f'{sid}: duplicate source URL')
        urls.add(url)
        try:
            checked = date.fromisoformat(source['last_checked'])
            if checked > today:
                warnings.append(f'{sid}: review date is in the future relative to this checker')
            if (today - checked).days > 180:
                warnings.append(f'{sid}: source review older than 180 days')
        except (KeyError, TypeError, ValueError):
            errors.append(f'{sid}: last_checked must be an ISO date')
        for path in string_list(source, 'lesson_dependencies', sid):
            file_path(path, sid)

    competencies = {}
    for did, domain in groups['domains'].items():
        context = f'domain {did}'
        for key in ['title', 'domain']:
            field(domain, key, str, context)
        if domain.get('domain') != did:
            errors.append(f'{context}: domain must match id')
        guide = file_path(domain.get('path'), context)
        skill_page = file_path(domain.get('skills_path'), context)
        time_and_review(domain, context)
        for key in ['prerequisites', 'related', 'recommended_next', 'subskills', 'localisation_requirements', 'scenario_links', 'source_dependencies']:
            string_list(domain, key, context)
        comps = field(domain, 'competencies', list, context)
        stages = []
        for comp in comps:
            if not isinstance(comp, dict):
                errors.append(f'{context}: competency must be an object')
                continue
            cid, level = comp.get('id'), comp.get('mastery_level')
            if level not in LEVELS or cid != f'{did}.{level}':
                errors.append(f'{context}: malformed competency ID or level')
            if not isinstance(cid, str):
                continue
            if cid in competencies:
                errors.append(f'Duplicate competency: {cid}')
            competencies[cid] = comp
            stages.append(level)
            for key in ['criterion', 'evidence']:
                if not isinstance(comp.get(key), str) or not comp[key].strip():
                    errors.append(f'{cid}: missing {key}')
            if skill_page and f'`{cid}`' not in skill_page.read_text(encoding='utf-8'):
                errors.append(f'{cid}: not present in domain Markdown')
        if stages != LEVELS:
            errors.append(f'{context}: requires four ordered mastery stages')
        if guide:
            text = guide.read_text(encoding='utf-8')
            for required in ['**Goal:**', '## Learn', '## Example', '## Practise', '## Self-check', '<summary>Suggested answers</summary>', '**Done when:**', '## Build and demonstrate this skill']:
                if required not in text:
                    errors.append(f'{guide.relative_to(root)}: missing {required}')

    expected_dependencies = {sid: set() for sid in sources}
    graph = {}
    for group in ['domains', 'scenarios', 'capstones']:
        for rid, record in groups[group].items():
            context = f'{group} {rid}'
            if group != 'domains':
                file_path(record.get('path'), context)
                field(record, 'title', str, context)
                time_and_review(record, context)
                for cid in string_list(record, 'competencies', context):
                    if cid not in competencies:
                        errors.append(f'{context}: unknown competency {cid}')
            dependencies = []
            for prereq in string_list(record, 'prerequisites', context):
                if prereq not in competencies:
                    errors.append(f'{context}: unknown prerequisite {prereq}')
                dependencies.append(prereq.split('.')[0])
            if group == 'domains':
                graph[rid] = dependencies
                for key in ['related', 'recommended_next']:
                    for did in record.get(key, []):
                        if did not in groups['domains']:
                            errors.append(f'{context}: unknown {key} {did}')
                for sid in record.get('scenario_links', []):
                    if sid not in groups['scenarios']:
                        errors.append(f'{context}: unknown scenario {sid}')
            if group == 'scenarios':
                if record.get('domain') not in groups['domains']:
                    errors.append(f'{context}: unknown domain')
                else:
                    for cid in record.get('competencies', []):
                        if isinstance(cid, str) and not cid.startswith(record['domain'] + '.'):
                            errors.append(f'{context}: competency belongs to another domain')
            if group == 'capstones':
                for did in string_list(record, 'domains', context):
                    if did not in groups['domains']:
                        errors.append(f'{context}: unknown domain {did}')
            for sid in string_list(record, 'source_dependencies', context):
                if sid not in sources:
                    errors.append(f'{context}: unknown source {sid}')
                    continue
                expected_dependencies[sid].add(record.get('path'))
                if group == 'domains':
                    expected_dependencies[sid].add(record.get('skills_path'))
            if group in ['scenarios', 'capstones']:
                path = file_path(record.get('path'), context)
                if not path:
                    continue
                text = path.read_text(encoding='utf-8')
                for section in ['## Context', '## Materials', '## Your task', '## Advanced variation', '## Assessment criteria', '## Suggested solution', '## Sources and locality']:
                    if section not in text:
                        errors.append(f'{context}: missing {section}')
                solution = text.split('## Suggested solution', 1)[-1].split('## Sources and locality', 1)[0]
                if not re.fullmatch(r'\s*<details>\s*<summary>[^<]+</summary>[\s\S]+</details>\s*', solution):
                    errors.append(f'{context}: solution must be wholly inside details')
                for cid in record.get('competencies', []):
                    if isinstance(cid, str) and f'`{cid}`' not in text:
                        errors.append(f'{context}: rubric missing competency {cid}')

    visiting, visited = set(), set()
    def visit(node):
        if node in visiting:
            errors.append(f'Prerequisite cycle at {node}')
            return
        if node in visited:
            return
        visiting.add(node)
        for child in graph.get(node, []):
            visit(child)
        visiting.remove(node)
        visited.add(node)
    for node in graph:
        visit(node)
    for sid, expected in expected_dependencies.items():
        actual = sources[sid].get('lesson_dependencies', [])
        if isinstance(actual, list) and set(actual) != expected:
            errors.append(f'{sid}: lesson dependencies do not match curriculum usage')

    locale_graph = {}
    for lid, locale in groups['locales'].items():
        file_path(locale.get('path'), f'locale {lid}')
        file_path(locale.get('data_path'), f'locale {lid}')
        data = load(root, locale.get('data_path', ''), errors)
        if data.get('id') != lid:
            errors.append(f'locale {lid}: data ID mismatch')
        inherits = string_list(data, 'inherits', f'locale {lid}')
        locale_graph[lid] = inherits
        for parent in inherits:
            if parent not in groups['locales']:
                errors.append(f'locale {lid}: unknown inherited locale {parent}')
        for sid in string_list(data, 'source_ids', f'locale {lid}'):
            if sid not in sources:
                errors.append(f'locale {lid}: unknown source {sid}')
        try:
            date.fromisoformat(data['last_checked'])
        except (KeyError, ValueError, TypeError):
            errors.append(f'locale {lid}: invalid last_checked')
    # Reuse cycle detection for locale inheritance.
    graph, visiting, visited = locale_graph, set(), set()
    for node in graph:
        visit(node)
    for pid, pathway in groups['pathways'].items():
        context = f'pathway {pid}'
        path = file_path(pathway.get('path'), context)
        field(pathway, 'title', str, context)
        if type(pathway.get('estimated_daily_minutes')) is not int or pathway['estimated_daily_minutes'] <= 0:
            errors.append(f'{context}: invalid daily minutes')
        for did in string_list(pathway, 'domains', context):
            if did not in groups['domains']:
                errors.append(f'{context}: unknown domain {did}')
        if pathway.get('capstone') not in groups['capstones']:
            errors.append(f'{context}: unknown capstone')
        sessions = field(pathway, 'sessions', list, context)
        if any(not isinstance(s, dict) for s in sessions):
            errors.append(f'{context}: sessions must be objects')
            continue
        if [s.get('day') for s in sessions] != list(range(1, 31)):
            errors.append(f'{context}: requires days 1–30 exactly once')
        for session in sessions:
            if session.get('kind') not in ['diagnostic','practice','assessment','reassessment','capstone','reflection']:
                errors.append(f'{context}: unknown session kind')
            file_path(session.get('path'), context)
            for cid in string_list(session, 'competencies', context):
                if cid not in competencies:
                    errors.append(f'{context}: unknown session competency {cid}')
            if session.get('kind') == 'capstone' and session.get('capstone') != pathway.get('capstone'):
                errors.append(f'{context}: session capstone mismatch')
        if path:
            days = [int(day) for day in re.findall(r'^\| (\d+) \|', path.read_text(encoding='utf-8'), re.M)]
            if days != list(range(1,31)):
                errors.append(f'{context}: Markdown session days differ from metadata')

    markdown = {p: p.read_text(encoding='utf-8') for p in root.rglob('*.md')
                if not any(part in ['.git','node_modules','personal','private'] for part in p.relative_to(root).parts)}
    for path, text in markdown.items():
        markup = re.sub(r'(?ms)^```[^\n]*\n.*?^```\s*$', '', text)
        markup = re.sub(r'`[^`\n]*`', '', markup)
        if markup.count('<details>') != markup.count('</details>'):
            errors.append(f'{path.relative_to(root)}: unmatched details')
        for raw in markdown_links(text):
            target = raw.strip('<>')
            parts = urlsplit(target)
            if parts.scheme or parts.netloc:
                continue
            resolved = (path.parent / unquote(parts.path)).resolve() if parts.path else path
            if not resolved.is_relative_to(root) or not resolved.is_file():
                errors.append(f'{path.relative_to(root)}: broken/unsafe internal link {target}')
            elif parts.fragment and resolved.suffix == '.md':
                if unquote(parts.fragment) not in anchors(markdown.get(resolved, resolved.read_text(encoding='utf-8'))):
                    errors.append(f'{path.relative_to(root)}: broken anchor {target}')
    return errors, warnings


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    errors, warnings = validate(args.root)
    for warning in warnings:
        print(f'WARNING: {warning}')
    for error in errors:
        print(f'ERROR: {error}')
    if errors:
        raise SystemExit(1)
    print('PASS: metadata, competencies, sources, scenarios, pathways, sections, and internal links.')
