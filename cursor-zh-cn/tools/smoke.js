'use strict';

// Exercise the packaged entry point using a minimal documented VS Code API mock.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const extensionPath = path.resolve(process.argv[2]);
const registered = new Map();
const messages = [];
const calls = [];
const mock = {
  env: { appRoot: 'D:/cursor/resources/app' },
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
  window: {
    createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
    withProgress: (_options, fn) => fn(),
    showInformationMessage: async message => { messages.push(message); },
    showErrorMessage: async message => { throw new Error(message); }
  },
  ProgressLocation: { Notification: 15 },
  Uri: { file: file => ({ fsPath: file }) },
  commands: {
    registerCommand: (name, fn) => { registered.set(name, fn); return { dispose() {} }; },
    executeCommand: async (...args) => { calls.push(args); }
  }
};
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  return name === 'vscode' ? mock : originalLoad.call(this, name, ...args);
};
(async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(extensionPath, 'package.json')));
  require(path.join(extensionPath, pkg.main)).activate({ extensionPath, subscriptions: [] });
  for (const { command } of pkg.contributes.commands) assert.ok(registered.has(command), command);
  await registered.get('cursorZh.help')();
  assert.ok(fs.existsSync(calls[0][1].fsPath), 'packaged README must resolve');
  await registered.get('cursorZh.languagePack')();
  assert.equal(calls[1][0], 'workbench.extensions.search');
  await registered.get('cursorZh.preview')();
  assert.ok(messages.some(message => /预览完成/.test(message)));
  console.log(JSON.stringify({ passed: true, commands: registered.size, helpFileExists: true,
    bundledDependencyAvailable: true, previewThroughExtensionEntry: messages }, null, 2));
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; });
