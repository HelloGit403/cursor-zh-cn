# Cursor 汉化（简体中文）

## 动态翻译 2.1（当前推荐）

当前实现已改为聊天窗口运行时动态翻译，支持界面变化和 AI 英文回复自动翻译，右下角开关即时恢复原文。使用工作区中的 `启用动态翻译.cmd`；完整步骤见 `动态翻译使用说明.md`。

本机已将独立 Python、模型和翻译服务整合进 Cursor 的用户数据目录，启动随 Cursor 自动加载，退出随 Cursor 进程结束而停止。正常运行不依赖桌面工具目录。此为本地集成，官方更新仍可能覆盖应用内加载器。

动态引擎使用 MutationObserver、本地词典和本机 CTranslate2 服务；首次安装挂载启动加载器，之后持续监听页面。它属于第三方运行时插件，不是官方扩展 API 能直接提供的 DOM 功能。普通 VSIX 及下述 1.x 静态方案已不作为聊天窗口的推荐路径。

## 聊天界面直接汉化（1.1.0）

> 预构建的 `.vsix` 和 `.zip` 不随仓库分发，请到本项目的 [GitHub Releases](https://github.com/HelloGit403/cursor-zh-cn/releases) 页面下载，或按下方「从源码构建」自行打包。

如果你使用的是独立聊天窗口（Agents Window），直接使用 `Cursor聊天界面汉化-1.1.0.zip`，完整解压后双击 **聊天界面汉化.cmd**。无需进入 IDE，无需安装 VSIX，也无需单独安装 Node.js。完成后保存工作、完全退出所有 Cursor 窗口，再重新打开聊天界面。

这一方式处理聊天窗口脚本和本地化消息，不修改 IDE 主脚本。新增侧栏的自动化、自定义、代码仓库、快速入门、连接 GitHub、规划新想法，以及首页的从头开始、本机和输入框提示等译文。对于本机 3.24.18 构建，使用 13 处经核对的上下文补丁补充通用替换无法覆盖的显示常量；上下文补丁要求原始脚本 SHA-256 完全匹配，其他构建会跳过这些专用位置。

运行 **预览聊天界面汉化.cmd** 可预览；运行 **还原聊天界面.cmd** 可恢复。工具与 VSIX 共用版本隔离备份。聊天记录、代码仓库名、模型名称、AI 回复与服务端动态文案不会自动翻译；页面仍可能有英文。

下面的 VSIX 安装方式适合希望从 IDE 命令面板使用本插件的用户。

这是一个本地安装的第三方 Cursor 扩展，补充翻译 Cursor 部分对话、设置、菜单和按钮文案。支持预览、应用、检查状态以及还原。

使用 IDE 时建议搭配微软的 **Chinese (Simplified) Language Pack for Visual Studio Code**：语言包负责基础编辑器界面，本插件补充词典命中的 Cursor 界面。独立聊天窗口可以直接使用上述工具。内置 418 条词典，不保证每个页面都完全汉化。不会翻译你的代码、对话内容或 AI 回答。

## 安装和使用

1. 打开 **Cursor**，按 `Ctrl+Shift+X` 打开扩展面板。
2. 点击扩展面板右上角的 `…`，选择 **Install from VSIX… / 从 VSIX 安装…**，选中 `cursor-zh-cn-*.vsix`（GitHub Releases 下载，或 `npm run package` 自行生成）。
3. 按 `Ctrl+Shift+P`，运行 **Cursor 汉化: 安装基础中文语言包**。安装发布者为 **Microsoft / MS-CEINTL** 的简体中文语言包。
4. 再按 `Ctrl+Shift+P`，运行 **Configure Display Language / 配置显示语言**，选择 **简体中文 / zh-cn**，按提示重新启动。
5. 按 `Ctrl+Shift+P`，输入 **Cursor 汉化**，先运行 **预览汉化**，查看可以翻译多少处。
6. 运行 **Cursor 汉化: 应用汉化**，等待完成。
7. 保存工作，**完全退出所有 Cursor 窗口，再重新启动 Cursor**。

macOS 对应快捷键是 `Cmd+Shift+X` 和 `Cmd+Shift+P`。此版在 Windows 上验证，其他系统尚未实测。远程工作区中扩展应安装在本地 UI 一侧。

如果安装完成后找不到命令，确认当前窗口是 Cursor，并且扩展已启用、文件夹已信任；再运行 **Developer: Reload Window / 开发人员: 重新加载窗口**。

## 命令

| 命令 | 用途 |
| --- | --- |
| Cursor 汉化: 预览汉化 | 检查词典命中并校验待修改脚本，不修改安装文件 |
| Cursor 汉化: 应用汉化 | 备份原始文件后写入译文 |
| Cursor 汉化: 查看汉化状态 | 显示当前版本、备份路径和文件是否一致 |
| Cursor 汉化: 还原英文 | 还原此插件对当前版本的修改，保留已安装的基础语言包 |
| Cursor 汉化: 安装基础中文语言包 | 打开微软简体中文语言包的搜索结果 |
| Cursor 汉化: 使用说明 | 打开本说明 |

具体翻译数量和错误信息可在 **输出 → Cursor 汉化** 查看。

## 还原与升级

恢复本插件修改：运行 **Cursor 汉化: 还原英文**，完成后完全退出并重新打开 Cursor。若还要将编辑器基础界面改回英文，另外运行 **Configure Display Language**，选择 **English / en**。

卸载扩展前先运行还原。**仅卸载或禁用插件不会撤销已写入的汉化。**

Cursor 更新后，运行 **查看汉化状态**，再为新版本执行 **预览汉化 → 应用汉化**。插件按安装路径和构建版本隔离备份，旧版本的备份不能用于还原新版本。

备份保存在 Windows 用户目录的 `.cursor-zh-cn/v2` 下，例如 `C:/Users/你的用户名/.cursor-zh-cn/v2`；状态输出会给出当前备份的完整路径。保留备份直到完成还原。

如果文件已被其他工具改动、原始备份丢失或资源格式不兼容，插件会停止操作并说明原因。此时可通过 Cursor 安装程序修复或重新安装，再尝试汉化。

## 设置和自定义词典

设置界面搜索 `cursorZh`。

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `cursorZh.appRoot` | 空 | 自动识别 Cursor。识别失败时指定安装目录下的 `resources/app` |
| `cursorZh.dictionaryFile` | 空 | 自定义 JSON 词典的绝对路径；条目叠加到内置词典，同名条目覆盖译文 |
| `cursorZh.includeHardcoded` | `true` | 补充翻译界面脚本中明确的显示属性；关闭则只处理 NLS 消息 |

本机安装目录示例为 `D:/cursor/resources/app`。所有设置均为机器级设置，项目中的 `.vscode/settings.json` 不能替你指定自定义词典。

自定义词典示例：

```json
{
  "New Chat": "新建聊天",
  "Privacy Mode": "隐私模式"
}
```

修改词典后再次运行 **应用汉化**，插件会基于备份原文重新生成译文；恢复英文仍可使用最初备份。字符串匹配区分大小写，译文必须保留 `{0}` 等占位符。脚本只翻译支持的显示属性，添加词条不代表所有出现位置都会被替换。

## 兼容性和实现

这是修改本地界面资源的补丁扩展，会更改安装目录中的 NLS 消息、匹配的 workbench 脚本及相关 `product.json` 校验值。普通扩展 API 不能直接重写 Cursor 自身所有界面文本，因此补充汉化需要使用资源补丁。插件不联网调用翻译服务，不需要 API Key；安装基础语言包需要网络。

处理脚本时使用 JavaScript 分词器，仅匹配词典内、明确位于标签、标题、占位提示等显示属性中的字符串，跳过任意赋值、比较、对象键、注释、正则和模板文本。写入前先完成全部目标文件的规划与语法校验，再保存原始备份；写入失败会尝试回滚。

当前已在本机 **Cursor 3.24.18 / Windows** 的资源文件上完成预览，并在临时副本中通过应用、重复应用、状态检查、逐字节还原测试。聊天窗口模式命中 **1,761 处**，分布于 **2 个文件**；这表示可替换的位置数，不是界面总覆盖率，也不是实际页面逐项验收结果。未来版本需要重新预览验证。

权限错误 `EACCES` / `EPERM`：安装路径受系统保护时，以管理员身份启动 Cursor 后重试。预览也需要对用户备份目录有写权限以建立操作锁。

## 从源码构建（开发者）

```powershell
npm ci
npm test
npm run verify -- --app-root=D:/cursor/resources/app
npm run package
```

`verify` 默认仅预览，不修改安装文件。开发者可添加 `--apply`、`--restore` 或 `--status`；命令行与插件共享同一引擎和备份记录。

完整副本集成测试：

```powershell
node tools/integration.js D:/cursor/resources/app D:/cursor/Cursor.exe
```

该测试将支持的资源复制到临时目录，再使用 Cursor 自带 Electron 的 Node 运行模式运行插件工作进程，检查应用与还原；不会修改正在使用的安装文件。

打包与 VSIX 安装流程参考：[VS Code 官方扩展打包文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。Cursor 扩展说明参考：[Cursor 官方扩展文档](https://prod.cursor.com/help/customization/extensions)。

本项目与 Cursor / Anysphere 及 Microsoft 无隶属关系。
