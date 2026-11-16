/* Named learner profiles for shared browsers. No network, no identities.
 *
 * One browser often serves several learners — a family computer, a classroom
 * tablet, a library PC. A single evidence slot forces those learners to
 * juggle export files to avoid overwriting each other. Profiles give each
 * learner a named, isolated evidence slot in the same browser: switching
 * never merges, every profile keeps its own backup stamp, and deleting a
 * profile only ever removes that profile's key.
 *
 * Storage layout (all values are JSON strings, all keys local to the app):
 *   life-essential-skills-profiles-v1        the index {current, order, names}
 *   life-essential-skills-evidence-v1::<id>  the evidence state per profile
 * The store takes the storage backend as an argument so it runs unchanged in
 * the browser (localStorage) and under Node tests (a Map-backed stub).
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.LearnerProfiles=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const INDEX_KEY = 'life-essential-skills-profiles-v1';
  const EVIDENCE_PREFIX = 'life-essential-skills-evidence-v1';
  const DEFAULT_ID = 'personal';
  const MAX_PROFILES = 20;
  const validId = v => typeof v === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(v);

  const evidenceKey = id => EVIDENCE_PREFIX + '::' + id;

  function readIndex(storage) {
    try {
      const raw = storage.getItem(INDEX_KEY);
      if(!raw)return null;
      const doc = JSON.parse(raw);
      if(!doc || typeof doc !== 'object' || !validId(doc.current) ||
        !Array.isArray(doc.order) || !doc.order.length ||
        !doc.order.every(validId) || new Set(doc.order).size !== doc.order.length ||
        !doc.order.includes(doc.current) ||
        typeof doc.names !== 'object' || !doc.names ||
        !doc.order.every(id => typeof doc.names[id] === 'string' && doc.names[id].trim()))return null;
      return { current: doc.current, order: [...doc.order], names: { ...doc.names } };
    } catch { return null; }
  }

  function writeIndex(storage, index) {
    storage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  // First run, or a browser whose index was cleared while evidence keys
  // survived: adopt the legacy single-slot evidence (if any) as 'personal'
  // rather than stranding it, and never invent profile ids.
  function ensure(storage) {
    let index = readIndex(storage);
    if(index)return index;
    index = { current: DEFAULT_ID, order: [DEFAULT_ID], names: { [DEFAULT_ID]: 'Personal' } };
    writeIndex(storage, index);
    return index;
  }

  function list(storage) {
    const index = ensure(storage);
    return index.order.map(id => ({ id, name: index.names[id], current: id === index.current }));
  }

  function currentId(storage) {
    return ensure(storage).current;
  }

  function switchTo(storage, id) {
    const index = ensure(storage);
    if(!index.order.includes(id))throw new Error('Unknown profile.');
    index.current = id;
    writeIndex(storage, index);
    return index;
  }

  function slug(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'learner';
  }

  function create(storage, name) {
    const index = ensure(storage);
    const label = typeof name === 'string' ? name.trim() : '';
    if(!label)throw new Error('Give the profile a name.');
    if(index.order.length >= MAX_PROFILES)throw new Error('Too many profiles on this browser.');
    let base = slug(label), id = base, n = 2;
    while(index.order.includes(id))id = base + '-' + (n++);
    index.order.push(id);
    index.names[id] = label.slice(0, 80);
    index.current = id;
    writeIndex(storage, index);
    return id;
  }

  function rename(storage, id, name) {
    const index = ensure(storage);
    if(!index.order.includes(id))throw new Error('Unknown profile.');
    const label = typeof name === 'string' ? name.trim() : '';
    if(!label)throw new Error('Give the profile a name.');
    index.names[id] = label.slice(0, 80);
    writeIndex(storage, index);
    return index;
  }

  // Remove removes exactly one slot: the profile's evidence key and its index
  // entry. The current profile cannot be removed; switch first. Removing the
  // last remaining profile is refused so the browser always has somewhere
  // to record evidence.
  function remove(storage, id) {
    const index = ensure(storage);
    if(!index.order.includes(id))throw new Error('Unknown profile.');
    if(id === index.current)throw new Error('Switch to another profile before removing this one.');
    if(index.order.length <= 1)throw new Error('Keep at least one profile.');
    try { storage.removeItem(evidenceKey(id)); } catch {}
    index.order = index.order.filter(x => x !== id);
    delete index.names[id];
    writeIndex(storage, index);
    return index;
  }

  return { INDEX_KEY, EVIDENCE_PREFIX, DEFAULT_ID, MAX_PROFILES, evidenceKey, ensure, list, currentId, switchTo, create, rename, remove };
});
