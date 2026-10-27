'use strict';

// Verify actual installed bundles on a temporary COPY; never patch the live app.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const P = require('../src/patcher');
const M = require('../src/manager');
const source = P.resolveAppRoot(process.argv[2]);
if (!source) throw new Error('请指定 Cursor resources/app 路径。');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-integration-'));
const appRoot = path.join(temp, 'app');
try {
  const sources = [path.join(source, 'product.json'), path.join(source, 'package.json'), ...P.listTargets(source)];
  const files = sources.map(file => {
    const dest = path.join(appRoot, path.relative(source, file));
    P.ensureDir(path.dirname(dest));
    fs.copyFileSync(file, dest);
    return { source: file, dest, originalHash: P.hashOf(fs.readFileSync(file)) };
  });
  const options = { appRoot, storageRoot: path.join(temp, 'storage') };
  const runtime = process.argv[3] || process.execPath;
  const run = action => {
    const response = JSON.parse(execFileSync(runtime, [path.join(__dirname, '../src/worker.js'),
      JSON.stringify({ ...options, action, surface: 'chat' })], { encoding: 'utf8', windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 120000 }));
    assert.ok(response.ok, response.error);
    return response.result;
  };
  const preview = run('preview');
  assert.ok(preview.replacements > 0);
  for (const file of files) assert.equal(P.hashOf(fs.readFileSync(file.dest)), file.originalHash);
  const applied = run('apply');
  assert.equal(applied.changed, true);
  const profile = P.readJson(path.join(__dirname, '../dictionary/chat-profile.json'));
  const sourceGlass = files.find(file => path.basename(file.source) === profile.file);
  if (sourceGlass && sourceGlass.originalHash === profile.sha256) {
    const translatedGlass = fs.readFileSync(sourceGlass.dest, 'utf8');
    for (const expected of ['Mrl="新建对话"', 'name:"自动化"', 'name:"自定义"', 'Sye="从头开始"', 'return xa?"本机"']) {
      assert.ok(translatedGlass.includes(expected), 'missing visible chat translation: ' + expected);
    }
    assert.equal(applied.warnings.length, 0);
  }
  assert.equal(run('status').applied, true);
  assert.equal(run('apply').changed, false);
  run('restore');
  for (const file of files) {
    assert.equal(P.hashOf(fs.readFileSync(file.dest)), file.originalHash, 'copy not restored: ' + file.dest);
    assert.equal(P.hashOf(fs.readFileSync(file.source)), file.originalHash, 'live installation changed: ' + file.source);
  }
  const report = { passed: true, testedVersion: preview.version, runtime,
    replacements: preview.replacements, dictionaryEntries: preview.dictionaryEntries,
    files: preview.files, checks: ['preview left all install files unchanged', 'applied in copied installation',
      'status hashes verified', 'reapply made no writes', 'restored copy byte for byte', 'live installation unchanged'] };
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(__dirname, '../../集成测试报告.json'), json + '\n');
  console.log(json);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
