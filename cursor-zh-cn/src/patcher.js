'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const acorn = require('acorn');

const checksumOf = buf => crypto.createHash('sha256').update(buf).digest('base64').replace(/=+$/, '');
const hashOf = buf => crypto.createHash('sha256').update(buf).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const ensureDir = dir => fs.mkdirSync(dir, { recursive: true });

function isCursorRoot(dir) {
  try {
    const product = readJson(path.join(dir, 'product.json'));
    return /cursor/i.test([product.nameShort, product.nameLong, product.applicationName].join(' ')) &&
      fs.statSync(path.join(dir, 'out', 'vs')).isDirectory();
  } catch { return false; }
}

function resolveAppRoot(preferred) {
  if (preferred || process.env.CURSOR_APP_ROOT) {
    const dir = path.resolve(preferred || process.env.CURSOR_APP_ROOT);
    return isCursorRoot(dir) ? dir : null;
  }
  const local = process.env.LOCALAPPDATA;
  const candidates = [
    path.join(path.dirname(process.execPath), 'resources', 'app'),
    local && path.join(local, 'Programs', 'cursor', 'resources', 'app'),
    'C:/Program Files/Cursor/resources/app', 'D:/cursor/resources/app',
    '/Applications/Cursor.app/Contents/Resources/app',
    path.join(os.homedir(), 'Applications/Cursor.app/Contents/Resources/app'),
    '/opt/Cursor/resources/app', '/usr/share/cursor/resources/app'
  ];
  return candidates.find(dir => dir && isCursorRoot(dir)) || null;
}

function listTargets(appRoot, includeHardcoded = true) {
  const files = [path.join(appRoot, 'out', 'nls.messages.json')];
  if (includeHardcoded) {
    const dir = path.join(appRoot, 'out', 'vs', 'workbench');
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        if (/^workbench\..*\.main\.js$/.test(name)) files.push(path.join(dir, name));
      }
    }
  }
  return files.filter(file => fs.existsSync(file));
}

function loadDictionary(customFile) {
  const dict = Object.create(null);
  for (const file of [path.join(__dirname, '..', 'dictionary', 'zh-cn.json'), customFile].filter(Boolean)) {
    const data = readJson(file);
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('词典必须是 JSON 对象：' + file);
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_')) continue;
      if (typeof value !== 'string' || !value) throw new Error('词典译文必须为非空字符串：' + key);
      const placeholders = s => (s.match(/\{\d+\}/g) || []).sort().join('|');
      if (placeholders(key) !== placeholders(value)) throw new Error('译文必须保留原文的 {0} 等占位符：' + key);
      dict[key] = value;
    }
  }
  return dict;
}

function patchNlsSource(source, dict) {
  const messages = JSON.parse(source);
  if (!Array.isArray(messages) || !messages.every(x => typeof x === 'string')) {
    throw new Error('不支持此版本的 nls.messages.json 格式，未写入文件。');
  }
  const used = new Map();
  const translated = messages.map(en => {
    if (!Object.hasOwn(dict, en) || dict[en] === en) return en;
    used.set(en, (used.get(en) || 0) + 1);
    return dict[en];
  });
  return { source: used.size ? JSON.stringify(translated) : source, used };
}

// Tokenize JavaScript so comments, regexes and template text cannot be mistaken
// for string literals. Only explicit presentation properties are eligible.
const UI_PROPERTIES = new Set([
  'label', 'title', 'tooltip', 'placeholder', 'placeholderContent', 'description',
  'detail', 'message', 'aria-label', 'ariaLabel', 'children', 'textContent',
  'emptyMessage', 'loadingMessage', 'buttonLabel', 'confirmLabel', 'cancelLabel',
  'collectionLabel', 'connectLabel', 'pillLabel', 'pageTitle', 'emptyTitle',
  'newAutomationButtonLabel', 'nameColumn', 'inputPlaceholder', 'tooltipText'
]);
const PROTECTED = new Set(['Segoe UI', 'Segoe WPC', 'Segoe UI Emoji', 'Droid Sans',
  'Droid Sans Mono', 'Courier New', 'Lucida Console', 'Ubuntu Mono', 'GitHub',
  'GitHub Copilot', 'Cursor Tab']);

