import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadClient() {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  let definition;
  const sandbox = {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
    document: { cookie: '' },
  };
  const localStore = new Map();
  sandbox.localStorage = {
    getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
    setItem: (key, value) => localStore.set(key, String(value)),
    removeItem: (key) => localStore.delete(key),
  };
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  assert.ok(definition, 'client module registers itself');
  const react = {
    createElement: () => null,
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
  };
  const exported = definition.factory((id) => {
    assert.equal(id, 'react', 'client requires only React');
    return react;
  });
  return { definition, exported, sandbox };
}

const { definition, exported } = loadClient();
const core = exported.__test;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('module identity and injects', () => {
  assert.equal(definition.id, '@qrak/dsh-mode-switcher');
  assert.deepEqual(plain(exported.inject), ['slots', 'remote', 'remote.commands', 'remote.session', 'locale']);
});

test('normalizeModel validates and trims', () => {
  assert.equal(core.normalizeModel(null), null);
  assert.equal(core.normalizeModel('x'), null);
  assert.equal(core.normalizeModel({ provider: 'p' }), null);
  assert.equal(core.normalizeModel({ provider: ' ', model: 'm' }), null);
  assert.deepEqual(
    plain(core.normalizeModel({ provider: ' p ', model: ' m ', reasoningEffort: ' max ', extra: true })),
    { provider: 'p', model: 'm', reasoningEffort: 'max' },
  );
  assert.deepEqual(plain(core.normalizeModel({ provider: 'p', model: 'm', reasoningEffort: '' })), { provider: 'p', model: 'm' });
  assert.deepEqual(plain(core.normalizeModel({ provider: 'p', model: 'm', reasoningEffort: 5 })), { provider: 'p', model: 'm' });
});

test('sameModel compares provider, model and default effort', () => {
  assert.equal(core.sameModel({ provider: 'p', model: 'm' }, { provider: 'p', model: 'm', reasoningEffort: '' }), true);
  assert.equal(core.sameModel({ provider: 'p', model: 'm' }, { provider: 'p', model: 'm', reasoningEffort: 'high' }), false);
  assert.equal(core.sameModel({ provider: 'p', model: 'm' }, { provider: 'q', model: 'm' }), false);
  assert.equal(core.sameModel(null, { provider: 'p', model: 'm' }), false);
});

test('parsePresets tolerates missing, corrupt and unknown data', () => {
  const empty = { plan: null, build: null };
  assert.deepEqual(plain(core.parsePresets('')), empty);
  assert.deepEqual(plain(core.parsePresets('not json')), empty);
  assert.deepEqual(plain(core.parsePresets('[]')), empty);
  assert.deepEqual(plain(core.parsePresets(JSON.stringify({ v: 2, plan: { provider: 'p', model: 'm' } }))), empty);
  assert.deepEqual(plain(core.parsePresets(JSON.stringify({ v: 1, plan: null, build: null }))), empty);
  assert.deepEqual(
    plain(core.parsePresets(JSON.stringify({ v: 1, plan: { provider: 'p', model: 'plan', reasoningEffort: 'max' } }))),
    { plan: { provider: 'p', model: 'plan', reasoningEffort: 'max' }, build: null },
  );
});

test('serializePresets round-trips through parsePresets', () => {
  const presets = {
    plan: { provider: 'p', model: 'plan', reasoningEffort: 'max' },
    build: { provider: 'p', model: 'build' },
  };
  const raw = core.serializePresets(presets);
  assert.deepEqual(plain(core.parsePresets(raw)), presets);
  assert.deepEqual(plain(core.parsePresets(core.serializePresets({ plan: null, build: null }))), { plan: null, build: null });
});

