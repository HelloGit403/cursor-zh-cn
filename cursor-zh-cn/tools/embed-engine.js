'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('../src/dynamic-service');
const source = path.resolve(__dirname, '../../dynamic-engine');
const destination = S.embeddedEngineRoot();
const integrationRoot = S.integrationRoot();
// The dedicated destination must remain inside Cursor's own user storage.
const relative = path.relative(integrationRoot, destination);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('内置模块目标路径不合法。');
const marker = path.join(destination, 'embedded-engine.json');
if (fs.existsSync(destination) && !fs.existsSync(marker)) throw new Error('目标目录已有未识别内容，已停止覆盖。');
const cfg = fs.readFileSync(path.join(source, '.venv/pyvenv.cfg'), 'utf8');
const homeLine = cfg.split(/\r?\n/).find(line => /^home\s*=/.test(line));
if (!homeLine) throw new Error('无法定位当前 Python 基础运行环境。');
const basePython = homeLine.slice(homeLine.indexOf('=') + 1).trim();
if (!fs.existsSync(path.join(basePython, 'python311.dll'))) throw new Error('当前打包流程需要已有的 Python 3.11 运行环境。');
const sourceModel = JSON.parse(fs.readFileSync(path.join(source, 'models/model-info.json'), 'utf8'));
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(marker, JSON.stringify({ status: 'preparing', version: '2.1.0' }, null, 2));
const pythonRoot = path.join(destination, 'python-runtime');
const copyOptions = { recursive: true, dereference: true, filter: file => !file.split(path.sep).includes('__pycache__') };
console.log('正在将 Python 运行环境、翻译依赖和模型整合到 Cursor 用户目录…');
fs.cpSync(basePython, pythonRoot, copyOptions);
fs.cpSync(path.join(source, '.venv/Lib/site-packages'), path.join(pythonRoot, 'Lib/site-packages'), copyOptions);
const modelRoot = path.join(destination, 'models', path.basename(sourceModel.directory));
fs.mkdirSync(path.dirname(modelRoot), { recursive: true });
fs.cpSync(sourceModel.directory, modelRoot, copyOptions);
fs.writeFileSync(path.join(destination, 'models/model-info.json'), JSON.stringify({
  ...sourceModel, directory: modelRoot
}, null, 2));
for (const file of ['server.py', 'MODEL-LICENSE.md']) fs.copyFileSync(path.join(source, file), path.join(destination, file));
const verificationCode = [
  'import sys,json,importlib.util',
  'from pathlib import Path',
  'root=Path(sys.argv[1]).resolve()',
  'assert Path(sys.prefix).resolve()==root/"python-runtime"',
  'import ctranslate2,sentencepiece,numpy',
  'assert all(Path(m.__file__).resolve().is_relative_to(root) for m in (ctranslate2,sentencepiece,numpy))',
  'spec=importlib.util.spec_from_file_location("embedded_server",root/"server.py")',
  'module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)',
  'info=json.loads((root/"models/model-info.json").read_text())',
  'translate=module.create_engine(info["directory"])',
  'result=translate("The translation module runs inside Cursor.")',
  'assert any("\\u3400"<=char<="\\u9fff" for char in result)',
  'print(json.dumps({"passed":True,"translation":result,"pythonPrefix":sys.prefix},ensure_ascii=True))'
].join('\n');
const result = JSON.parse(execFileSync(path.join(pythonRoot, 'python.exe'), ['-I', '-c', verificationCode, destination], {
  encoding: 'utf8', windowsHide: true, timeout: 60000
}));
fs.writeFileSync(marker, JSON.stringify({ status: 'ready', version: '2.1.0', installedAt: new Date().toISOString(),
  selfContainedRuntime: true, modelDirectory: modelRoot }, null, 2));
console.log(JSON.stringify({ ...result, engineDirectory: destination, desktopFolderRequired: false }, null, 2));
