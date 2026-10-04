"""Mutation tests for adaptive content integrity and source-change signals."""
from datetime import date
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from validate_adaptive import validate, covers
from check_source_changes import fingerprint, compare, check
from schema_checks import validate_schema
from build_learner import build

class AdaptiveIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='life-skills-adaptive-')
        cls.root=Path(cls.temp.name)/'repo'
        shutil.copytree(ROOT,cls.root,ignore=shutil.ignore_patterns('.git','node_modules','__pycache__'))
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()
    def setUp(self):self.original={}
    def tearDown(self):
        for path,data in self.original.items():path.write_bytes(data)
    def change(self,path,edit):
        p=self.root/path;self.original.setdefault(p,p.read_bytes());data=json.loads(p.read_text(encoding='utf-8'));edit(data);p.write_text(json.dumps(data),encoding='utf-8')
    def reject(self,needle):
        errors=validate(self.root,today=date(2026,10,3))[0];self.assertTrue(any(needle in e for e in errors),errors)
    def test_valid_extension(self):self.assertEqual(validate(self.root,today=date(2026,10,3))[0],[])
    def test_subskill_cycle(self):
        self.change('curriculum/subskills.json',lambda d:d['competencies'][0]['prerequisites'].append(d['competencies'][1]['id']));self.reject('cycle')
    def test_rollup_cannot_use_other_domain(self):
        self.change('curriculum/subskills.json',lambda d:d['rollups'][0].update(requires=['money.budget.foundation']));self.reject('domain rollup')
    def test_duplicate_items(self):
        self.change('assessments/bank.json',lambda d:d['items'].append(d['items'][0].copy()));self.reject('duplicate')
    def test_duplicate_material_under_new_id(self):
        def edit(d):d['items'][1]['materials']=d['items'][0]['materials'];d['items'][1]['task']=d['items'][0]['task']
        self.change('assessments/bank.json',edit);self.reject('duplicate assessment materials')
    def test_assessment_mismatch(self):
        self.change('assessments/bank.json',lambda d:d['items'][0].update(competencies=['money.budget.independent']));self.reject('assessment/competency mismatch')
    def test_missing_practical_scope(self):
        self.change('curriculum/subskills.json',lambda d:d['competencies'][0].update(practical_scope='physical-competence'));self.reject('physical competence')
    def test_wrong_wales_housing_authority(self):
        def edit(d):next(i for i in d['items'] if i['id']=='W-HO-01')['source_uses'][0]['source_id']='england-housing'
        self.change('assessments/bank.json',edit);self.reject('incompatible source jurisdiction')
    def test_housing_cannot_hide_scope_behind_general_exception(self):
        def edit(d):next(i for i in d['items'] if i['id']=='W-HO-01')['source_uses'][0]={'source_id':'england-housing','role':'general-principle','justification':'This is merely general guidance and should work everywhere without checking local housing rules.'}
        self.change('assessments/bank.json',edit);self.reject('regulated assessment needs compatible authority')
    def test_source_scope_and_legacy_use_conflict(self):
        self.change('data/sources.json',lambda d:next(s for s in d['sources'] if s['id']=='wales-housing').update(jurisdictions=['england']));self.reject('incompatible source jurisdiction')
    def test_healthcare_wrong_nation_rejected(self):
        def edit(d):next(i for i in d['items'] if i['family']=='health.access')['source_uses'][0]['source_id']='nhs-wellbeing'
        self.change('assessments/bank.json',edit);self.reject('incompatible source jurisdiction')
    def test_missing_safety_boundary(self):
        self.change('assessments/bank.json',lambda d:d['items'][0].update(safety_constraints=['Be careful']));self.reject('unsafe task')
    def test_safety_cannot_be_optional(self):
        self.change('assessments/bank.json',lambda d:next(s for s in d['items'][0]['scoring'] if s['id']=='safety').update(essential=False));self.reject('safety gates must be essential')
    def test_extension_cannot_be_disabled(self):
        self.change('curriculum/index.json',lambda d:d.pop('adaptive'));self.reject('adaptive architecture pointers')
    def test_explicit_unsafe_instruction(self):
        self.change('assessments/bank.json',lambda d:d['items'][0].update(task='Send your password to prove setup.'));self.reject('unsafe task instruction')
    def test_exposed_solution(self):
        self.change('assessments/bank.json',lambda d:d['items'][0].update(solution='Answer exposed'));self.reject('exposed solution')
    def test_missing_benchmark_level(self):
        self.change('assessor/benchmarks.json',lambda d:d['benchmarks'][0]['levels'].pop('assisted'));self.reject('missing benchmark levels')
    def test_missing_error_category(self):
        self.change('curriculum/subskills.json',lambda d:d['competencies'][0]['error_tags'].append('unknown'));self.reject('unknown error tag')
    def test_invalid_intervals(self):
        self.change('curriculum/subskills.json',lambda d:d['review_policy']['default'].update(intervals_days=[7,3]));self.reject('reassessment intervals')
    def test_broken_learner_navigation(self):
        p=self.root/'learner/index.html';self.original[p]=p.read_bytes();p.write_text(p.read_text().replace('id="practice"','id="gone"'));self.reject('Broken learner navigation')
    def test_source_substantive_review_stale(self):
        errors,warnings=validate(self.root,today=date(2027,5,1));self.assertEqual(errors,[]);self.assertTrue(any('stale substantive' in w for w in warnings))
    def test_learner_render_is_current_and_no_initial_answers(self):
        self.assertEqual(build(self.root,check=True),[]);text=(self.root/'learner/data.js').read_text(encoding='utf-8');self.assertNotIn('"solution":',text);self.assertNotIn('"benchmarks":',text)
    def test_generated_assets_detect_drift(self):
        self.change('assessments/bank.json',lambda d:d['items'][0].update(title='changed title'));self.assertTrue(build(self.root,check=True))
    def test_unknown_learner_fields_refused(self):
        schema=json.loads((self.root/'schemas/learner-state.schema.json').read_text());state=json.loads((self.root/'examples/learners/new-learner.json').read_text());state['password']='secret';self.assertTrue(validate_schema(state,schema))
    def test_rubric_change_requires_benchmark_review(self):
        self.change('assessments/bank.json',lambda d:next(i for i in d['items'] if i['id']=='M-CF-01')['scoring'][0].update(criterion='Changed criterion'));self.reject('benchmark rubric changed')
    def test_material_change_requires_benchmark_review(self):
        self.change('assessments/bank.json',lambda d:next(i for i in d['items'] if i['id']=='M-CF-01')['materials'].append('A changed constraint'));self.reject('benchmark rubric changed')
    def test_every_domain_needs_calibration(self):
        self.change('assessor/benchmarks.json',lambda d:d.update(benchmarks=[b for b in d['benchmarks'] if not b['item_id'].startswith('HEALTH-')]));self.reject('representative calibration')
    def test_capstone_criterion_mapping(self):
        self.change('assessments/capstones.json',lambda d:d['items'][0]['scoring'][0].update(competency_id='money.budget.independent'));self.reject('criterion mapping')
    def test_capstone_missing_skill_safety_gate(self):
        self.change('assessments/capstones.json',lambda d:next(s for s in d['items'][0]['scoring'] if s['id']=='skill-1-safety').update(essential=False));self.reject('safety gates must be essential')
    def test_capstone_missing_calibration(self):
        self.change('assessor/benchmarks.json',lambda d:d.update(benchmarks=[b for b in d['benchmarks'] if b['item_id']!='C03']));self.reject('capstone calibration')
    def test_structured_judgement_is_bounded_and_no_personal_notes(self):
        schema=json.loads((self.root/'schemas/learner-state.schema.json').read_text());s=json.loads((self.root/'examples/learners/assessor-reviewed.json').read_text());self.assertEqual(validate_schema(s,schema),[])
        s['reviews'][0]['notes']='private';self.assertTrue(validate_schema(s,schema))
    def test_initial_core_has_no_task_content_and_stays_small(self):
        text=(self.root/'learner/data.js').read_text(encoding='utf-8');self.assertNotIn('"materials":',text);self.assertNotIn('"task":',text);self.assertLess(len(text.encode()),400000)
    def test_capstone_materials_cannot_drift_from_markdown(self):
        self.change('assessments/capstones.json',lambda d:d['items'][0]['materials'].append('Different fictional costs'));self.reject('Markdown/data drift')
    def test_duplicate_calibration_references_refused(self):
        self.change('assessor/benchmarks.json',lambda d:d['benchmarks'].append(d['benchmarks'][0].copy()));self.reject('Duplicate calibration')

