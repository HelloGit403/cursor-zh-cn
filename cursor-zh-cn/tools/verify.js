'use strict';

// Explicitly shared engine and journal with the extension. Default: read-only preview.
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = key => args.find(x => x.startsWith('--' + key + '='))?.slice(key.length + 3);
const actions = ['apply', 'restore', 'status'].filter(x => args.includes('--' + x));
if (actions.length > 1) throw new Error('请仅指定一种操作。');
try {
  const report = require('../src/manager').execute({
    action: actions[0] || 'preview', appRoot: opt('app-root'), customFile: opt('dict'),
    includeHardcoded: !args.includes('--nls-only')
  });
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (opt('report')) fs.writeFileSync(path.resolve(opt('report')), json + '\n');
} catch (err) { console.error(err.message); process.exitCode = 1; }
