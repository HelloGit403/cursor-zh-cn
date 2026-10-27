'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const P = require('./patcher');

function identity(appRoot, storageRoot) {
  const product = P.readJson(path.join(appRoot, 'product.json'));
  const pkg = P.readJson(path.join(appRoot, 'package.json'));
  const { checksums, ...metadata } = product;
  const build = P.hashOf(JSON.stringify({ metadata, version: pkg.version, distro: pkg.distro })).slice(0, 24);
  const rootKey = P.hashOf(process.platform === 'win32' ? appRoot.toLowerCase() : appRoot).slice(0, 24);
  const dir = path.join(storageRoot || path.join(os.homedir(), '.cursor-zh-cn', 'v2'), rootKey, build);
  return { dir, version: pkg.version, build, rootKey, manifestFile: path.join(dir, 'manifest.json') };
}

function targetPath(appRoot, relative) {
  const full = path.resolve(appRoot, relative);
  const rel = path.relative(appRoot, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('备份记录路径无效：' + relative);
  return full;
}

function atomicWrite(file, data) {
  const temp = file + '.cursor-zh-' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temp, data, { mode: fs.existsSync(file) ? fs.statSync(file).mode : 0o600 });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function acquireLock(info) {
  P.ensureDir(path.dirname(info.dir));
  const lock = path.join(path.dirname(info.dir), 'operation.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    try { process.kill(pid, 0); throw new Error('另一个 Cursor 窗口正在汉化，请等待完成。'); }
    catch (err) {
      if (err.code === 'ESRCH') fs.unlinkSync(lock);
      else throw err;
    }
  }
  const fd = fs.openSync(lock, 'wx');
  fs.writeFileSync(fd, String(process.pid));
  fs.closeSync(fd);
  return () => fs.unlinkSync(lock);
}

function readManifest(info) {
  if (!fs.existsSync(info.manifestFile)) return null;
  const manifest = P.readJson(info.manifestFile);
  if (manifest.build !== info.build || !Array.isArray(manifest.files)) throw new Error('备份记录无效。');
  return manifest;
}

function verifyRecords(appRoot, info, manifest) {
  for (const record of manifest.files) {
    const file = targetPath(appRoot, record.rel);
    const backup = targetPath(path.join(info.dir, 'originals'), record.rel);
    if (!fs.existsSync(backup) || P.hashOf(fs.readFileSync(backup)) !== record.originalHash) {
      throw new Error('原始备份缺失或已损坏：' + record.rel);
    }
    if (!fs.existsSync(file)) throw new Error('目标文件缺失，请修复或重新安装 Cursor：' + record.rel);
    const actual = P.hashOf(fs.readFileSync(file));
    if (actual !== record.appliedHash && actual !== record.originalHash && actual !== record.previousHash) {
      throw new Error('文件已被更新或其他工具修改，已停止操作，避免覆盖：' + record.rel + '。请修复或重新安装当前版本的 Cursor 后再应用汉化。');
    }
  }
}

function commitChanges(changes) {
  const attempted = [];
  try {
    for (const change of changes) {
      if (!fs.readFileSync(change.file).equals(change.before)) {
        throw new Error('规划期间文件发生变化，已停止操作：' + change.file);
      }
    }
    for (const change of changes) {
      if (change.before.equals(change.after)) continue;
      attempted.push(change);
      atomicWrite(change.file, change.after);
    }
  } catch (err) {
    const failures = [];
    for (const change of attempted.reverse()) {
      try { atomicWrite(change.file, change.before); }
      catch { failures.push(change.file); }
    }
    throw new Error(err.message + (failures.length ? '\n自动回滚未完成，请运行还原：' + failures.join(', ') : '\n本次写入已自动回滚。'));
  }
}

function execute(options) {
  const { action = 'preview', storageRoot } = options;
  if (!['preview', 'apply', 'restore', 'status'].includes(action)) throw new Error('未知操作：' + action);
  const appRoot = P.resolveAppRoot(options.appRoot);
  if (!appRoot) throw new Error('未找到有效的 Cursor 安装目录。可在设置 cursorZh.appRoot 中指定 resources/app 目录。');
  if (action === 'apply') {
    const glass = path.join(appRoot, 'out/vs/workbench/workbench.glass.main.js');
    if (fs.existsSync(glass) && fs.readFileSync(glass, 'utf8').includes('cursor-dynamic-zh:2:start')) {
      throw new Error('已启用动态翻译，请使用聊天窗口右下角的开关；无需再应用旧静态汉化。');
    }
  }
  const info = identity(appRoot, storageRoot);
  // A lock also protects previews against another window writing mid-read.
  const release = acquireLock(info);
  try {
    const manifest = readManifest(info);
    const active = manifest && manifest.status !== 'restored';
    const baseReport = { appRoot, version: info.version, backupDirectory: info.dir };
    if (action === 'status') {
      if (!active) return { ...baseReport, message: '当前版本未应用汉化', applied: false };
      try {
        verifyRecords(appRoot, info, manifest);
        const allApplied = manifest.files.every(r => P.hashOf(fs.readFileSync(targetPath(appRoot, r.rel))) === r.appliedHash);
        return { ...baseReport, applied: allApplied, replacements: manifest.replacements,
          message: manifest.status === 'applied' && allApplied ? '已应用汉化，文件校验一致' : '上次操作未完成，可运行应用或还原以恢复' };
      } catch (err) { return { ...baseReport, applied: false, message: err.message }; }
    }
    if (active) verifyRecords(appRoot, info, manifest);
    if (action === 'restore') {
      if (!active) return { ...baseReport, changed: false, message: '当前版本没有需要还原的汉化备份。' };
      const changes = manifest.files.map(r => ({ file: targetPath(appRoot, r.rel),
        before: fs.readFileSync(targetPath(appRoot, r.rel)),
        after: fs.readFileSync(targetPath(path.join(info.dir, 'originals'), r.rel)) }));
      commitChanges(changes);
      atomicWrite(info.manifestFile, JSON.stringify({ ...manifest, status: 'restored', restoredAt: new Date().toISOString() }, null, 2));
      return { ...baseReport, changed: changes.some(c => !c.before.equals(c.after)), restored: changes.length };
    }

    const dict = P.loadDictionary(options.customFile);
    const original = file => {
      const rel = path.relative(appRoot, file);
      return active && manifest.files.some(r => r.rel === rel)
        ? fs.readFileSync(targetPath(path.join(info.dir, 'originals'), rel)) : fs.readFileSync(file);
    };
    const changes = [];
    const files = [];
    const matched = new Set();
    let replacements = 0;
    const profile = P.readJson(path.join(__dirname, '../dictionary/chat-profile.json'));
    const warnings = [];
    const targets = P.listTargets(appRoot, options.includeHardcoded !== false).filter(file =>
      options.surface !== 'chat' || path.basename(file) === 'nls.messages.json' || path.basename(file) === 'workbench.glass.main.js');
    if (!targets.length) throw new Error('此版本未找到支持的界面资源文件。');
    for (const file of targets) {
      const before = fs.readFileSync(file);
      let source = original(file).toString('utf8');
      const isNls = path.basename(file) === 'nls.messages.json';
      let contextual;
      if (path.basename(file) === profile.file) {
        contextual = P.patchChatSource(source, dict, profile);
        source = contextual.source;
        if (!contextual.supported) warnings.push('当前聊天窗口脚本与专用配置不同，已跳过版本专用翻译，仅应用通用词典。');
      }
      const patched = isNls ? P.patchNlsSource(source, dict) : P.patchBundleSource(source, dict);
      if (contextual) contextual.used.forEach((count, key) => patched.used.set(key, (patched.used.get(key) || 0) + count));
      const count = [...patched.used.values()].reduce((sum, n) => sum + n, 0);
      if (!isNls && count) {
        const validation = P.validateJs(patched.source);
        if (!validation.ok) throw new Error('翻译后语法校验失败，未修改安装文件：' + file + '\n' + validation.error);
      }
      patched.used.forEach((_, key) => matched.add(key));
      replacements += count;
      if (count) files.push({ file: path.relative(appRoot, file), replacements: count, syntaxChecked: !isNls });
      const after = Buffer.from(patched.source);
      if (!before.equals(after)) changes.push({ file, before, after });
    }
    // A setting can remove a previously selected target; restore it to the original.
    if (active) {
      for (const record of manifest.files) {
        const file = targetPath(appRoot, record.rel);
        if (record.rel === 'product.json' || targets.includes(file)) continue;
        const before = fs.readFileSync(file);
        const after = original(file);
        if (!before.equals(after)) changes.push({ file, before, after });
      }
    }
    const report = { ...baseReport, replacements, files, dictionaryEntries: Object.keys(dict).length,
      matchedEntries: matched.size, changed: changes.length > 0, dryRun: action === 'preview', warnings };
    if (action === 'preview') return report;
    if (!changes.length) return { ...report, message: active ? '当前汉化已是最新，无需重复写入。' : '词典未命中当前界面，无需修改。' };

    const productFile = path.join(appRoot, 'product.json');
    const productBefore = fs.readFileSync(productFile);
    const product = JSON.parse(productBefore);
    let checksumsChanged = false;
    for (const change of changes) {
      const key = path.relative(path.join(appRoot, 'out'), change.file).split(path.sep).join('/');
      if (product.checksums && Object.hasOwn(product.checksums, key)) {
        const checksum = P.checksumOf(change.after);
        if (product.checksums[key] !== checksum) {
          product.checksums[key] = checksum;
          checksumsChanged = true;
        }
      }
    }
    const productAfter = checksumsChanged ? Buffer.from(JSON.stringify(product, null, 2)) : productBefore;
    if (!productBefore.equals(productAfter)) changes.push({ file: productFile, before: productBefore, after: productAfter });

    // Back up ALL originals and persist a recoverable journal before the first write.
    const records = active ? manifest.files.map(r => ({ ...r })) : [];
    for (const change of changes) {
      const rel = path.relative(appRoot, change.file);
      let record = records.find(r => r.rel === rel);
      if (!record) {
        const backup = targetPath(path.join(info.dir, 'originals'), rel);
        P.ensureDir(path.dirname(backup));
        atomicWrite(backup, change.before);
        record = { rel, originalHash: P.hashOf(change.before) };
        records.push(record);
      }
      record.previousHash = P.hashOf(change.before);
      record.appliedHash = P.hashOf(change.after);
    }
    P.ensureDir(info.dir);
    const nextManifest = { build: info.build, appRoot, version: info.version, status: 'preparing',
      appliedAt: new Date().toISOString(), replacements, files: records };
    atomicWrite(info.manifestFile, JSON.stringify(nextManifest, null, 2));
    try {
      commitChanges(changes);
      atomicWrite(info.manifestFile, JSON.stringify({ ...nextManifest, status: 'applied' }, null, 2));
    } catch (err) {
      // A successful rollback can return to the previous translated state.
      const rolledBack = changes.every(c => P.hashOf(fs.readFileSync(c.file)) === P.hashOf(c.before));
      if (rolledBack && manifest) atomicWrite(info.manifestFile, JSON.stringify(manifest, null, 2));
      throw err;
    }
    return report;
  } finally { release(); }
}

module.exports = { execute, identity, atomicWrite, targetPath };
