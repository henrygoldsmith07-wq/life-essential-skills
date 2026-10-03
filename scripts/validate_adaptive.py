"""Validate the adaptive extension without external packages or network access."""
from datetime import date
import hashlib
import json
from pathlib import Path
import re
from schema_checks import validate_schema

ROOT = Path(__file__).resolve().parents[1]
JURISDICTIONS = {'global','uk','great-britain','england','wales','scotland','northern-ireland','united-states'}
ROLES = {'authority','general-principle','local-alternative'}
MODES = {'knowledge','independent','adaptation'}

def covers(scope, locality):
    return scope == 'global' or scope == locality or (scope == 'uk' and locality in {'uk','great-britain','england','wales','scotland','northern-ireland'}) or (scope == 'great-britain' and locality in {'great-britain','england','wales','scotland'})

def load(root, path, errors):
    try:
        value = json.loads((root/path).read_text(encoding='utf-8'))
        if not isinstance(value,dict):
            raise ValueError('expected object')
        return value
    except (OSError, ValueError) as exc:
        errors.append(f'{path}: {exc}')
        return {}

def validate(root=ROOT, today=None):
    root=Path(root); today=today or date.today(); errors=[]; warnings=[]
    index=load(root,'curriculum/index.json',errors)
    skills=load(root,'curriculum/subskills.json',errors)
    bank=load(root,'assessments/bank.json',errors)
    answers=load(root,'assessor/answers.json',errors).get('answers',{})
    benchmarks=load(root,'assessor/benchmarks.json',errors)
    registry=load(root,'data/sources.json',errors)
    expected_extension={'subskills_path':'curriculum/subskills.json','assessment_bank_path':'assessments/bank.json','learner_state_schema':'schemas/learner-state.schema.json','dashboard_path':'learner/index.html','assessor_path':'assessor/README.md'}
    if index.get('adaptive')!=expected_extension:errors.append('Missing or invalid adaptive architecture pointers')
    for schema_path,value in [('schemas/subskills.schema.json',skills),('schemas/assessment-bank.schema.json',bank)]:
        schema=load(root,schema_path,errors)
        if schema:errors+=validate_schema(value,schema,schema_path)
    state_schema=load(root,'schemas/learner-state.schema.json',errors)
    for path in (root/'examples/learners').glob('*.json'):
        errors+=validate_schema(load(root,str(path.relative_to(root)),errors),state_schema,str(path.relative_to(root)))
    def records(data,key):
        rows=data.get(key)
        if not isinstance(rows,list) or any(not isinstance(r,dict) for r in rows):
            errors.append(f'{key}: expected object list');return []
        ids=[r.get('id') for r in rows]
        if key!='benchmarks' and (any(not isinstance(v,str) or not v for v in ids) or len(set(v for v in ids if isinstance(v,str)))!=len(rows)):
            errors.append(f'{key}: duplicate or invalid IDs')
        return rows
    def strings(r,key,label,nonempty=False):
        v=r.get(key)
        if not isinstance(v,list) or any(not isinstance(x,str) or not x for x in v) or (nonempty and not v) or (isinstance(v,list) and len(set(x for x in v if isinstance(x,str)))!=len(v)):
            errors.append(f'{label}: invalid {key}');return []
        return v
    def text(r,key,label):
        if not isinstance(r.get(key),str) or not r[key].strip():errors.append(f'{label}: missing {key}')
    def safe_file(path,label):
        if not isinstance(path,str) or not (root/path).resolve().is_relative_to(root.resolve()) or not (root/path).is_file():errors.append(f'{label}: missing or unsafe file {path}');return False
        return True
    sources={r.get('id'):r for r in records(registry,'sources') if isinstance(r.get('id'),str)}
    comps={r.get('id'):r for r in records(skills,'competencies') if isinstance(r.get('id'),str)}
    items={r.get('id'):r for r in records(bank,'items') if isinstance(r.get('id'),str)}
    tags={r.get('id') for r in records(skills,'error_tags')}
    domains={d.get('id') for d in index.get('domains',[]) if isinstance(d,dict)}
    for data,label in [(skills,'subskills'),(bank,'bank'),(benchmarks,'benchmarks')]:
        if data.get('schema_version')!=1:errors.append(f'{label}: unsupported version')
    def scopes(r,label):
        values=strings(r,'jurisdictions',label,True)
        if set(values)-JURISDICTIONS:errors.append(f'{label}: unknown jurisdiction')
        return values
    def uses(r,label,required=None):
        refs=r.get('source_uses')
        if not isinstance(refs,list) or any(not isinstance(x,dict) for x in refs):errors.append(f'{label}: missing source uses');return
        ids=[x.get('source_id') for x in refs]
        if required is not None and sorted(str(x) for x in ids)!=sorted(required):errors.append(f'{label}: source uses differ from dependencies')
        for use in refs:
            source=sources.get(use.get('source_id'))
            if not source:errors.append(f'{label}: unknown source');continue
            role=use.get('role')
            if role not in ROLES:errors.append(f'{label}: invalid source role')
            if role in {'general-principle','local-alternative'}:
                text(use,'justification',label)
                if len(use.get('justification',''))<40:errors.append(f'{label}: insufficient jurisdiction justification')
            if role in {'authority','local-alternative'}:
                targets=scopes(use,label)
                for j in targets:
                    if not any(covers(s,j) for s in source.get('jurisdictions',[])):errors.append(f'{label}: incompatible source jurisdiction {source["id"]} -> {j}')
                if role=='authority':
                    for j in r.get('jurisdictions',[]):
                        if not any(covers(t,j) for t in targets):errors.append(f'{label}: authority does not cover scenario locality {j}')
            if r.get('regulated_topics') and role!='authority':errors.append(f'{label}: regulated assessment needs compatible authority, not a general-principle exception')
    for sid,s in sources.items():
        scopes(s,sid)
        interval=s.get('review_interval_days')
        if type(interval) is not int or interval<1:errors.append(f'{sid}: invalid review interval');continue
        tracking=s.get('change_tracking',{})
        if not isinstance(tracking,dict) or tracking.get('method')!='normalised-main-text' or tracking.get('human_review_required') is not True:
            errors.append(f'{sid}: missing source change tracking');continue
        baseline=tracking.get('baseline')
        if baseline is not None and (not isinstance(baseline,dict) or not re.fullmatch(r'[a-f0-9]{64}',str(baseline.get('sha256',''))) or not baseline.get('captured_at') or not baseline.get('title')):errors.append(f'{sid}: invalid fingerprint baseline')
        try:
            reviewed=date.fromisoformat(tracking['last_content_review'])
            if (today-reviewed).days>interval:warnings.append(f'{sid}: stale substantive source review; HTTP 200 is not evidence of correctness')
        except (KeyError,TypeError,ValueError):errors.append(f'{sid}: invalid substantive review date')
    graph={}
    for cid,c in comps.items():
        if c.get('domain') not in domains or not cid.startswith(str(c.get('domain'))+'.') or cid.count('.')!=2:errors.append(f'{cid}: invalid subskill/domain')
        if c.get('mode') not in MODES:errors.append(f'{cid}: invalid performance mode')
        for key in ['criterion','evidence','title','practical_scope']:text(c,key,cid)
        if c.get('practical_scope')!='planning-and-judgement-only':errors.append(f'{cid}: written route cannot award physical competence')
        safe_file(c.get('learn_path'),cid);scopes(c,cid)
        for key in ['prerequisites','related_competencies']:
            for ref in strings(c,key,cid):
                if ref not in comps:errors.append(f'{cid}: unknown {key} {ref}')
        graph[cid]=strings(c,'prerequisites',cid)
        for tag in strings(c,'error_tags',cid,True):
            if tag not in tags:errors.append(f'{cid}: unknown error tag')
        routes=strings(c,'assessment_routes',cid,True)
        if set(routes)!={i['id'] for i in items.values() if cid in i.get('competencies',[])}:errors.append(f'{cid}: assessment routes mismatch')
        policies=skills.get('review_policy',{}).get('overrides',{})
        if c.get('review_policy')!='default' and c.get('review_policy') not in policies:errors.append(f'{cid}: unknown review policy')
    visiting=set();done=set()
    def visit(node):
        if node in visiting:errors.append(f'Subskill prerequisite cycle at {node}');return
        if node in done:return
        visiting.add(node)
        for pre in graph.get(node,[]):visit(pre)
        visiting.remove(node);done.add(node)
    for cid in graph:visit(cid)
    policy=skills.get('review_policy',{})
    for p in [policy.get('default',{}),*policy.get('overrides',{}).values()]:
        days=p.get('intervals_days')
        if not isinstance(days,list) or not days or any(type(n)is not int or n<1 for n in days) or days!=sorted(set(days)) or type(p.get('retry_days')) is not int or p['retry_days']<1:errors.append('Invalid configurable reassessment intervals')
    legacy={c['id']:c for d in index.get('domains',[]) for c in d.get('competencies',[])}
    rollups=records(skills,'rollups')
    if {r.get('id') for r in rollups}!=set(legacy):errors.append('Domain rollups must preserve all 48 legacy IDs')
    for r in rollups:
        req=strings(r,'requires',r.get('id'),True)
        if any(x not in comps or x.split('.')[0]!=r['id'].split('.')[0] for x in req):errors.append(f'{r["id"]}: invalid domain rollup')
        if r.get('id') in legacy and legacy[r['id']].get('derived_from')!=req:errors.append(f'{r["id"]}: compatibility rollup mismatch')
        strings(r,'additional_evidence',r['id']);text(r,'scope',r['id'])
    if not isinstance(answers,dict):errors.append('Invalid assessor answer map');answers={}
    if set(answers)!=set(items):errors.append('Answers must cover every assessment exactly once')
    fingerprints=set()
    for ident,i in items.items():
        for forbidden in ['solution','explanation','answer','benchmarks']:
            if forbidden in i:errors.append(f'{ident}: exposed solution in learner bank')
        for key in ['title','family','task','answer_ref','exposure_group']:text(i,key,ident)
        if type(i.get('version')) is not int or i['version']<1 or type(i.get('estimated_time_minutes')) is not int or i['estimated_time_minutes']<1:errors.append(f'{ident}: invalid version or time')
        targets=strings(i,'competencies',ident,True)
        for cid in targets:
            if cid not in comps or comps[cid]['mode']!=i.get('mode'):errors.append(f'{ident}: assessment/competency mismatch')
        if len(targets)!=1:errors.append(f'{ident}: bank tasks assess one observable target; capstones stay separate')
        materials=strings(i,'materials',ident,True)
        normal=lambda text:re.sub(r'\s+',' ',text).strip().lower()
        signature=hashlib.sha256(json.dumps([[normal(t) for t in materials],normal(i.get('task',''))],sort_keys=True).encode()).hexdigest()
        if signature in fingerprints:errors.append(f'{ident}: duplicate assessment materials/task')
        fingerprints.add(signature)
        for pre in strings(i,'prerequisites',ident):
            if pre not in comps:errors.append(f'{ident}: unknown prerequisite')
        if targets and targets[0] in comps and i.get('prerequisites')!=comps[targets[0]]['prerequisites']:errors.append(f'{ident}: assessment prerequisite mismatch')
        scopes(i,ident);uses(i,ident)
        safety=strings(i,'safety_constraints',ident,True)
        if not any('Fictional data only' in s for s in safety) or not any('No real payment' in s for s in safety):errors.append(f'{ident}: unsafe task: missing simulation/privacy boundaries')
        unsafe=re.search(r'(?i)\b(?:send your (?:password|bank details)|perform CPR on|open the live appliance|make a real payment)\b',i.get('task',''))
        if unsafe:errors.append(f'{ident}: unsafe task instruction')
        scoring=i.get('scoring')
        if not isinstance(scoring,list) or not scoring or any(not isinstance(s,dict) or not s.get('id') or not s.get('criterion') or type(s.get('essential'))is not bool for s in scoring):errors.append(f'{ident}: missing scoring criteria')
        elif len({s['id'] for s in scoring})!=len(scoring) or not any(s['essential'] for s in scoring):errors.append(f'{ident}: invalid criterion IDs/essential gates')
        if isinstance(scoring,list) and any(not any(isinstance(s,dict) and s.get('id')==gate and s.get('essential') is True for s in scoring) for gate in ['criterion','constraints','safety']):errors.append(f'{ident}: criterion, constraint and safety gates must be essential')
        for tag in strings(i,'error_tags',ident,True):
            if tag not in tags or any(tag not in comps.get(c,{}).get('error_tags',[]) for c in targets):errors.append(f'{ident}: assessment error mismatch')
        if set(strings(i,'focus_errors',ident,True))-set(i.get('error_tags',[])):errors.append(f'{ident}: unknown remediation focus')
        for task in strings(i,'next_recommended_tasks',ident,True):
            if task not in items or task==ident:errors.append(f'{ident}: dead-end or invalid next task')
        answer=answers.get(ident,{})
        if not isinstance(answer,dict):errors.append(f'{ident}: invalid answer');continue
        for key in ['solution','explanation']:text(answer,key,ident)
        if answer.get('version')!=i.get('version'):errors.append(f'{ident}: answer version mismatch')
        if set(answer.get('common_mistakes',{}))!=set(i.get('error_tags',[])):errors.append(f'{ident}: common error coverage missing')
        if i.get('answer_ref')!='assessor/answers.json#'+ident:errors.append(f'{ident}: invalid hidden answer reference')
    for family in strings(skills,'priority_families','skills',True):
        variants=[i for i in items.values() if i.get('family')==family and i.get('mode')=='independent']
        if len(variants)<5:errors.append(f'{family}: needs five meaningful variants')
        for i in variants:
            if len(strings(i,'variant_axes',i['id'],True))<5:errors.append(f'{i["id"]}: insufficient transfer variation')
    seen_bench=set()
    for b in records(benchmarks,'benchmarks'):
        ident=b.get('item_id');seen_bench.add(ident)
        if ident not in items or b.get('version')!=items[ident]['version']:errors.append('Benchmark assessment/version mismatch')
        levels=b.get('levels',{})
        if not isinstance(levels,dict) or set(levels)!={'not-yet','assisted','independent','advanced'}:errors.append(f'{ident}: missing benchmark levels');continue
        for level,row in levels.items():
            if not isinstance(row,dict):errors.append(f'{ident}: invalid benchmark response');continue
            text(row,'response',ident);text(row,'why',ident)
    for family in skills.get('priority_families',[]):
        if not any(items.get(i,{}).get('family')==family for i in seen_bench):errors.append(f'{family}: missing calibration benchmark')
    for group in ['domains','scenarios','capstones']:
        for r in index.get(group,[]):scopes(r,r['id']);uses(r,r['id'],r['source_dependencies'])
    for p in index.get('pathways',[]):
        if p.get('supported_localities')!=['uk','wales'] or not p.get('jurisdiction_rule'):errors.append(f'{p["id"]}: pathway locality rule missing')
    for locale in index.get('locales',[]):
        pack=load(root,locale['data_path'],errors)
        scopes(pack,locale['id']);uses(pack,locale['id'],pack.get('source_ids',[]))
    for path in ['schemas/learner-state.schema.json','schemas/subskills.schema.json','schemas/assessment-bank.schema.json','learner/index.html','learner/app.js','learner/style.css','curriculum/adaptive-learning.md','assessor/README.md']:
        safe_file(path,'Adaptive architecture')
    html=(root/'learner/index.html').read_text(encoding='utf-8') if (root/'learner/index.html').exists() else ''
    for asset in re.findall(r'(?:src|href)="([^"]+)"',html):
        if not asset.startswith(('http','#')):safe_file('learner/'+asset,'Learner navigation')
    for target in ['today','progress','practice','pathways','settings']:
        if f'id="{target}"' not in html:errors.append(f'Broken learner navigation: {target}')
    if 'answers.json' in html or 'benchmarks.json' in html:errors.append('Exposed solutions in initial learner page')
    return errors,warnings

if __name__=='__main__':
    errors,warnings=validate()
    for w in warnings:print('WARNING:',w)
    for e in errors:print('ERROR:',e)
    if errors:raise SystemExit(1)
    print('PASS: adaptive graph, rollups, assessment routes, safety, calibration, jurisdiction and learner navigation.')
