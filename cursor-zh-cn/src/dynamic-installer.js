'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('./patcher');
const legacy = require('./manager');
const { atomicWrite } = legacy;
const S = require('./dynamic-service');
const marker = '/* cursor-dynamic-zh:2:start */';
const appFiles = ['out/vs/workbench/workbench.glass.main.js', 'out/main.js'];

function location(appRoot, storageRoot) {
  const id = legacy.identity(appRoot);
  const directory = path.join(storageRoot || path.join(os.homedir(), '.cursor-zh-cn', 'dynamic-v2'), id.rootKey, id.build);
  return { ...id, directory, manifestFile: path.join(directory, 'state.json') };
}
function buildDictionary(appRoot) {
  const dictionary = Object.create(null);
  let packEntries = 0;
  const extensionRoot = path.join(os.homedir(), '.cursor/extensions');
  try {
    const names = fs.readdirSync(extensionRoot).filter(name => name.startsWith('ms-ceintl.vscode-language-pack-zh-hans-')).sort().reverse();
    if (names.length) {
      const pack = P.readJson(path.join(extensionRoot, names[0], 'translations/main.i18n.json')).contents;
      const keys = P.readJson(path.join(appRoot, 'out/nls.keys.json'));
      const messages = P.readJson(path.join(appRoot, 'out/nls.messages.json'));
      const conflicts = new Set();
      let index = 0;
      for (const [module, entries] of keys) for (const key of entries) {
        const english = messages[index++];
        const translated = pack[module]?.[typeof key === 'string' ? key : key.key];
        if (typeof english !== 'string' || typeof translated !== 'string' || english.length > 200 || english === translated) continue;
        if (Object.hasOwn(dictionary, english) && dictionary[english] !== translated) conflicts.add(english);
        else dictionary[english] = translated;
      }
      for (const english of conflicts) delete dictionary[english];
      packEntries = Object.keys(dictionary).length;
    }
  } catch (_) { /* Installed language pack is optional; the local engine handles unknown text. */ }
  Object.assign(dictionary, P.loadDictionary());
  return { dictionary, packEntries };
}
function renderRuntime(dictionary, service) {
  return fs.readFileSync(path.join(__dirname, 'dynamic-runtime.js'), 'utf8') +
    '\nconst instance = createDynamicTranslator(window,' + JSON.stringify({ dictionary, endpoint: service.endpoint, token: service.token }) + ');\n' +
    'window.__cursorDynamicZh?.dispose?.(); window.__cursorDynamicZh=instance; instance.start();\n';
}
function loaders(service) {
  return [
    '\n' + marker + '\n;import(new URL("./cursor-dynamic-zh/runtime.js",import.meta.url).href).catch(e=>console.warn("Cursor 动态翻译加载失败",e));\n/* cursor-dynamic-zh:2:end */\n',
    '\n' + marker + '\n;import("node:child_process").then(({spawn})=>{try{const child=spawn(' +
      JSON.stringify(service.python) + ',' + JSON.stringify(['-I', service.script, '--config', service.config]) +
      ',{detached:true,windowsHide:true,stdio:"ignore"});child.on("error",()=>{});child.unref()}catch(_){}});\n/* cursor-dynamic-zh:2:end */\n'
  ];
}
function readState(info) { return fs.existsSync(info.manifestFile) ? P.readJson(info.manifestFile) : null; }
function validateState(appRoot, info, state) {
  for (const file of state.files) {
    const target = legacy.targetPath(appRoot, file.rel);
    const backup = legacy.targetPath(path.join(info.directory, 'originals'), file.rel);
    if (!fs.existsSync(backup) || P.hashOf(fs.readFileSync(backup)) !== file.originalHash) throw new Error('动态插件原始备份缺失或损坏：' + file.rel);
    if (!fs.existsSync(target) || ![file.originalHash, file.installedHash].includes(P.hashOf(fs.readFileSync(target)))) throw new Error('Cursor 文件已变化，请先修复安装后重新启用动态插件：' + file.rel);
  }
  if (fs.existsSync(state.runtimeFile) && P.hashOf(fs.readFileSync(state.runtimeFile)) !== state.runtimeHash) throw new Error('动态翻译脚本已被外部修改，已停止覆盖。');
}
function transaction(changes) {
  const done = [];
  try {
    for (const file of changes) {
      const current = fs.existsSync(file.target) ? fs.readFileSync(file.target) : null;
      if (file.before === null ? current !== null : !current?.equals(file.before)) throw new Error('安装期间文件已变化：' + file.target);
    }
    for (const file of changes) {
      if (file.before?.equals(file.after)) continue;
      done.push(file); P.ensureDir(path.dirname(file.target)); atomicWrite(file.target, file.after);
    }
  } catch (err) {
    const failed = [];
    for (const file of done.reverse()) {
      try { if (file.before === null) fs.unlinkSync(file.target); else atomicWrite(file.target, file.before); }
      catch (_) { failed.push(file.target); }
    }
    throw new Error(err.message + (failed.length ? '\n回滚未完成：' + failed.join(', ') : '\n已回滚本次安装。'));
  }
}
async function execute(options = {}) {
  const { action = 'status', storageRoot } = options;
  if (!['install', 'uninstall', 'status'].includes(action)) throw new Error('不支持的动态插件操作。');
  const appRoot = P.resolveAppRoot(options.appRoot);
  if (!appRoot) throw new Error('未找到 Cursor 安装目录。');
  const info = location(appRoot, storageRoot);
  P.ensureDir(info.directory);
  const lockFile = path.join(info.directory, 'operation.lock');
  if (fs.existsSync(lockFile)) {
    const pid = Number(fs.readFileSync(lockFile, 'utf8'));
    try { process.kill(pid, 0); } catch (err) { if (err.code === 'ESRCH') fs.unlinkSync(lockFile); else throw err; }
  }
  let lock;
  try { lock = fs.openSync(lockFile, 'wx'); } catch (_) { throw new Error('另一动态插件操作正在进行，请稍后重试。'); }
  fs.writeFileSync(lock, String(process.pid)); fs.closeSync(lock);
  try {
    const state = readState(info);
    const active = state && state.status !== 'uninstalled';
    if (active) validateState(appRoot, info, state);
    const base = { appRoot, version: info.version, backupDirectory: info.directory };
    if (action === 'status') {
      const service = S.readService();
      return { ...base, installed: !!active && state.status === 'installed',
        serviceReady: !!(service && await S.health(service)), restartRequired: true,
        message: active ? '动态翻译加载器已安装。聊天窗口右下角可即时切换中文与原文。' : '当前版本尚未安装动态插件。' };
    }
    if (action === 'uninstall') {
      if (!active) return { ...base, changed: false, message: '无需卸载。' };
      const changes = state.files.map(file => ({ target: legacy.targetPath(appRoot, file.rel),
        before: fs.readFileSync(legacy.targetPath(appRoot, file.rel)),
        after: fs.readFileSync(legacy.targetPath(path.join(info.directory, 'originals'), file.rel)) }));
      transaction(changes);
      if (fs.existsSync(state.runtimeFile)) fs.unlinkSync(state.runtimeFile);
      atomicWrite(info.manifestFile, JSON.stringify({ ...state, status: 'uninstalled' }, null, 2));
      return { ...base, changed: true, message: '动态插件已卸载，重启 Cursor 生效。' };
    }
    const service = options.service || await S.ensureService(options.engineRoot);
    // Remove the superseded static translations, so the runtime English switch is exact.
    if (!active) legacy.execute({ action: 'restore', appRoot, storageRoot: options.legacyStorageRoot });
    const { dictionary, packEntries } = buildDictionary(appRoot);
    const runtimeFile = path.join(appRoot, 'out/vs/workbench/cursor-dynamic-zh/runtime.js');
    if (!active && fs.existsSync(runtimeFile)) throw new Error('发现无安装记录的动态脚本，请先保留并处理该文件。');
    const runtime = Buffer.from(renderRuntime(dictionary, service));
    const additions = loaders(service);
    const files = [];
    const changes = [];
    for (const [index, rel] of appFiles.entries()) {
      const target = legacy.targetPath(appRoot, rel);
      const before = fs.readFileSync(target);
      const existing = active && state.files.find(file => file.rel === rel);
      const original = existing ? fs.readFileSync(legacy.targetPath(path.join(info.directory, 'originals'), rel)) : before;
      if (original.includes(marker)) throw new Error('源文件中已有未记录的动态加载器，已停止重复注入。');
      const after = Buffer.concat([original, Buffer.from(additions[index])]);
      const check = P.validateJs(after.toString('utf8'));
      if (!check.ok) throw new Error('加载器语法检查失败：' + check.error);
      files.push({ rel, originalHash: P.hashOf(original), installedHash: P.hashOf(after) });
      const backup = legacy.targetPath(path.join(info.directory, 'originals'), rel);
      P.ensureDir(path.dirname(backup)); if (!existing) atomicWrite(backup, original);
      changes.push({ target, before, after });
    }
    const runtimeCheck = P.validateJs(runtime.toString('utf8'));
    if (!runtimeCheck.ok) throw new Error('动态引擎语法检查失败：' + runtimeCheck.error);
    changes.push({ target: runtimeFile, before: fs.existsSync(runtimeFile) ? fs.readFileSync(runtimeFile) : null, after: runtime });
    // Respect versions that checksum either bootstrap file.
    const productFile = path.join(appRoot, 'product.json');
    const productBefore = fs.readFileSync(productFile);
    const originalProduct = active && state.files.some(file => file.rel === 'product.json')
      ? fs.readFileSync(path.join(info.directory, 'originals/product.json')) : productBefore;
    const product = JSON.parse(originalProduct);
    let updated = false;
    for (const change of changes) {
      const key = path.relative(path.join(appRoot, 'out'), change.target).split(path.sep).join('/');
      if (product.checksums && Object.hasOwn(product.checksums, key)) { product.checksums[key] = P.checksumOf(change.after); updated = true; }
    }
    if (updated) {
      const after = Buffer.from(JSON.stringify(product, null, 2));
      const backup = path.join(info.directory, 'originals/product.json');
      if (!active || !state.files.some(file => file.rel === 'product.json')) atomicWrite(backup, originalProduct);
      files.push({ rel: 'product.json', originalHash: P.hashOf(originalProduct), installedHash: P.hashOf(after) });
      changes.push({ target: productFile, before: productBefore, after });
    }
    const nextState = { status: 'preparing', appRoot, version: info.version, files,
      runtimeFile, runtimeHash: P.hashOf(runtime), installedAt: new Date().toISOString(), dictionaryEntries: Object.keys(dictionary).length };
    atomicWrite(info.manifestFile, JSON.stringify(nextState, null, 2));
    try { transaction(changes); }
    catch (err) {
      if (state) atomicWrite(info.manifestFile, JSON.stringify(state, null, 2));
      else atomicWrite(info.manifestFile, JSON.stringify({ ...nextState, status: 'uninstalled' }, null, 2));
      throw err;
    }
    atomicWrite(info.manifestFile, JSON.stringify({ ...nextState, status: 'installed' }, null, 2));
    return { ...base, installed: true, dictionaryEntries: Object.keys(dictionary).length, languagePackEntries: packEntries,
      serviceReady: true, restartRequired: true, message: '动态插件安装完成。重启 Cursor 后，右下角可切换中文/原文，新增 AI 英文回复会在本机自动翻译。' };
  } finally { if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile); }
}
module.exports = { execute, location, renderRuntime, loaders, buildDictionary };