class SourceSignalTests(unittest.TestCase):
    def source(self):return {'id':'test','review_interval_days':90,'change_tracking':{'last_content_review':'2026-10-01','baseline':None}}
    def html(self,body):return '<html><title>Guidance</title><nav>Ignore menu</nav><main>'+body+'</main></html>'
    def test_normalisation_ignores_menu_and_whitespace(self):
        body='Guidance detail '*30
        a=fingerprint(self.html(body));b=fingerprint(self.html(body.replace(' ','  ')).replace('Ignore menu','Different menu'));self.assertEqual(a['sha256'],b['sha256'])
    def test_content_change_requires_manual_review(self):
        source=self.source();source['change_tracking']['baseline']=fingerprint(self.html('Old rule '*40));result=compare(source,fingerprint(self.html('New rule '*40)),date(2026,10,3));self.assertEqual(result['status'],'changed');self.assertTrue(result['manual_review_required'])
    def test_stale_even_if_identical(self):
        source=self.source();current=fingerprint(self.html('Rule '*100));source['change_tracking']['baseline']=current;result=compare(source,current,date(2027,5,1));self.assertEqual(result['status'],'stale');self.assertFalse(result['changed'])
    def test_200_challenge_is_not_content(self):
        with self.assertRaises(ValueError):fingerprint('<title>Just a moment</title><main>'+'challenge '*100+'</main>')
    def test_unbaselined_accessible_is_not_verified(self):
        result=compare(self.source(),fingerprint(self.html('Rule '*100)),date(2026,10,3));self.assertEqual(result['status'],'accessible');self.assertTrue(result['baseline_missing']);self.assertTrue(result['manual_review_required'])
    def test_network_failure_is_inaccessible(self):
        def fail(*args,**kwargs):raise OSError('network blocked')
        self.assertEqual(check(self.source()|{'url':'https://test.invalid'},opener=fail,today=date(2026,10,3))['status'],'inaccessible')
    def test_scope_covers(self):
        self.assertFalse(covers('england','wales'));self.assertFalse(covers('great-britain','northern-ireland'));self.assertTrue(covers('uk','wales'));self.assertFalse(covers('wales','uk'))
    def test_unknown_schema_assertion_refused(self):self.assertTrue(validate_schema({}, {'type':'object','fakeAssertion':True}))

if __name__=='__main__':unittest.main()
