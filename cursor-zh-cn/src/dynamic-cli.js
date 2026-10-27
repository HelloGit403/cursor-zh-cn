'use strict';
require('./dynamic-installer').execute({ action: process.argv[2] || 'status', appRoot: process.argv[3] || undefined })
  .then(result => {
    console.log(result.message);
    console.log('Cursor：' + result.version);
    console.log('备份：' + result.backupDirectory);
    if (result.dictionaryEntries) console.log('界面词典：' + result.dictionaryEntries + ' 条');
    console.log('本机翻译服务：' + (result.serviceReady ? '已就绪' : '未运行'));
  }).catch(err => { console.error('操作失败：' + err.message); process.exitCode = 1; });
