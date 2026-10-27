'use strict';

try {
  const result = require('./manager').execute(JSON.parse(process.argv[2] || '{}'));
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (err) {
  let error = err.message;
  if (err.code === 'EACCES' || err.code === 'EPERM') error += '。安装目录没有写权限，请以管理员身份启动 Cursor 后重试。';
  process.stdout.write(JSON.stringify({ ok: false, error }));
  process.exitCode = 1;
}
