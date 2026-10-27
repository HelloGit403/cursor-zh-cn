'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('../src/patcher');
const M = require('../src/manager');
const dict = { 'New Chat': '新建对话', 'Link copied': '链接已复制', Share: '分享' };

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const appRoot = path.join(dir, 'app');
  const bundle = path.join(appRoot, 'out/vs/workbench/workbench.desktop.main.js');
  P.ensureDir(path.dirname(bundle));
  fs.writeFileSync(bundle, 'const state="New Chat";const ui={label:"New Chat",children:["Link copied"]};');
  fs.writeFileSync(path.join(appRoot, 'out/nls.messages.json'), JSON.stringify(['New Chat', 'Untouched']));
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ version: '3.24.18', distro: 'test' }));
  fs.writeFileSync(path.join(appRoot, 'product.json'), JSON.stringify({ nameShort: 'Cursor', commit: 'test-build',
    checksums: { 'vs/workbench/workbench.desktop.main.js': P.checksumOf(fs.readFileSync(bundle)) } }));
  const options = { appRoot, storageRoot: path.join(dir, 'storage') };
  const files = [bundle, path.join(appRoot, 'out/nls.messages.json'), path.join(appRoot, 'product.json')];
  const originals = files.map(f => fs.readFileSync(f));
  return { ...options, dir, bundle, options, files, originals };
}

test('only presentation values change; logic, keys, strings in regex/comments/templates stay intact', () => {
  const source = [
    'const state="New Chat";',
    'if(state==="New Chat"){}',
    'switch(state){case "New Chat":break;}',
    'const keys={"New Chat":1};keys["New Chat"];',
    'const re=/label:"New Chat"/;',
    '// label:"New Chat"',
    'const template=`label:"New Chat" ${1}`;',
    'const ui={label:"New Chat",title:{value:"New Chat",original:"New Chat"},children:["Link copied"]};'
  ].join('\n');
  const result = P.patchBundleSource(source, dict);
  assert.equal(result.used.get('New Chat'), 2);
  assert.equal(result.used.get('Link copied'), 1);
  assert.ok(result.source.includes('state==="New Chat"'));
  assert.ok(result.source.includes('/label:"New Chat"/'));
  assert.ok(result.source.includes('`label:"New Chat" ${1}`'));
  assert.ok(result.source.includes('original:"New Chat"'));
  assert.ok(P.validateJs(result.source).ok);
});

test('quote escaping, template expressions, and conditional/logic values', () => {
  const source = 'const x={label:\'New Chat\',children:["New Chat"===x,"New Chat"],title:flag?"New Chat":"Share"};';
  const result = P.patchBundleSource(source, { 'New Chat': '中文"引号\\换行\n', Share: '分享' });
  assert.equal(result.used.get('New Chat'), 2);
  assert.ok(result.source.includes('"New Chat"===x'));
  assert.ok(result.source.includes('flag?"New Chat":"Share"'));
  assert.ok(P.validateJs(result.source).ok);
  const nested = P.patchBundleSource('const s=`${f({label:"New Chat"})}`;const ui={label:"New Chat"};', dict);
  assert.equal(nested.used.get('New Chat'), 2);
});

test('NLS preserves indexes, own keys and unrecognized messages', () => {
  const result = P.patchNlsSource('["New Chat","Untouched","toString"]', dict);
  assert.deepEqual(JSON.parse(result.source), ['新建对话', 'Untouched', 'toString']);
  assert.throws(() => P.patchNlsSource('{}', dict), /格式/);
});

test('preview does not modify install files; apply/reapply/restore preserve bytes', t => {
  const f = fixture(t);
  const preview = M.execute({ ...f.options, action: 'preview' });
  assert.ok(preview.replacements >= 2);
  f.files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), f.originals[i]));
  assert.equal(fs.existsSync(M.identity(f.appRoot, f.storageRoot).manifestFile), false);
  assert.ok(M.execute({ ...f.options, action: 'apply' }).changed);
  assert.ok(fs.readFileSync(f.bundle, 'utf8').includes('新建对话'));
  const product = P.readJson(f.files[2]);
  assert.equal(product.checksums['vs/workbench/workbench.desktop.main.js'], P.checksumOf(fs.readFileSync(f.bundle)));
  assert.equal(M.execute({ ...f.options, action: 'status' }).applied, true);
  assert.equal(M.execute({ ...f.options, action: 'apply' }).changed, false);
  M.execute({ ...f.options, action: 'restore' });
  f.files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), f.originals[i]));
  assert.equal(M.execute({ ...f.options, action: 'status' }).applied, false);
});

test('changing custom translations rebuilds from originals and can still restore', t => {
  const f = fixture(t);
  const customFile = path.join(f.dir, 'custom.json');
  M.execute({ ...f.options, action: 'apply' });
  fs.writeFileSync(customFile, JSON.stringify({ 'New Chat': '自定义对话' }));
  M.execute({ ...f.options, customFile, action: 'apply' });
  assert.ok(fs.readFileSync(f.bundle, 'utf8').includes('自定义对话'));
  M.execute({ ...f.options, action: 'restore' });
  f.files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), f.originals[i]));
});

