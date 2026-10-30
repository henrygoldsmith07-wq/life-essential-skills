// Tests for named learner profiles (shared-browser isolation).
// The store takes its storage backend as an argument, so these run the exact
// shipped module against a Map-backed localStorage stub.
'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Profiles = require('../learner/profiles.js');

function stub(changes) {
  const map = new Map(Object.entries(changes || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

describe('learner profiles', () => {
  it('starts with a single Personal profile', () => {
    const s = stub();
    assert.deepEqual(Profiles.list(s), [{ id: 'personal', name: 'Personal', current: true }]);
    assert.equal(Profiles.currentId(s), 'personal');
  });

  it('creates, switches, renames and removes profiles without touching others', () => {
    const s = stub();
    const ada = Profiles.create(s, 'Ada');
    assert.equal(Profiles.currentId(s), ada);
    s.setItem(Profiles.evidenceKey(ada), '{"records":[]}');
    const jo = Profiles.create(s, 'Jo');
    Profiles.switchTo(s, 'personal');
    assert.equal(Profiles.currentId(s), 'personal');
    Profiles.rename(s, jo, 'Jo H');
    assert.equal(Profiles.list(s).find(p => p.id === jo).name, 'Jo H');
    Profiles.remove(s, ada);
    assert.equal(s._map.get(Profiles.evidenceKey(ada)), undefined);
    assert.deepEqual(Profiles.list(s).map(p => p.id).sort(), ['jo', 'personal']);
  });

  it('refuses to remove the current or the last profile, and unknown ids', () => {
    const s = stub();
    assert.throws(() => Profiles.remove(s, 'personal'), /Switch to another profile/);
    assert.throws(() => Profiles.remove(s, 'nobody'), /Unknown profile/);
    assert.throws(() => Profiles.switchTo(s, 'nobody'), /Unknown profile/);
    assert.throws(() => Profiles.create(s, '   '), /Give the profile a name/);
    assert.throws(() => Profiles.rename(s, 'personal', ''), /Give the profile a name/);
  });

  it('adopts legacy single-slot evidence instead of stranding it', () => {
    const s = stub({ 'life-essential-skills-evidence-v1': '{"records":[]}' });
    assert.equal(Profiles.currentId(s), 'personal');
    assert.equal(Profiles.evidenceKey('personal'), 'life-essential-skills-evidence-v1::personal');
  });

  it('rebuilds a corrupt index instead of crashing', () => {
    for (const bad of ['{oops', '{"current":"x"}', '{"current":"a","order":[],"names":{}}',
      '{"current":"a","order":["a","a"],"names":{"a":"A"}}']) {
      const s = stub({ [Profiles.INDEX_KEY]: bad });
      assert.equal(Profiles.currentId(s), 'personal');
    }
  });

  it('derives unique ids from duplicate names and caps the count', () => {
    const s = stub();
    assert.equal(Profiles.create(s, 'Sam'), 'sam');
    assert.equal(Profiles.create(s, 'Sam'), 'sam-2');
    for (let n = 0; n < Profiles.MAX_PROFILES; n++) {
      try { Profiles.create(s, 'Extra ' + n); } catch { break; }
    }
    assert.equal(Profiles.list(s).length, Profiles.MAX_PROFILES);
    assert.throws(() => Profiles.create(s, 'One more'), /Too many profiles/);
  });
});