test('cookieString sets host-wide persistence attributes', () => {
  const raw = core.cookieString('k', '{"v":1}');
  assert.match(raw, /^k=/);
  assert.match(raw, /%7B%22v%22%3A1%7D/);
  assert.match(raw, /path=\//);
  assert.match(raw, /max-age=34560000/);
  assert.match(raw, /SameSite=Lax/);
});

test('readCookie decodes the matching name and rejects malformed values', () => {
  assert.equal(core.readCookie('k', 'a=1; k=%7B%22v%22%3A1%7D; b=2'), '{"v":1}');
  assert.equal(core.readCookie('k', 'a=1'), null);
  assert.equal(core.readCookie('k', 'k=%'), null);
  assert.equal(core.readCookie('k', 'k=first; k=second'), 'first');
});

test('toggleTabAllowed only accepts plain, non-composing Tab', () => {
  const base = { key: 'Tab' };
  assert.equal(core.toggleTabAllowed(base, false), true);
  assert.equal(core.toggleTabAllowed({ ...base, shiftKey: true }, false), false);
  assert.equal(core.toggleTabAllowed({ ...base, ctrlKey: true }, false), false);
  assert.equal(core.toggleTabAllowed({ ...base, altKey: true }, false), false);
  assert.equal(core.toggleTabAllowed({ ...base, metaKey: true }, false), false);
  assert.equal(core.toggleTabAllowed({ ...base, repeat: true }, false), false);
  assert.equal(core.toggleTabAllowed({ ...base, isComposing: true }, false), false);
  assert.equal(core.toggleTabAllowed(base, true), false);
  assert.equal(core.toggleTabAllowed({ key: 'Enter' }, false), false);
  assert.equal(core.toggleTabAllowed(null, false), false);
});

const model = (name, effort) => ({ provider: 'p', model: name, ...(effort ? { reasoningEffort: effort } : {}) });

test('decide seeds, restores, saves and ignores observations while switching', () => {
  const build = model('build', 'high');
  const plan = model('plan', 'max');

  const first = core.decide({ mode: null, model: null }, { mode: false, model: build, switching: false });
  assert.equal(first.action, 'restore');
  assert.deepEqual(plain(first.state), { mode: false, model: build });

  const stable = core.decide(first.state, { mode: false, model: build, switching: false });
  assert.equal(stable.action, 'none');

  const manual = core.decide(stable.state, { mode: false, model: model('build', 'max'), switching: false });
  assert.equal(manual.action, 'save');

  const external = core.decide(manual.state, { mode: true, model: plan, switching: false });
  assert.equal(external.action, 'restore');
  assert.deepEqual(plain(external.state), { mode: true, model: plan });

  const inFlight = core.decide(external.state, { mode: false, model: plan, switching: true });
  assert.equal(inFlight.action, 'none');
  assert.deepEqual(plain(inFlight.state), { mode: false, model: plan });

  const missingModel = core.decide({ mode: true, model: null }, { mode: true, model: null, switching: false });
  assert.equal(missingModel.action, 'none');

  const lateModel = core.decide({ mode: true, model: null }, { mode: true, model: plan, switching: false });
  assert.equal(lateModel.action, 'restore');
});

test('presets persist through the cookie and the localStorage fallback', () => {
  const presets = {
    plan: model('plan', 'max'),
    build: model('build', 'high'),
  };
  core.savePresets(presets);
  assert.deepEqual(plain(core.getPresets()), presets);
  assert.equal(core.storageStatus(), 'cookie');
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.ok(source.includes('document.cookie'));
  assert.ok(source.includes('localStorage.setItem'));
});

// Mirrors the DOM the plugin lives in: one composer card per session, input and chip as siblings.
function fakeComposer(label) {
  const chip = { tag: `chip-${label}`, disabled: false, clicks: 0, click() { chip.clicks += 1; } };
  const card = {
    tag: `card-${label}`,
    parentElement: null,
    hasAttribute: (name) => name === 'data-composer-card',
    querySelector: (selector) => (selector === 'button[data-mode-switcher]' ? chip : null),
  };
  const input = {
    tag: `input-${label}`,
    parentElement: card,
    hasAttribute: () => false,
    querySelector: () => null,
  };
  return { card, chip, input };
}

test('chipFor returns the chip of the composer holding the caret', () => {
  const a = fakeComposer('a');
  const b = fakeComposer('b');
  assert.equal(core.chipFor(a.input), a.chip);
  assert.equal(core.chipFor(b.input), b.chip);
  assert.equal(core.chipFor(a.card), a.chip);
});

test('chipFor returns null outside a composer card', () => {
  const orphan = { parentElement: null, hasAttribute: () => false, querySelector: () => null };
  assert.equal(core.chipFor(orphan), null);
  assert.equal(core.chipFor(null), null);
  assert.equal(core.chipFor(undefined), null);
});

test('toggleMode ignores a repeat press inside the guard window', async () => {
  core.savePresets({ plan: null, build: null });
  const calls = [];
  const ctx = {
    remote: {
      commands: { execute: async (sessionId, command) => { calls.push(`${sessionId}:${command}`); return { ok: true, value: {} }; } },
      session: { selectModel: async () => {} },
    },
  };
  const build = model('build', 'high');

  const first = await core.toggleMode(ctx, 'session-a', false, build);
  assert.equal(first.ok, true);
  assert.deepEqual(calls, ['session-a:/plan']);

  const repeat = await core.toggleMode(ctx, 'session-a', false, build);
  assert.equal(repeat.ok, false);
  assert.equal(repeat.silent, true);
  assert.deepEqual(calls, ['session-a:/plan'], 'second press inside the window must not reach the host');

  const other = await core.toggleMode(ctx, 'session-b', false, build);
  assert.equal(other.ok, true);
  assert.deepEqual(calls, ['session-a:/plan', 'session-b:/plan'], 'another session is not throttled');

  await new Promise((resolve) => setTimeout(resolve, core.REPEAT_GUARD_MS + 50));
  const later = await core.toggleMode(ctx, 'session-a', true, build);
  assert.equal(later.ok, true);
  assert.deepEqual(calls.at(-1), 'session-a:/plan off');
});
