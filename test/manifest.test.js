import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const client = readFileSync(join(root, 'client.js'), 'utf8');
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');

test('package identity and license', () => {
  assert.equal(packageJson.name, '@qrak/dsh-mode-switcher');
  assert.equal(packageJson.license, 'MIT');
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.private, undefined);
});

test('bundle patch and client registration use the package name', () => {
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(patch.includes("name: '@qrak/dsh-mode-switcher'"));
  assert.ok(client.includes("id: '@qrak/dsh-mode-switcher'"));
  assert.ok(client.includes("name: 'conversation.input.plan'"));
  assert.ok(client.includes("name: 'conversation.chat.commandview'"));
  assert.ok(client.includes("key: 'plan'"));
  assert.equal(packageJson.dsh.client.platform, 'web');
  assert.equal(packageJson.dsh.client.immediately, true);
  assert.ok(packageJson.dsh.client.inject.length > 0);
  for (const id of packageJson.dsh.client.inject) assert.equal(typeof id, 'string');
});

test('declared export targets exist', () => {
  for (const [key, target] of Object.entries(packageJson.exports)) {
    if (key.includes('*')) continue;
    assert.equal(existsSync(join(root, target)), true, `${key} -> ${target}`);
  }
  assert.equal(existsSync(join(root, 'locale/en.json')), true);
  assert.equal(existsSync(join(root, 'locale/pl.json')), true);
  assert.equal(existsSync(join(root, 'locale/zh.json')), true);
  assert.equal(existsSync(join(root, 'LICENSE')), true);
});

test('display metadata is present in every locale', () => {
  for (const locale of ['en', 'pl', 'zh']) {
    const meta = JSON.parse(readFileSync(join(root, 'locale', `${locale}.json`), 'utf8'));
    assert.equal(typeof meta.meta.title, 'string');
    assert.ok(meta.meta.title.length > 0);
    assert.equal(typeof meta.meta.description, 'string');
    assert.ok(meta.meta.description.length > 0);
  }
});

test('icon is an original svg', () => {
  const icon = readFileSync(join(root, 'icon.svg'), 'utf8');
  assert.match(icon, /^<svg[\s>]/);
  assert.ok(icon.length < 256 * 1024);
});
