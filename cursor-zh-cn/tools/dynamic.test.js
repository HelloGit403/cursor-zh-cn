'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM } = require('jsdom');
const { createDynamicTranslator } = require('../src/dynamic-runtime');
const D = require('../src/dynamic-installer');
const S = require('../src/dynamic-service');
const P = require('../src/patcher');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const dictionary = { 'New Chat': '新建对话', Settings: '设置', Search: '搜索' };
function setup(t, body, extra = {}) {
  const dom = new JSDOM('<!doctype html><body>' + body + '</body>', { url: 'https://fixture.local' });
  const plugin = createDynamicTranslator(dom.window, { dictionary, replyDelay: 5, ...extra });
  plugin.start();
  t.after(() => { plugin.dispose(); dom.window.close(); });
  return { win: dom.window, doc: dom.window.document, plugin };
}

test('dynamically inserted labels, updated text nodes and placeholders translate', async t => {
  const { doc, plugin } = setup(t, '<main></main><input placeholder="Search">');
  await wait(80);
  assert.equal(doc.querySelector('input').placeholder, '搜索');
  const button = doc.createElement('button'); button.textContent = 'New Chat'; doc.querySelector('main').append(button);
  await wait(80); assert.equal(button.textContent, '新建对话');
  button.firstChild.data = 'Settings';
  await wait(80); assert.equal(button.textContent, '设置');
  button.title = 'Search';
  await wait(80); assert.equal(button.title, '搜索');
  const count = plugin.state.translatedCount;
  await wait(100); assert.equal(plugin.state.translatedCount, count, 'own changes must settle');
});

test('English toggle restores originals without overwriting newer application text', async t => {
  const { doc, plugin } = setup(t, '<button>New Chat</button><label>Settings</label>');
  await wait(80);
  doc.querySelector('label').firstChild.data = 'Latest text';
  plugin.setEnabled(false);
  assert.equal(doc.querySelector('button').textContent, 'New Chat');
  assert.equal(doc.querySelector('label').textContent, 'Latest text');
  plugin.setEnabled(true); await wait(80);
  assert.equal(doc.querySelector('button').textContent, '新建对话');
});

test('user messages, code, links, file names, editor content and inputs are protected', async t => {
  const html = '<div data-message-role="human">New Chat</div><pre>New Chat</pre><code>Settings</code>' +
    '<a href="https://example.com">Search</a><div contenteditable="true">New Chat</div>' +
    '<div data-component="project-title">Search</div><textarea>New Chat</textarea>';
  const { doc } = setup(t, html);
  await wait(100);
  assert.equal(doc.querySelector('[data-message-role]').textContent, 'New Chat');
  assert.equal(doc.querySelector('pre').textContent, 'New Chat');
  assert.equal(doc.querySelector('code').textContent, 'Settings');
  assert.equal(doc.querySelector('a').textContent, 'Search');
  assert.equal(doc.querySelector('[contenteditable]').textContent, 'New Chat');
  assert.equal(doc.querySelector('[data-component]').textContent, 'Search');
  assert.equal(doc.querySelector('textarea').value, 'New Chat');
});

test('startup remount keeps plugin controls, model names and shortcut hints intact', async t => {
  const { doc } = setup(t, '<nav><div aria-roledescription="sortable">Search</div><button>Cursor Grok 4.6 Medium</button><span>Ctrl+N</span></nav><div contenteditable="true" data-placeholder="Search"></div>');
  await wait(80);
  assert.equal(doc.querySelector('[aria-roledescription]').textContent, 'Search');
  assert.equal(doc.querySelector('button').textContent, 'Cursor Grok 4.6 Medium');
  assert.equal(doc.querySelector('span').textContent, 'Ctrl+N');
  assert.equal(doc.querySelector('[contenteditable]').getAttribute('data-placeholder'), '搜索');
  const controls = doc.getElementById('cursor-dynamic-zh'); controls.remove();
  await wait(80); assert.ok(controls.isConnected);
});

test('unknown AI prose translates through the local engine; code and user prose are never submitted', async t => {
  const calls = [];
  const { win, doc, plugin } = setup(t,
    '<div data-message-role="human">Explain the code</div><div data-message-role="ai" data-message-kind="assistant"><p>Hello world</p><code>print("hello")</code></div>',
    { endpoint: 'http://127.0.0.1:1234', token: 'fixture' });
  win.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body).texts);
    return { ok: true, json: async () => ({ translations: ['你好，世界'] }) };
  };
  await wait(400);
  assert.deepEqual(calls, [['Hello world']]);
  assert.equal(doc.querySelector('p').textContent, '你好，世界');
  assert.equal(doc.querySelector('code').textContent, 'print("hello")');
  plugin.setReplies(false);
  assert.equal(doc.querySelector('p').textContent, 'Hello world');
});

