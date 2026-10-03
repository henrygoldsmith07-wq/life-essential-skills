"""Flag source changes for human review. Accessibility never proves correctness."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]

class MainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts=[];self.main=[];self.title=[];self.stack=[]
    def handle_starttag(self,tag,attrs):
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(tag)
    def handle_endtag(self,tag):
        if tag in self.stack:
            self.stack=self.stack[:len(self.stack)-1-self.stack[::-1].index(tag)]
    def handle_data(self,value):
        if 'title' in self.stack:self.title.append(value)
        if any(t in self.stack for t in ['script','style','nav','header','footer','aside','noscript']):return
        self.parts.append(value)
        if 'main' in self.stack or 'article' in self.stack:self.main.append(value)

def fingerprint(html):
    p=MainText();p.feed(html)
    normal=lambda parts: re.sub(r'\s+',' ',' '.join(parts)).strip()
    content=normal(p.main or p.parts)
    title=normal(p.title)
    if len(content)<200 or re.search(r'(?i)(access denied|just a moment|verify you are human|attention required)',title):
        raise ValueError('No usable substantive page text; a challenge/empty page is not accessible guidance')
    return {'sha256':hashlib.sha256(content.encode()).hexdigest(),'title':title,'text_length':len(content),'method':'normalised-main-text'}

def compare(source,current,today=None):
    today=today or date.today()
    tracking=source['change_tracking'];baseline=tracking.get('baseline')
    stale=(today-date.fromisoformat(tracking['last_content_review'])).days>source['review_interval_days']
    changed=bool(baseline and (baseline['sha256']!=current['sha256'] or baseline['title']!=current['title']))
    return {'source_id':source['id'],'status':'changed' if changed else 'stale' if stale else 'accessible',
      'accessible':True,'changed':changed,'stale':stale,'baseline_missing':not bool(baseline),'manual_review_required':changed or stale or not bool(baseline),
      'fingerprint':current,'note':'Text fingerprint is a review signal, not semantic verification; HTTP 200 is not proof of correct guidance.'}

def check(source,opener=urlopen,today=None):
    try:
        req=Request(source['url'],headers={'User-Agent':'LifeEssentialSkills-source-review/1.0'})
        with opener(req,timeout=15) as response:
            if response.status!=200:raise ValueError(f'HTTP {response.status}')
            if 'text/html' not in response.headers.get('Content-Type',''):raise ValueError('Unsupported document type: manual review needed')
            raw=response.read(2_000_001)
            if len(raw)>2_000_000:raise ValueError('Page too large for bounded fingerprint review')
            result=fingerprint(raw.decode('utf-8',errors='replace'))
        return compare(source,result,today)
    except Exception as exc:
        return {'source_id':source['id'],'status':'inaccessible','accessible':False,'changed':None,
          'stale':( (today or date.today())-date.fromisoformat(source['change_tracking']['last_content_review'])).days>source['review_interval_days'],
          'manual_review_required':True,'note':str(exc)}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids',nargs='*',help='Selected source IDs; default: existing tracked baselines')
    parser.add_argument('--report',type=Path,required=True)
    parser.add_argument('--accept-reviewed',action='store_true',help='Maintainer attests substantive and jurisdiction review for selected IDs; updates baselines and human review date')
    args=parser.parse_args()
    path=ROOT/'data/sources.json';registry=json.loads(path.read_text(encoding='utf-8'))
    selected=[s for s in registry['sources'] if s['id'] in args.ids] if args.ids else [s for s in registry['sources'] if s['change_tracking']['baseline']]
    if args.ids and set(args.ids)-{s['id'] for s in selected}:raise SystemExit('Unknown source ID')
    if args.accept_reviewed and not args.ids:raise SystemExit('Explicit source IDs required for attested manual review')
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(check,selected))
    today=date.today().isoformat()
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps({'checked_at':today,'results':results},indent=2)+'\n',encoding='utf-8')
    if args.accept_reviewed:
        if any(not r['accessible'] for r in results):raise SystemExit('Cannot accept inaccessible/unusable pages; registry unchanged')
        for s,r in zip(selected,results):
            s['change_tracking']['baseline']={**r['fingerprint'],'captured_at':today}
            s['change_tracking']['last_content_review']=today
        path.write_text(json.dumps(registry,indent=2,ensure_ascii=False)+'\n',encoding='utf-8',newline='\n')
    for r in results:
        print(r['source_id']+': '+r['status']+'; '+r.get('note',''))
        if r['manual_review_required'] and os.environ.get('GITHUB_ACTIONS'):
            print('::warning title=Source guidance needs human review::'+r['source_id']+' is '+r['status']+'; check content, scope and dependent assessments before reliance.')
    summary=os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary,'a',encoding='utf-8') as out:
            out.write('### Substantive source review\n\nHTTP status does not establish correctness.\n\n| Source | Status | Human review required |\n| --- | --- | --- |\n')
            for r in results:out.write('| '+r['source_id']+' | '+r['status']+' | '+str(r['manual_review_required'])+' |\n')
    print('Human review required for changed, stale, inaccessible or unbaselined guidance.')
