"""Render static learner assets from canonical curriculum; no answers in initial data."""
import argparse
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]

def outputs(root=ROOT):
    root=Path(root)
    read=lambda p:json.loads((root/p).read_text(encoding='utf-8'))
    index=read('curriculum/index.json')
    items=read('assessments/bank.json')['items']+read('assessments/capstones.json')['items']
    keys=['id','version','title','family','competencies','mode','difficulty','estimated_time_minutes','prerequisites','jurisdictions','error_tags','exposure_group','focus_errors']
    headers=[]
    for item in items:
        header={k:item[k] for k in keys}
        header['scoring']=[{k:s[k] for k in ['id','essential','competency_id']} for s in item['scoring']]
        header['chunk']='capstones' if item['family']=='capstone' else item['competencies'][0].split('.')[0]
        headers.append(header)
    data={'index':{g:[{k:r[k] for k in ['id','title','path','domains','capstone'] if k in r} for r in index[g]] for g in ['domains','pathways','capstones','scenarios']},'skills':read('curriculum/subskills.json'),'bank':{'schema_version':1,'items':headers},
      'sources':[{k:s[k] for k in ['id','title','url','jurisdictions','last_checked']} for s in read('data/sources.json')['sources']], 'practical':read('assessor/practical-rubrics.json')}
    result={}
    for d in index['domains']:
        text=(root/d['path']).read_text(encoding='utf-8')
        # Practice solutions stay in canonical Markdown but out of the learn view.
        text=re.sub(r'<details>[\s\S]*?</details>','',text)
        text=text.split('## Build and demonstrate this skill')[0]
        chunk={'lesson':text,'path':d['path'],'items':[i for i in items if i['family']!='capstone' and i['competencies'][0].split('.')[0]==d['id']]}
        result['learner/chunks/'+d['id']+'.json']=json.dumps(chunk,ensure_ascii=False)+'\n'
    result['learner/chunks/capstones.json']=json.dumps({'items':[i for i in items if i['family']=='capstone']},ensure_ascii=False)+'\n'
    result['learner/data.js']='/* Generated core only; tasks, guides and feedback load on demand. */\nwindow.LEARNING_DATA = '+json.dumps(data,ensure_ascii=False).replace('<','\\u003c')+';\n'
    for ident,answer in read('assessor/answers.json')['answers'].items():
        result['assessor/feedback/'+ident+'.json']=json.dumps(answer,indent=2,ensure_ascii=False)+'\n'
    for benchmark in read('assessor/benchmarks.json')['benchmarks']:
        result['assessor/calibration/'+benchmark['item_id']+'.json']=json.dumps(benchmark,indent=2,ensure_ascii=False)+'\n'
    return result

def build(root=ROOT,check=False):
    failures=[]
    generated=outputs(root)
    expected=set(generated)
    actual={'assessor/feedback/'+p.name for p in (Path(root)/'assessor/feedback').glob('*.json')}|{'learner/chunks/'+p.name for p in (Path(root)/'learner/chunks').glob('*.json')}
    actual|={'assessor/calibration/'+p.name for p in (Path(root)/'assessor/calibration').glob('*.json')}
    if actual-expected:failures.append('Unexpected obsolete feedback assets')
    for relative,text in generated.items():
        path=Path(root)/relative
        if check:
            if not path.exists() or path.read_text(encoding='utf-8')!=text:failures.append(relative+' is out of date')
        else:
            path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text,encoding='utf-8',newline='\n')
    return failures

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    failures=build(check=args.check)
    if failures:raise SystemExit('\n'.join(failures))
    print('PASS: learner data and per-item feedback match canonical content.' if args.check else 'Built learner data and per-item feedback.')
