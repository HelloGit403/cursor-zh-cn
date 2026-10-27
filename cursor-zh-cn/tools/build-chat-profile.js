'use strict';

// Build-specific anchors reviewed against the installed Agents Window bundle.
const fs = require('fs');
const path = require('path');
const P = require('../src/patcher');
const file = 'workbench.glass.main.js';
const appRoot = P.resolveAppRoot(process.argv[2]);
if (!appRoot) throw new Error('请指定 Cursor resources/app 路径。');
const source = fs.readFileSync(path.join(appRoot, 'out/vs/workbench', file), 'utf8');
const anchors = [
  ['New Chat', '_ig="glass_stable_diff_group_keys",Mrl=', ',big='],
  ['New Agent', ',big=', ',yig="managed_automations_team_revamp"'],
  ['Start from scratch', 'E(),dp(),Hu(),xd(),xG(),LE(),Sye=', ',n_s='],
  ['This PC', 'function qX(){return xa?', ':_r?'],
  ['This Mac', '"This PC":_r?', ':"This Computer"'],
  ['This Computer', '"This PC":_r?"This Mac":', '}function WMn'],
  ['Plan, Build, / for skills, @ for context', 'if(s())return', ';switch(te())'],
  ['Plan, Build, / for skills, @ for context', 'Q2=YU?"Drop here to attach...":Og?oyc:', ',w9='],
  ['Automations', 'return Ee(psn,{name:', ',get icon(){return Ee(P3t,{name:"robot"'],
  ['Customize', 'return Ee(psn,{name:', ',get icon(){return Ee(P3t,{name:"extensions"'],
  ['Customize', 'Z2=he==="customize"?', ':"Marketplace"'],
  ['Customize', 'getName(){return', '}getIcon(){return cOE}'],
  ['Customize', '"marketplace_tab_customize_label","group",!G)==="treatment"?', ':"Marketplace"']
];
const patches = anchors.map(([english, before, after]) => {
  const needle = before + JSON.stringify(english) + after;
  assertCount(needle);
  return { english, before, after };
});
function assertCount(needle) {
  if (source.split(needle).length !== 2) throw new Error('上下文必须且只能命中一次：' + needle);
}
const profile = { version: P.readJson(path.join(appRoot, 'package.json')).version,
  file, sha256: P.hashOf(source), patches };
fs.writeFileSync(path.join(__dirname, '../dictionary/chat-profile.json'), JSON.stringify(profile, null, 2) + '\n');
console.log('已生成聊天界面上下文配置：' + patches.length + ' 处');