test('updated builds cannot restore backups from an earlier version', t => {
  const f = fixture(t);
  M.execute({ ...f.options, action: 'apply' });
  fs.writeFileSync(path.join(f.appRoot, 'package.json'), '{"version":"4.0.0"}');
  f.files.forEach((file, i) => fs.writeFileSync(file, f.originals[i]));
  assert.equal(M.execute({ ...f.options, action: 'restore' }).changed, false);
  M.execute({ ...f.options, action: 'apply' });
  M.execute({ ...f.options, action: 'restore' });
  f.files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), f.originals[i]));
});

test('external edits block restore and apply before writing anything', t => {
  const f = fixture(t);
  M.execute({ ...f.options, action: 'apply' });
  fs.appendFileSync(f.bundle, '\n// external edit');
  const before = f.files.map(file => fs.readFileSync(file));
  for (const action of ['apply', 'restore']) assert.throws(() => M.execute({ ...f.options, action }), /其他工具修改/);
  f.files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i]));
});

test('validation failure in a later file cannot leave earlier files modified', t => {
  const f = fixture(t);
  fs.writeFileSync(f.bundle, 'const ui={label:"New Chat"};const broken=;');
  const before = f.files.map(file => fs.readFileSync(file));
  assert.throws(() => M.execute({ ...f.options, action: 'apply' }), /语法校验失败/);
  f.files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i]));
});

test('write failure rolls back already written files, leaving a usable recovery journal', t => {
  const f = fixture(t);
  const rename = fs.renameSync;
  let failed = false;
  fs.renameSync = (from, to) => {
    if (!failed && to === f.bundle) { failed = true; throw new Error('simulated permission failure'); }
    return rename(from, to);
  };
  try { assert.throws(() => M.execute({ ...f.options, action: 'apply' }), /已自动回滚/); }
  finally { fs.renameSync = rename; }
  assert.equal(failed, true);
  f.files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), f.originals[i]));
  M.execute({ ...f.options, action: 'restore' });
});

test('concurrent instances are blocked by the install lock', t => {
  const f = fixture(t);
  const info = M.identity(f.appRoot, f.storageRoot);
  P.ensureDir(path.dirname(info.dir));
  fs.writeFileSync(path.join(path.dirname(info.dir), 'operation.lock'), String(process.pid));
  assert.throws(() => M.execute({ ...f.options, action: 'apply' }), /另一个/);
});

test('switching off hardcoded translation restores that part only', t => {
  const f = fixture(t);
  M.execute({ ...f.options, action: 'apply' });
  M.execute({ ...f.options, action: 'apply', includeHardcoded: false });
  assert.deepEqual(fs.readFileSync(f.bundle), f.originals[0]);
  assert.equal(P.readJson(f.files[1])[0], '新建对话');
  M.execute({ ...f.options, action: 'restore' });
  f.files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), f.originals[i]));
});

test('backup integrity, path containment and dictionary placeholders are checked', t => {
  const f = fixture(t);
  assert.throws(() => M.targetPath(f.appRoot, '../escape'), /路径无效/);
  const customFile = path.join(f.dir, 'custom.json');
  fs.writeFileSync(customFile, '{"Open {0}":"打开"}');
  assert.throws(() => P.loadDictionary(customFile), /占位符/);
  M.execute({ ...f.options, action: 'apply' });
  const info = M.identity(f.appRoot, f.storageRoot);
  const manifest = P.readJson(info.manifestFile);
  fs.appendFileSync(path.join(info.dir, 'originals', manifest.files[0].rel), 'bad');
  assert.throws(() => M.execute({ ...f.options, action: 'restore' }), /备份缺失或已损坏/);
});

test('worker executes in a separate Node process and reports structured output', t => {
  const f = fixture(t);
  const stdout = execFileSync(process.execPath, [path.join(__dirname, '../src/worker.js'),
    JSON.stringify({ ...f.options, action: 'preview' })], { encoding: 'utf8', windowsHide: true });
  const response = JSON.parse(stdout);
  assert.equal(response.ok, true);
  assert.ok(response.result.replacements > 0);
});

test('chat anchors require an exact source hash and preserve surrounding logic', () => {
  const source = 'const UI_LABEL="New Chat";if(kind==="New Chat"){}';
  const profile = { sha256: P.hashOf(source), patches: [
    { english: 'New Chat', before: 'const UI_LABEL=', after: ';if(kind' }
  ] };
  const translated = P.patchChatSource(source, dict, profile);
  assert.equal(translated.source, 'const UI_LABEL="新建对话";if(kind==="New Chat"){}');
  assert.equal(translated.supported, true);
  const otherBuild = P.patchChatSource(source + ';', dict, profile);
  assert.equal(otherBuild.supported, false);
  assert.equal(otherBuild.source, source + ';');
});

test('chat mode translates glass and NLS while leaving the IDE bundle unchanged', t => {
  const f = fixture(t);
  const glass = path.join(path.dirname(f.bundle), 'workbench.glass.main.js');
  const originalGlass = 'const ui={label:"New Chat",children:"Repositories"};';
  fs.writeFileSync(glass, originalGlass);
  const result = M.execute({ ...f.options, action: 'apply', surface: 'chat' });
  assert.ok(result.files.some(file => file.file.endsWith('workbench.glass.main.js')));
  assert.ok(fs.readFileSync(glass, 'utf8').includes('代码仓库'));
  assert.deepEqual(fs.readFileSync(f.bundle), f.originals[0]);
  M.execute({ ...f.options, action: 'restore', surface: 'chat' });
  assert.equal(fs.readFileSync(glass, 'utf8'), originalGlass);
});
