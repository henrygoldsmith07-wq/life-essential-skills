"""Check public links with retries; distinguish broken URLs from blocked checks."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from validate_curriculum import markdown_links

ROOT = Path(__file__).resolve().parents[1]


def check_url(url, attempts=3, timeout=12, request_open=urlopen, pause=time.sleep):
    status, detail = None, ''
    for attempt in range(attempts):
        request = Request(url, headers={'User-Agent': 'LifeEssentialSkills-LinkCheck/0.2', 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8'})
        try:
            with request_open(request, timeout=timeout) as response:
                status = response.status
                final_url = response.url
                # Do not fetch full documents or media; only verify the response.
                if 200 <= status < 300:
                    return {'url': url, 'result': 'reachable', 'status': status, 'final_url': final_url}
                detail = f'Unexpected response {status}'
        except HTTPError as exc:
            status, detail = exc.code, f'HTTP {exc.code}'
        except (URLError, TimeoutError, OSError, ValueError) as exc:
            status, detail = None, str(exc)
        if attempt + 1 < attempts:
            pause(min(2 ** attempt, 4))
    if status in [404, 410] or (status and 400 <= status < 500 and status not in [401,403,408,429]):
        result = 'broken'
    else:
        result = 'unverified'
    return {'url': url, 'result': result, 'status': status, 'detail': detail}


def apply_exception(result, exceptions, today=None):
    today = today or date.today()
    for exception in exceptions:
        if exception['url'] != result['url'] or date.fromisoformat(exception['expires']) < today:
            continue
        if result['status'] in exception['statuses']:
            result = dict(result, result='unverified', exception=exception['reason'])
    return result


def collect_urls(root):
    sources = json.loads((root / 'data/sources.json').read_text(encoding='utf-8'))['sources']
    urls = {source['url'] for source in sources}
    for path in root.rglob('*.md'):
        if any(p in ['.git','node_modules','personal','private'] for p in path.relative_to(root).parts):
            continue
        urls.update(link for link in markdown_links(path.read_text(encoding='utf-8')) if link.startswith('https://'))
    # These are fictional teaching hosts, never network targets.
    return sorted(url for url in urls if not urlsplit(url).hostname.endswith('.example'))


def load_exceptions(root):
    exceptions = json.loads((root / '.external-link-exceptions.json').read_text(encoding='utf-8'))['exceptions']
    seen = set()
    for item in exceptions:
        if not isinstance(item, dict) or set(item) != {'url','statuses','reason','expires'}:
            raise ValueError('Malformed external-link exception')
        if not isinstance(item['url'], str) or not item['url'].startswith('https://') or item['url'] in seen:
            raise ValueError('Invalid or duplicate exception URL')
        seen.add(item['url'])
        if not isinstance(item['statuses'], list) or not item['statuses'] or any(s not in [401,403,408,429,500,502,503,504] for s in item['statuses']):
            raise ValueError('Exceptions may cover access/server failures, never 404/410')
        if not isinstance(item['reason'], str) or not item['reason'].strip():
            raise ValueError('Exception requires a reason')
        date.fromisoformat(item['expires'])
    return exceptions


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--strict', action='store_true', help='Also fail when a URL cannot be verified')
    args = parser.parse_args()
    exceptions = load_exceptions(args.root)
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = [apply_exception(result, exceptions) for result in pool.map(check_url, collect_urls(args.root))]
    broken = [r for r in results if r['result'] == 'broken']
    unverified = [r for r in results if r['result'] == 'unverified']
    for result in broken + unverified:
        print(f'{result["result"].upper()}: {result["url"]} — {result.get("detail", "")}')
    print(f'{len(results)} URLs: {len(results)-len(broken)-len(unverified)} reachable, {len(broken)} broken, {len(unverified)} unverified.')
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps({'checked_on':date.today().isoformat(),'results':results},indent=2)+'\n',encoding='utf-8')
    raise SystemExit(1 if broken or (args.strict and unverified) else 0)
