"""Regression checks for broken metadata, exposed solutions, and failed links."""
from datetime import date
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from validate_curriculum import anchors, validate
from check_external_links import apply_exception, check_url, load_exceptions


class CurriculumValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='life-skills-quality-')
        self.root = Path(self.temp.name).resolve() / 'repo'
        assert self.root.is_relative_to(Path(self.temp.name).resolve())
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns('.git','node_modules','personal','private','__pycache__'))

    def tearDown(self):
        self.temp.cleanup()

    def change_index(self, edit):
        path = self.root / 'curriculum/index.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        edit(data)
        path.write_text(json.dumps(data), encoding='utf-8')

    def assert_rejected(self, message):
        errors = validate(self.root, today=date(2026,10,3))[0]
        self.assertTrue(any(message in e for e in errors), errors)

    def test_current_curriculum_passes(self):
        self.assertEqual(validate(self.root, today=date(2026,10,3))[0], [])

    def test_duplicate_id_rejected(self):
        self.change_index(lambda d: d['domains'].append(d['domains'][0].copy()))
        self.assert_rejected('duplicate IDs')

    def test_prerequisite_cycle_rejected(self):
        def edit(data):
            next(d for d in data['domains'] if d['id']=='critical-thinking')['prerequisites']=['money.foundation']
        self.change_index(edit)
        self.assert_rejected('cycle')

    def test_unknown_source_rejected(self):
        self.change_index(lambda d: d['scenarios'][0]['source_dependencies'].append('missing-source'))
        self.assert_rejected('unknown source')

    def test_malformed_time_rejected(self):
        self.change_index(lambda d: d['domains'][0].update(estimated_time_minutes='twenty'))
        self.assert_rejected('invalid estimated_time_minutes')

    def test_missing_stage_rejected(self):
        self.change_index(lambda d: d['domains'][0]['competencies'].pop())
        self.assert_rejected('four ordered mastery stages')

    def test_unsafe_path_rejected(self):
        self.change_index(lambda d: d['domains'][0].update(path='../outside.md'))
        self.assert_rejected('missing or unsafe path')

    def test_missing_section_rejected(self):
        path=self.root/'guides/02-money.md'
        path.write_text(path.read_text(encoding='utf-8').replace('## Practise','## Removed'),encoding='utf-8')
        self.assert_rejected('missing ## Practise')

    def test_exposed_solution_rejected(self):
        path=self.root/'scenarios/02-money.md'
        text=path.read_text(encoding='utf-8').replace('<details>','').replace('</details>','')
        path.write_text(text,encoding='utf-8')
        self.assert_rejected('wholly inside details')

    def test_broken_anchor_rejected(self):
        path=self.root/'README.md'
        path.write_text(path.read_text(encoding='utf-8')+'\n[Missing](curriculum/mastery.md#missing)\n',encoding='utf-8')
        self.assert_rejected('broken anchor')

    def test_missing_day_rejected(self):
        self.change_index(lambda d: d['pathways'][0]['sessions'].pop())
        self.assert_rejected('days 1–30')

    def test_stale_sources_warn(self):
        errors,warnings=validate(self.root,today=date(2027,5,1))
        self.assertEqual(errors,[])
        self.assertTrue(any('older than 180 days' in w for w in warnings))


class ExternalLinkTests(unittest.TestCase):
    def response(self, code, calls=None):
        def fail(request, timeout):
            if calls is not None:
                calls.append(request.full_url)
            raise HTTPError(request.full_url,code,'simulated',{},None)
        return fail

    def test_missing_url_is_broken(self):
        result=check_url('https://test.invalid/',request_open=self.response(404),pause=lambda _:None)
        self.assertEqual(result['result'],'broken')

    def test_blocked_url_is_unverified(self):
        result=check_url('https://test.invalid/',request_open=self.response(403),pause=lambda _:None)
        self.assertEqual(result['result'],'unverified')

    def test_rate_limit_retries(self):
        calls=[]
        result=check_url('https://test.invalid/',request_open=self.response(429,calls),pause=lambda _:None)
        self.assertEqual(len(calls),3)
        self.assertEqual(result['result'],'unverified')

    def test_exception_expiry(self):
        result={'url':'https://test.invalid/','result':'broken','status':403}
        exception=[dict(url=result['url'],statuses=[403],reason='temporary',expires='2026-01-01')]
        self.assertEqual(apply_exception(result,exception,today=date(2026,10,3))['result'],'broken')

    def test_exception_never_means_reachable(self):
        result={'url':'https://test.invalid/','result':'broken','status':403}
        exception=[dict(url=result['url'],statuses=[403],reason='temporary',expires='2027-01-01')]
        self.assertEqual(apply_exception(result,exception,today=date(2026,10,3))['result'],'unverified')

    def test_allowlist_is_well_formed(self):
        self.assertIsInstance(load_exceptions(ROOT),list)

    def test_duplicate_heading_anchors(self):
        self.assertEqual(anchors('# Topic\n## Topic\n'),{'topic','topic-1'})


if __name__=='__main__':
    unittest.main()