test('late translation responses cannot overwrite a newer streamed paragraph or a disabled UI', async t => {
  let respond;
  const { win, doc, plugin } = setup(t,
    '<div data-message-role="ai" data-message-kind="assistant"><p>First sentence.</p></div>',
    { endpoint: 'http://127.0.0.1:1234', token: 'fixture' });
  win.fetch = async () => new Promise(resolve => { respond = () => resolve({ ok: true, json: async () => ({ translations: ['第一句。'] }) }); });
  await wait(300); assert.equal(typeof respond, 'function');
  doc.querySelector('p').firstChild.data = 'A newer sentence.';
  plugin.setEnabled(false); respond();
  await wait(80);
  assert.equal(doc.querySelector('p').textContent, 'A newer sentence.');
});

test('local dictionary changes take effect immediately and persist', async t => {
  const { doc, win, plugin } = setup(t, '<button>New Chat</button>');
  await wait(80);
  plugin.setDictionary({ 'New Chat': '动态自定义' }); await wait(80);
  assert.equal(doc.querySelector('button').textContent, '动态自定义');
  assert.equal(JSON.parse(win.localStorage.getItem('cursor.dynamicZh.v2')).custom['New Chat'], '动态自定义');
  assert.throws(() => plugin.setDictionary([]), /词典格式/);
});

function installFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-dynamic-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const appRoot = path.join(dir, 'app');
  fs.mkdirSync(path.join(appRoot, 'out/vs/workbench'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'out/vs/workbench/workbench.glass.main.js'), 'const ui={label:"New Chat"};');
  fs.writeFileSync(path.join(appRoot, 'out/main.js'), 'const app="Cursor";');
  fs.writeFileSync(path.join(appRoot, 'package.json'), '{"version":"3.24.18"}');
  const main = fs.readFileSync(path.join(appRoot, 'out/main.js'));
  fs.writeFileSync(path.join(appRoot, 'product.json'), JSON.stringify({ nameShort: 'Cursor', commit: 'fixture', checksums: { 'main.js': P.checksumOf(main) } }));
  const service = { endpoint: 'http://127.0.0.1:1234', token: 'fixture', python: 'C:/fixture/pythonw.exe', script: 'C:/fixture/server.py', config: 'C:/fixture/config.json' };
  const options = { appRoot, storageRoot: path.join(dir, 'state'), legacyStorageRoot: path.join(dir, 'legacy'), service };
  return { dir, appRoot, options };
}

test('installer adds one runtime loader, updates checksums and uninstalls byte for byte', async t => {
  const { appRoot, options } = installFixture(t);
  const paths = ['out/main.js', 'out/vs/workbench/workbench.glass.main.js', 'product.json'];
  const before = paths.map(rel => fs.readFileSync(path.join(appRoot, rel)));
  await D.execute({ ...options, action: 'install' });
  const main = fs.readFileSync(path.join(appRoot, paths[0]), 'utf8');
  assert.ok(main.includes('cursor-dynamic-zh:2:start'));
  assert.equal(P.readJson(path.join(appRoot, 'product.json')).checksums['main.js'], P.checksumOf(Buffer.from(main)));
  await D.execute({ ...options, action: 'install' });
  assert.equal(fs.readFileSync(path.join(appRoot, paths[0]), 'utf8').split('cursor-dynamic-zh:2:start').length, 2);
  await D.execute({ ...options, action: 'uninstall' });
  paths.forEach((rel, index) => assert.deepEqual(fs.readFileSync(path.join(appRoot, rel)), before[index]));
  assert.equal(fs.existsSync(path.join(appRoot, 'out/vs/workbench/cursor-dynamic-zh/runtime.js')), false);
});

test('installer refuses external changes instead of overwriting them', async t => {
  const { appRoot, options } = installFixture(t);
  await D.execute({ ...options, action: 'install' });
  fs.appendFileSync(path.join(appRoot, 'out/main.js'), '\n// external update');
  await assert.rejects(D.execute({ ...options, action: 'uninstall' }), /文件已变化/);
});

test('runtime selection skips an incomplete embedded installation and uses a ready one', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-embedded-test-'));
  const prior = process.env.APPDATA;
  t.after(() => {
    if (prior === undefined) delete process.env.APPDATA; else process.env.APPDATA = prior;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.APPDATA = dir;
  const root = S.embeddedEngineRoot();
  fs.mkdirSync(path.join(root, 'python-runtime'), { recursive: true });
  fs.writeFileSync(path.join(root, 'python-runtime/pythonw.exe'), 'fixture');
  fs.writeFileSync(path.join(root, 'embedded-engine.json'), '{"status":"preparing"}');
  assert.notEqual(S.resolveEngineRoot(), root);
  fs.writeFileSync(path.join(root, 'embedded-engine.json'), '{"status":"ready"}');
  assert.equal(S.resolveEngineRoot(), root);
  assert.equal(S.resolveEngineRoot(dir), dir);
});
