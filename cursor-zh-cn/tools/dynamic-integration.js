'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { JSDOM } = require('jsdom');
const D = require('../src/dynamic-installer');
const P = require('../src/patcher');
const L = require('../src/manager');
const S = require('../src/dynamic-service');
const { createDynamicTranslator } = require('../src/dynamic-runtime');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const source = P.resolveAppRoot(process.argv[2]);
  const service = await S.ensureService();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-dynamic-integration-'));
  const appRoot = path.join(temp, 'app');
  let dom;
  try {
    const legacyInfo = L.identity(source);
    const legacyState = fs.existsSync(legacyInfo.manifestFile) ? P.readJson(legacyInfo.manifestFile) : null;
    const dynamicInfo = D.location(source);
    const dynamicState = fs.existsSync(dynamicInfo.manifestFile) ? P.readJson(dynamicInfo.manifestFile) : null;
    const originals = [];
    const liveHashes = [];
    for (const rel of ['out/main.js', 'out/vs/workbench/workbench.glass.main.js', 'out/nls.messages.json', 'out/nls.keys.json', 'package.json', 'product.json']) {
      const live = path.join(source, rel);
      if (!fs.existsSync(live)) continue;
      liveHashes.push([live, P.hashOf(fs.readFileSync(live))]);
      const oldRecord = legacyState?.status !== 'restored' && legacyState?.files.find(file => file.rel.split(path.sep).join('/') === rel);
      const dynamicRecord = dynamicState?.status !== 'uninstalled' && dynamicState?.files.find(file => file.rel === rel);
      const data = fs.readFileSync(dynamicRecord ? path.join(dynamicInfo.directory, 'originals', rel) : oldRecord ? path.join(legacyInfo.dir, 'originals', rel) : live);
      if (oldRecord) assert.equal(P.hashOf(data), oldRecord.originalHash);
      const target = path.join(appRoot, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data);
      originals.push([target, P.hashOf(data)]);
    }
    const options = { appRoot, storageRoot: path.join(temp, 'state'), legacyStorageRoot: path.join(temp, 'legacy'), service };
    const installed = await D.execute({ ...options, action: 'install' });
    assert.ok(installed.installed);
    await D.execute({ ...options, action: 'install' });
    dom = new JSDOM('<!doctype html><body><nav><button>New Chat</button></nav><div data-message-role="human">You can now translate English replies into Chinese.</div><div data-message-role="ai" data-message-kind="assistant"><p>You can now translate English replies into Chinese.</p><pre><code>console.log("Hello");</code></pre></div></body>', { url: 'https://fixture.local' });
    // jsdom's AbortSignal is from a different realm than Node's native fetch.
    dom.window.fetch = (url, { signal, ...args }) => fetch(url, args);
    const plugin = createDynamicTranslator(dom.window, { dictionary: P.loadDictionary(), endpoint: service.endpoint, token: service.token, replyDelay: 5 });
    plugin.start();
    for (let i = 0; i < 80 && !/[\u3400-\u9fff]/.test(dom.window.document.querySelector('p').textContent); i++) await wait(100);
    assert.match(dom.window.document.querySelector('p').textContent, /[\u3400-\u9fff]/);
    const realTranslation = dom.window.document.querySelector('p').textContent;
    assert.equal(dom.window.document.querySelector('button').textContent, '新建对话');
    assert.equal(dom.window.document.querySelector('code').textContent, 'console.log("Hello");');
    assert.equal(dom.window.document.querySelector('[data-message-role="human"]').textContent, 'You can now translate English replies into Chinese.');
    plugin.setEnabled(false);
    assert.equal(dom.window.document.querySelector('p').textContent, 'You can now translate English replies into Chinese.');
    const unauthorized = await fetch(service.endpoint + '/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"texts":["Hello"]}' });
    assert.equal(unauthorized.status, 403);
    const crossOrigin = await fetch(service.endpoint + '/health', { headers: { Authorization: 'Bearer ' + service.token, Origin: 'https://example.com' } });
    assert.equal(crossOrigin.status, 403);
    plugin.dispose(); dom.window.close(); dom = null;
    await D.execute({ ...options, action: 'uninstall' });
    for (const [file, hash] of originals) assert.equal(P.hashOf(fs.readFileSync(file)), hash);
    for (const [file, hash] of liveHashes) assert.equal(P.hashOf(fs.readFileSync(file)), hash);
    const report = { passed: true, cursorVersion: installed.version, dictionaryEntries: installed.dictionaryEntries,
      realTranslation, tests: ['real Cursor files install/reinstall/uninstall on copy', 'byte-for-byte restoration',
        'live installation unchanged by this test', 'new AI prose translated by local CTranslate2 model', 'code and user input preserved',
        'English toggle restores original AI prose', 'unauthorized and foreign-origin requests rejected'] };
    fs.writeFileSync(path.join(__dirname, '../../动态翻译测试报告.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { dom?.window.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(err => { console.error(err); process.exitCode = 1; });
