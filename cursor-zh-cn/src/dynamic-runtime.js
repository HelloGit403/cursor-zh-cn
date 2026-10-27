'use strict';

function createDynamicTranslator(win, options = {}) {
  const doc = win.document;
  const storageKey = 'cursor.dynamicZh.v2';
  const dictionary = Object.assign(Object.create(null), options.dictionary || {});
  const records = new Map();
  const roots = new Set();
  const pending = new Map();
  const cache = new Map();
  const missing = new Set();
  const attrNames = ['title', 'aria-label', 'placeholder', 'data-placeholder', 'aria-placeholder'];
  const hardProtected = 'script,style,pre,code,kbd,samp,a,svg,canvas,.monaco-editor,[data-cursor-zh-ignore]';
  const userProtected = '[data-message-role="human"],[data-message-role="user"],[data-message-kind="human"],[data-author="user"]';
  const aiSelector = '[data-message-role="ai"][data-message-kind="assistant"],[data-message-role="assistant"],[data-author="assistant"]';
  const nameProtected = '[data-component="project-title"],[data-component="item-title"],[data-component="pr-title-static"],[data-component="pr-title-link"],[aria-roledescription="sortable"],[data-model-picker-item-name],[id^="prompt-bar-model-dropdown"],[aria-label="Account menu"],[aria-label="账户菜单"]';
  const uiSelector = 'button,label,summary,legend,nav,header,[role="button"],[role="menuitem"],[role="menu"],[role="dialog"],[role="tab"],[role="tooltip"],[data-component*="sidebar"],[data-component="empty-state-title"]';
  let settings = { enabled: true, replies: true, custom: {} };
  try { settings = { ...settings, ...JSON.parse(win.localStorage.getItem(storageKey) || '{}') }; } catch (_) {}
  let observer, host, shadow, toggle, replyToggle, status, editor;
  let timer = null, networkTimer = null, running = false, busy = false, epoch = 0;
  let error = '', translatedCount = 0;
  const persist = () => { try { win.localStorage.setItem(storageKey, JSON.stringify(settings)); } catch (_) {} };
  const lookup = text => Object.hasOwn(settings.custom, text) ? settings.custom[text] : dictionary[text];

  function protectedElement(element, attribute = false) {
    if (!element || element.closest('#cursor-dynamic-zh')) return true;
    if (element.closest(hardProtected + ',' + userProtected + ',' + nameProtected)) return true;
    if (!attribute && element.closest('input,textarea,[contenteditable="true"],[contenteditable=""],[role="textbox"]')) return true;
    return false;
  }
  function updateStatus() {
    if (!status) return;
    toggle.textContent = settings.enabled ? '中文 · 开' : 'English · 关';
    replyToggle.textContent = settings.replies ? 'AI 回复翻译：开' : 'AI 回复翻译：关';
    status.textContent = error || (busy ? '正在本机翻译…' : `动态监听中 · 已处理 ${translatedCount} 处`);
  }
  function remember(node, attribute, original, translated) {
    if (original === translated) return;
    let row = records.get(node);
    if (!row) { row = new Map(); records.set(node, row); }
    row.set(attribute, { original, translated });
    if (attribute) node.setAttribute(attribute, translated);
    else node.data = translated;
    translatedCount++;
  }
  function currentValue(node, attribute) { return attribute ? node.getAttribute(attribute) : node.data; }
  function prune() {
    for (const [node] of records) if (!node.isConnected) records.delete(node);
    for (const [node] of pending) if (!node.isConnected) pending.delete(node);
  }
  function processValue(node, attribute = '') {
    const element = attribute ? node : node.parentElement;
    if (protectedElement(element, !!attribute)) return;
    const ai = element.closest(aiSelector);
    if (ai && !settings.replies) return;
    if (!ai && element.closest('.rendered-markdown,[data-component*="markdown-preview"]')) return;
    // Unknown transcript rows can contain user data; never guess their author.
    if (!ai && element.closest('[data-message-role],[data-message-id]') && !attribute && !element.closest('button,[role="button"]')) return;
    const value = currentValue(node, attribute);
    if (!value || value.length > 4000) return;
    const record = records.get(node)?.get(attribute);
    if (record && record.translated === value) return;
    if (record) records.get(node).delete(attribute);
    const pieces = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
    const text = pieces[2];
    if (/^(?:Cursor|GitHub|OpenAI|ChatGPT|MCP|IDE|Tab|Enter|Escape)$/i.test(text)) return;
    if (/^(?:[⇧⌘⌥⌃]|(?:Ctrl|Alt|Shift|Cmd|Meta|Control)\b)/.test(text)) return;
    if (/\b[\w.-]+\.(?:js|ts|py|json|md|txt|csv|xlsx|pdf|html|css|exe)\b|\b[\w-]+\.(?:com|org|net|io|dev)(?:\/|\b)/i.test(text)) return;
    if (!ai && /(?:gpt[- ]?\d|claude|gemini|grok|deepseek|qwen|llama|sonnet|opus|haiku)/i.test(text)) return;
    if (!/[A-Za-z]{2}/.test(text) || /[\u3400-\u9fff]/.test(text) || /^(?:https?:\/\/|[\w.-]+@)/.test(text)) return;
    const known = lookup(text);
    if (!ai && typeof known === 'string') {
      remember(node, attribute, value, pieces[1] + known + pieces[3]);
      return;
    }
    const eligible = ai || attribute || element.closest(uiSelector) || text.trim().split(/\s+/).length >= 3;
    if (!eligible || !options.endpoint) {
      if (eligible && missing.size < 300) missing.add(text);
      return;
    }
    if (cache.has(text)) {
      remember(node, attribute, value, pieces[1] + cache.get(text) + pieces[3]);
      return;
    }
    let requests = pending.get(node);
    if (!requests) { requests = new Map(); pending.set(node, requests); }
    const previous = requests.get(attribute);
    // Stable text waits briefly so streaming tokens are not translated repeatedly.
    if (!previous || previous.value !== value) requests.set(attribute, { node, attribute, value, text,
      whitespace: [pieces[1], pieces[3]], ready: Date.now() + (ai ? (options.replyDelay ?? 850) : 120) });
    scheduleNetwork();
  }
  function scan(root) {
    if (!settings.enabled || !root?.isConnected) return;
    if (root.nodeType === 3) { processValue(root); return; }
    if (root.nodeType !== 1 || root.id === 'cursor-dynamic-zh') return;
    for (const attr of attrNames) if (root.hasAttribute(attr)) processValue(root, attr);
    const walker = doc.createTreeWalker(root, win.NodeFilter.SHOW_ELEMENT | win.NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === 1 && protectedElement(node, true)) return win.NodeFilter.FILTER_REJECT;
        return win.NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) processValue(node);
      else for (const attr of attrNames) if (node.hasAttribute(attr)) processValue(node, attr);
    }
  }
  function flush() {
    timer = null;
    prune();
    const work = [...roots]; roots.clear();
    for (const root of work) {
      if (!work.some(other => other !== root && other.nodeType === 1 && other.contains(root))) scan(root);
    }
    updateStatus();
  }
  function enqueue(root) {
    if (!running || !settings.enabled) return;
    roots.add(root);
    if (!timer) timer = win.setTimeout(flush, 30);
  }
  function scheduleNetwork() {
    if (!networkTimer && !busy && running && settings.enabled) networkTimer = win.setTimeout(translatePending, 180);
  }
  async function translatePending() {
    networkTimer = null;
    if (!running || !settings.enabled) return;
    prune();
    const work = [];
    for (const [node, attributes] of pending) {
      for (const [attribute, request] of attributes) {
        if (request.ready <= Date.now()) { work.push(request); attributes.delete(attribute); }
        if (work.length >= 12) break;
      }
      if (!attributes.size) pending.delete(node);
      if (work.length >= 12) break;
    }
    if (!work.length) { if (pending.size) scheduleNetwork(); return; }
    busy = true; updateStatus();
    const requestEpoch = epoch;
    const texts = [...new Set(work.map(item => item.text))];
    try {
      const controller = new win.AbortController();
      const timeout = win.setTimeout(() => controller.abort(), 60000);
      let response;
      try {
        response = await win.fetch(options.endpoint + '/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + options.token },
          body: JSON.stringify({ texts }), signal: controller.signal
        });
      } finally { win.clearTimeout(timeout); }
      if (!response.ok) throw new Error('本机翻译服务返回 ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data.translations) || data.translations.length !== texts.length ||
          !data.translations.every(value => typeof value === 'string')) throw new Error('翻译服务响应格式错误');
      texts.forEach((text, index) => cache.set(text, data.translations[index]));
      if (cache.size > 3000) cache.delete(cache.keys().next().value);
      error = '';
      if (requestEpoch === epoch && running && settings.enabled) {
        for (const item of work) {
          if (item.node.isConnected && currentValue(item.node, item.attribute) === item.value &&
              !protectedElement(item.attribute ? item.node : item.node.parentElement, !!item.attribute)) {
            remember(item.node, item.attribute, item.value,
              item.whitespace[0] + cache.get(item.text) + item.whitespace[1]);
          }
        }
      }
    } catch (_) {
      error = '本机服务未就绪：双击“启用动态翻译”后，点击“重新扫描”';
    } finally { busy = false; updateStatus(); if (pending.size) scheduleNetwork(); }
  }
  function restore() {
    epoch++;
    roots.clear(); pending.clear();
    for (const [node, row] of records) {
      for (const [attribute, value] of row) {
        if (node.isConnected && currentValue(node, attribute) === value.translated) {
          if (attribute) node.setAttribute(attribute, value.original);
          else node.data = value.original;
        }
      }
    }
    records.clear();
  }
  function setEnabled(value) {
    settings.enabled = !!value;
    if (!settings.enabled) restore(); else enqueue(doc.body);
    persist(); updateStatus();
  }
  function setReplies(value) {
    restore(); settings.replies = !!value; persist(); enqueue(doc.body); updateStatus();
  }
  function setDictionary(value) {
    if (!value || Array.isArray(value) || typeof value !== 'object' ||
        !Object.entries(value).every(([key, translated]) => key && typeof translated === 'string' && translated)) {
      throw new Error('词典格式应为 {"English":"中文"}');
    }
    restore(); settings.custom = value; persist(); enqueue(doc.body);
  }
  function mountControls() {
    host = doc.createElement('div'); host.id = 'cursor-dynamic-zh';
    Object.assign(host.style, { position: 'fixed', right: '18px', bottom: '16px', zIndex: '2147483646' });
    shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = ':host{font:12px "Microsoft YaHei",sans-serif;color:#1f2937}button{cursor:pointer;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#1f2937;padding:6px 10px;font:inherit}button:hover{background:#eff6ff}.bar{display:flex;gap:4px}.panel{box-shadow:0 8px 32px #0003;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:14px;width:340px;margin-bottom:8px;max-height:65vh;overflow:auto}textarea{width:100%;height:120px;box-sizing:border-box;font:12px monospace;color:#111;background:#f8fafc}p{line-height:1.6}.small{color:#64748b;font-size:11px}';
    shadow.append(style);
    const panel = doc.createElement('section'); panel.className = 'panel'; panel.hidden = true;
    const title = doc.createElement('strong'); title.textContent = '聊天窗口 · 动态翻译'; panel.append(title);
    const description = doc.createElement('p'); description.textContent = '界面与 AI 英文回复自动译成中文。代码、链接和你的输入保留原文。翻译在本机完成。'; panel.append(description);
    status = doc.createElement('p'); status.className = 'small'; panel.append(status);
    replyToggle = doc.createElement('button'); replyToggle.onclick = () => setReplies(!settings.replies); panel.append(replyToggle);
    const rescan = doc.createElement('button'); rescan.textContent = '重新扫描'; rescan.onclick = () => enqueue(doc.body); panel.append(rescan);
    const label = doc.createElement('p'); label.textContent = '自定义词典（保存后立即生效）'; panel.append(label);
    editor = doc.createElement('textarea'); editor.value = JSON.stringify(settings.custom, null, 2); panel.append(editor);
    const save = doc.createElement('button'); save.textContent = '保存词典'; save.onclick = () => {
      try { setDictionary(JSON.parse(editor.value)); error = ''; } catch (err) { error = err.message; }
      updateStatus();
    }; panel.append(save);
    shadow.append(panel);
    const bar = doc.createElement('div'); bar.className = 'bar';
    toggle = doc.createElement('button'); toggle.onclick = () => setEnabled(!settings.enabled); bar.append(toggle);
    const configure = doc.createElement('button'); configure.textContent = '翻译设置'; configure.onclick = () => { panel.hidden = !panel.hidden; }; bar.append(configure);
    shadow.append(bar); doc.body.append(host); updateStatus();
  }
  const keyHandler = event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyT') { event.preventDefault(); setEnabled(!settings.enabled); }
  };
  const storageHandler = event => {
    if (event.key !== storageKey || !event.newValue) return;
    try { restore(); settings = { ...settings, ...JSON.parse(event.newValue) }; enqueue(doc.body); updateStatus(); } catch (_) {}
  };
  function start() {
    if (running) return;
    if (!doc.body) { doc.addEventListener('DOMContentLoaded', start, { once: true }); return; }
    running = true; mountControls();
    observer = new win.MutationObserver(mutations => {
      // Cursor can rebuild the body while starting; keep the controls attached.
      if (host && !host.isConnected && doc.body) doc.body.append(host);
      if (!settings.enabled) return;
      for (const mutation of mutations) {
        if ((mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement)?.closest('#cursor-dynamic-zh')) continue;
        if (mutation.type === 'childList') for (const node of mutation.addedNodes) enqueue(node);
        else enqueue(mutation.target);
      }
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attrNames });
    doc.addEventListener('keydown', keyHandler); win.addEventListener('storage', storageHandler); enqueue(doc.body);
  }
  function dispose() {
    observer?.disconnect(); running = false; restore();
    win.clearTimeout(timer); win.clearTimeout(networkTimer);
    doc.removeEventListener('keydown', keyHandler); win.removeEventListener('storage', storageHandler); host?.remove();
  }
  return { start, dispose, setEnabled, setReplies, setDictionary, refresh: () => enqueue(doc.body),
    get state() { return { enabled: settings.enabled, replies: settings.replies, translatedCount, pending: pending.size, error, running }; } };
}

if (typeof module !== 'undefined') module.exports = { createDynamicTranslator };
