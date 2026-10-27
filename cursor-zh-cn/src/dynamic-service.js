'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const integrationRoot = () => path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming'),
  'Cursor', 'User', 'globalStorage', 'local.cursor-dynamic-zh');
const embeddedEngineRoot = () => path.join(integrationRoot(), 'engine');
const serviceDir = () => path.join(integrationRoot(), 'service');
const legacyConfig = () => path.join(os.homedir(), '.cursor-zh-cn', 'dynamic-service', 'config.json');
function resolveEngineRoot(explicitRoot) {
  if (explicitRoot) return path.resolve(explicitRoot);
  const embedded = embeddedEngineRoot();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(embedded, 'embedded-engine.json'), 'utf8'));
    if (manifest.status === 'ready' && fs.existsSync(path.join(embedded, 'python-runtime/pythonw.exe'))) return embedded;
  } catch (_) {}
  return path.join(__dirname, '../../dynamic-engine');
}
async function health(service) {
  try {
    const response = await fetch(service.endpoint + '/health', {
      headers: { Authorization: 'Bearer ' + service.token }, signal: AbortSignal.timeout(1500)
    });
    return response.ok ? await response.json() : null;
  } catch (_) { return null; }
}
async function ensureService(explicitRoot) {
  const engineRoot = resolveEngineRoot(explicitRoot);
  const embeddedPython = path.join(engineRoot, 'python-runtime/pythonw.exe');
  const python = fs.existsSync(embeddedPython) ? embeddedPython : path.join(engineRoot, '.venv/Scripts/pythonw.exe');
  const infoFile = path.join(engineRoot, 'models/model-info.json');
  if (!fs.existsSync(python) || !fs.existsSync(infoFile)) throw new Error('本机翻译引擎尚未安装，请先运行“准备本机翻译引擎.ps1”。');
  const model = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  const dir = serviceDir(); fs.mkdirSync(dir, { recursive: true });
  const config = path.join(dir, 'config.json');
  let settings;
  if (fs.existsSync(config)) settings = JSON.parse(fs.readFileSync(config, 'utf8'));
  else if (fs.existsSync(legacyConfig())) settings = JSON.parse(fs.readFileSync(legacyConfig(), 'utf8'));
  else {
    const server = require('net').createServer();
    const port = await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    await new Promise(resolve => server.close(resolve));
    settings = { port, token: crypto.randomBytes(32).toString('hex') };
  }
  settings.modelDirectory = model.directory;
  settings.engineId = crypto.createHash('sha256').update(path.resolve(engineRoot).toLowerCase()).digest('hex').slice(0, 16);
  fs.writeFileSync(config, JSON.stringify(settings, null, 2), { mode: 0o600 });
  const script = path.join(dir, 'server.py');
  fs.copyFileSync(path.join(engineRoot, 'server.py'), script);
  const service = { endpoint: 'http://127.0.0.1:' + settings.port, token: settings.token, python, script, config };
  const existing = await health(service);
  if (existing?.lifecycle === 'cursor-process' && existing.engineId === settings.engineId && existing.version === '2.1.0') return service;
  // Upgrade only the authenticated translation process we previously launched.
  if (existing?.engine === 'CTranslate2' && Number.isInteger(existing.pid) && existing.pid > 0) {
    try { process.kill(existing.pid); } catch (err) { if (err.code !== 'ESRCH') throw err; }
    for (let attempt = 0; attempt < 20 && await health(service); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (await health(service)) throw new Error('旧翻译服务仍在退出，请稍后再试。');
  }
  const child = spawn(python, ['-I', script, '--config', config], { detached: true, windowsHide: true, stdio: 'ignore' });
  child.unref();
  let launchError;
  child.on('error', err => { launchError = err; });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (launchError) throw launchError;
    if (await health(service)) return service;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('本机翻译服务启动失败。请运行引擎检查，确认模型和 Python 依赖完整。');
}
function readService() {
  try {
    const file = path.join(serviceDir(), 'config.json');
    const settings = JSON.parse(fs.readFileSync(fs.existsSync(file) ? file : legacyConfig(), 'utf8'));
    return { endpoint: 'http://127.0.0.1:' + settings.port, token: settings.token };
  } catch (_) { return null; }
}
module.exports = { ensureService, health, readService, integrationRoot, embeddedEngineRoot, resolveEngineRoot };