function patchBundleSource(source, dict) {
  const lexer = acorn.tokenizer(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const used = new Map();
  const edits = [];
  let prev = null;
  let beforePrev = null;
  let pendingProperty = null;
  const stack = [];
  let token = lexer.getToken();
  for (;;) {
    const type = token.type.label;
    if (type === 'eof') break;
    const next = lexer.getToken();
    const key = (type === 'name' || type === 'string') ? token.value : null;
    if (type === ':' && beforePrev && ['{', ','].includes(beforePrev.type.label) && prev) {
      const property = prev.value;
      const parent = stack[stack.length - 1];
      pendingProperty = UI_PROPERTIES.has(property) ||
        (property === 'value' && parent && parent.property === 'title') ? property : null;
    } else if (['{', '[', '(', '${'].includes(type)) {
      stack.push({ type, property: pendingProperty });
      pendingProperty = null;
    } else if (['}', ']', ')'].includes(type)) {
      stack.pop();
      pendingProperty = null;
    } else {
      const parent = stack[stack.length - 1];
      const directValue = prev && prev.type.label === ':' && pendingProperty;
      const childArrayValue = parent && parent.type === '[' && parent.property === 'children' &&
        prev && ['[', ','].includes(prev.type.label);
      if (type === 'string' && [',', '}', ']'].includes(next.type.label) &&
          (directValue || childArrayValue) && !PROTECTED.has(key) &&
          Object.hasOwn(dict, key) && dict[key] !== key) {
        edits.push({ start: token.start, end: token.end, text: JSON.stringify(dict[key]) });
        used.set(key, (used.get(key) || 0) + 1);
      }
      if (type !== ':') pendingProperty = null;
    }
    beforePrev = prev;
    prev = token;
    token = next;
  }
  let pos = 0;
  const pieces = [];
  for (const edit of edits) {
    pieces.push(source.slice(pos, edit.start), edit.text);
    pos = edit.end;
  }
  pieces.push(source.slice(pos));
  return { source: pieces.join(''), used };
}

function validateJs(source) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-check-'));
  const file = path.join(tmpDir, 'bundle.mjs');
  try {
    fs.writeFileSync(file, source);
    require('child_process').execFileSync(process.execPath, ['--check', file], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
      stdio: 'pipe', timeout: 60000, maxBuffer: 16 * 1024
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.message).slice(0, 1500) };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function patchChatSource(source, dict, profile) {
  const used = new Map();
  if (hashOf(source) !== profile.sha256) return { source, used, supported: false };
  // Locate every edit before changing offsets. All anchors must be unique.
  const edits = [];
  for (const patch of profile.patches) {
    const needle = patch.before + JSON.stringify(patch.english) + patch.after;
    const start = source.indexOf(needle);
    if (start < 0 || source.indexOf(needle, start + 1) >= 0) throw new Error('聊天窗口上下文与配置不一致，已停止汉化。');
    if (!Object.hasOwn(dict, patch.english) || dict[patch.english] === patch.english) continue;
    edits.push({ start: start + patch.before.length,
      end: start + patch.before.length + JSON.stringify(patch.english).length,
      text: JSON.stringify(dict[patch.english]) });
    used.set(patch.english, (used.get(patch.english) || 0) + 1);
  }
  edits.sort((a, b) => a.start - b.start);
  let pos = 0;
  const parts = [];
  for (const edit of edits) {
    if (edit.start < pos) throw new Error('聊天窗口上下文补丁重叠，已停止汉化。');
    parts.push(source.slice(pos, edit.start), edit.text);
    pos = edit.end;
  }
  parts.push(source.slice(pos));
  return { source: parts.join(''), used, supported: true };
}

module.exports = { checksumOf, hashOf, readJson, ensureDir, isCursorRoot, resolveAppRoot,
  listTargets, loadDictionary, patchNlsSource, patchBundleSource, patchChatSource, validateJs };
