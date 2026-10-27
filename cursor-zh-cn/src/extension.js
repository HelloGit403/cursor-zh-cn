'use strict';

const vscode = require('vscode');
const path = require('path');
const { execFile } = require('child_process');
let busy = false;

function activate(context) {
  const output = vscode.window.createOutputChannel('Cursor 汉化');
  context.subscriptions.push(output);

  const run = async action => {
    if (busy) return vscode.window.showInformationMessage('正在处理汉化任务，请等待完成。');
    const config = vscode.workspace.getConfiguration('cursorZh');
    const options = {
      action,
      appRoot: config.get('appRoot') || vscode.env.appRoot,
      customFile: config.get('dictionaryFile') || '',
      includeHardcoded: config.get('includeHardcoded') !== false
    };
    busy = true;
    output.show(true);
    output.appendLine(`\n${new Date().toLocaleString()} — ${action}`);
    try {
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: action === 'restore' ? '正在还原 Cursor…' : action === 'status' ? '正在检查汉化状态…' : '正在检查和翻译 Cursor…',
        cancellable: false
      }, () => new Promise((resolve, reject) => {
        execFile(process.execPath, [path.join(context.extensionPath, 'src', 'worker.js'), JSON.stringify(options)], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
          timeout: 300000, maxBuffer: 2 * 1024 * 1024
        }, (err, stdout, stderr) => {
          try {
            const response = JSON.parse(stdout);
            if (!response.ok) reject(new Error(response.error));
            else resolve(response.result);
          } catch (parseError) { reject(err || new Error(stderr || parseError.message)); }
        });
      }));
      output.appendLine(JSON.stringify(result, null, 2));
      if (action === 'status') {
        await vscode.window.showInformationMessage(`Cursor 汉化：${result.message}；Cursor ${result.version}`);
      } else if (action === 'preview') {
        await vscode.window.showInformationMessage(`预览完成：可翻译 ${result.replacements} 处，涉及 ${result.files.length} 个文件。未修改安装文件。`);
      } else if (!result.changed) {
        await vscode.window.showInformationMessage(result.message || '没有需要修改的文件。');
      } else {
        const picked = await vscode.window.showInformationMessage(
          `${action === 'restore' ? '还原' : '汉化'}完成。保存工作后，请完全退出所有 Cursor 窗口并重新启动，以便所有界面生效。`, '查看使用说明');
        if (picked) await vscode.commands.executeCommand('cursorZh.help');
      }
    } catch (err) {
      output.appendLine(err.stack || String(err));
      await vscode.window.showErrorMessage(`Cursor 汉化：${err.message}`);
    } finally { busy = false; }
  };

  for (const [command, action] of Object.entries({
    'cursorZh.apply': 'apply', 'cursorZh.preview': 'preview',
    'cursorZh.restore': 'restore', 'cursorZh.status': 'status'
  })) {
    context.subscriptions.push(vscode.commands.registerCommand(command, () => run(action)));
  }
  context.subscriptions.push(vscode.commands.registerCommand('cursorZh.help', () => {
    const name = require('fs').existsSync(path.join(context.extensionPath, 'readme.md')) ? 'readme.md' : 'README.md';
    return vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(context.extensionPath, name)));
  }));
  context.subscriptions.push(vscode.commands.registerCommand('cursorZh.languagePack', () =>
    vscode.commands.executeCommand('workbench.extensions.search', '@id:MS-CEINTL.vscode-language-pack-zh-hans')));
}

module.exports = { activate, deactivate() {} };
