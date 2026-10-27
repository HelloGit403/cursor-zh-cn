'use strict';

const { execute } = require('./manager');
try {
  const action = process.argv[2] || 'preview';
  const result = execute({ action, appRoot: process.argv[3] || undefined, surface: 'chat' });
  console.log('\nCursor 聊天界面汉化');
  console.log('版本：' + result.version);
  console.log('安装位置：' + result.appRoot);
  console.log('备份位置：' + result.backupDirectory);
  if (action === 'preview' || action === 'apply') {
    console.log('词典匹配：' + result.replacements + ' 处文案');
    for (const file of result.files) console.log('  ' + file.file + '：' + file.replacements + ' 处');
  }
  if (result.warnings) for (const warning of result.warnings) console.log('提示：' + warning);
  if (result.message) console.log(result.message);
  if (action === 'preview') console.log('\n预览完成，未修改 Cursor 安装文件。');
  else if (result.changed) console.log('\n已' + (action === 'restore' ? '还原' : '应用') + '。请保存工作，完全退出所有 Cursor 窗口，再重新打开聊天界面。');
  else if (action === 'apply') console.log('\n请完全退出所有 Cursor 窗口并重新打开，以便读取磁盘上的汉化资源。');
} catch (error) {
  console.error('\n操作失败：' + error.message);
  if (/EACCES|EPERM/.test(error.message)) console.error('请右键点击启动文件，选择“以管理员身份运行”后重试。');
  process.exitCode = 1;
}
