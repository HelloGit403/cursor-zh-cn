> 📣 **催更公众号：潮玩实验室的收藏夹** —— 后续版本和更新都在这儿同步，觉得好用欢迎关注。

# Cursor 中文翻译（简称：cursor-zh-cn）

把 Cursor 的界面和聊天窗口翻成中文。翻译**全部在本机完成**：不联网、不需要 API Key、你的聊天内容不会离开这台电脑。

> 仓库名 `cursor-zh-cn` 是「Cursor 中文翻译」的简称（GitHub 仓库名不支持中文字符）。

- 聊天窗口里新弹出的菜单、弹窗、提示、AI 英文回复，会**边出现边翻**
- 右下角一键切回英文原文，随时对照
- 界面上优先查本地词典（418 条），没收录的交给本机 CTranslate2 模型
- 默认翻译约 9,780 条（本地词典 + 你已安装的微软中文语言包），不需要额外配置

📦 **下载**：[最新版本 Releases](https://github.com/HelloGit403/cursor-zh-cn/releases) —— 不想自己装 Python 就直接下便携包，想从 IDE 命令面板用就下 `.vsix`。

> 本项目与 Cursor / Anysphere、微软均无隶属关系。属于第三方界面补丁，不是 Cursor 官方支持的扩展接口。

## 两种方案

| | 动态翻译 2.1（推荐） | 静态汉化 1.x（legacy） |
| --- | --- | --- |
| 工作方式 | 运行时监听 DOM，持续翻译新内容 | 一次性改写安装目录里的资源文件 |
| 覆盖范围 | 聊天窗口 + AI 回复 | 词典能命中的固定文案 |
| 能否随时还原 | 右下角开关即时切换 | 需要重新运行「还原」并重启 |
| 需要本机 Python | 是（3.10–3.13） | 否 |
| 状态 | 主线 | 保留兼容，不再新增 |

## 动态翻译 2.1（推荐）

### 环境要求

- Windows（已在 Cursor 3.24.18 上验证）
- Python 3.10–3.13
- 首次准备需要联网（下载约 67 MiB 的英→中模型和 Python 依赖），之后完全离线

### 安装

```powershell
# 1. 准备本机翻译引擎：创建 venv、安装 ctranslate2 / sentencepiece、下载校验模型
.\准备本机翻译引擎.ps1 -PythonPath "C:\你的\python.exe"

# 2. 给 Cursor 挂载加载器（会自动备份原文件，可完整卸载）
.\启用动态翻译.cmd
```

3. 完全退出所有 Cursor 窗口，重新打开。
4. 聊天窗口右下角出现 **中文 · 开** 即成功。

### 使用

- 点 **中文 · 开** → 立即恢复插件改过的英文原文；再点 **English · 关** → 恢复自动翻译
- 点 **翻译设置** → 单独开关 AI 回复翻译、重新扫描、编辑自定义词典（保存即生效）
- `Alt+Shift+T` 也可以切换总开关
- 代码块、行内代码、链接、你输入的文本、仓库名/文件名/模型名一律保留原文

其他命令：

```powershell
.\查看动态翻译状态.cmd     # 检查加载器和本机服务
.\卸载动态翻译.cmd         # 还原原始文件，重启后移除
```

模型归属与许可见 [`dynamic-engine/MODEL-LICENSE.md`](dynamic-engine/MODEL-LICENSE.md)。完整说明见 [`动态翻译使用说明.md`](动态翻译使用说明.md)。

## 静态汉化 1.x（legacy）

适合从 IDE 命令面板操作的场景，不依赖 Python：

1. 用 VS Code / Cursor 打开本目录，执行 `cd cursor-zh-cn && npm ci && npm run package` 生成 VSIX
2. 在 Cursor 里 `Ctrl+Shift+X` → `…` → **Install from VSIX…**
3. `Ctrl+Shift+P` 运行 **Cursor 汉化: 应用汉化**
4. 完全退出并重启 Cursor

命令列表、自定义词典格式、备份位置、升级与回滚细节，见 [`cursor-zh-cn/README.md`](cursor-zh-cn/README.md)。

独立聊天窗口的旧版一键工具见 [`使用步骤.md`](使用步骤.md)。

## 隐私与安全

这是本项目的设计重点，不是事后补的：

- 翻译服务只监听 `127.0.0.1`，不对外暴露
- 请求必须携带 32 字节随机 Bearer token，比较用 `hmac.compare_digest`
- 校验 `Origin` 白名单，拒绝其他网页发起的跨站请求
- 请求体上限 100 KB、单次最多 12 段文本，防止被当成通用代理
- 服务不记录任何请求文本，`BaseHTTPRequestHandler` 的日志被关掉
- Python 以 `-I` 隔离模式启动
- 唯一的外网访问发生在「准备引擎」阶段（pip + 模型下载），运行期无外网请求

## 兼容性

- 已在 **Windows / Cursor 3.24.18** 实测：真实聊天窗口的动态菜单翻译、右下角按钮、AI 正文翻译
- 通过真实资源副本的安装、重复安装、逐字节卸载测试
- macOS / Linux 未实测；动态引擎含 Windows 专用进程检测（Toolhelp32）
- Cursor 更新可能覆盖加载器，更新后重新运行启用工具即可
- 部分自绘界面、嵌入网页、中英混排、分段的提示可能未覆盖

## 目录结构

```
.
├── README.md                    # 本文件
├── LICENSE                      # MIT
├── 启用动态翻译.cmd / 卸载动态翻译.cmd / 查看动态翻译状态.cmd
├── 准备本机翻译引擎.ps1          # 建 venv + 装依赖 + 下模型
├── 动态翻译使用说明.md
├── dynamic-launch.ps1           # 上面三个 cmd 的实际实现
├── chat-localize.ps1            # 静态方案入口
├── 聊天界面汉化.cmd / 还原聊天界面.cmd / 预览聊天界面汉化.cmd
├── 使用步骤.md                   # 静态方案说明（legacy）
├── cursor-zh-cn/                # VSIX 扩展 + 动态引擎的 Node 部分
│   ├── src/                     # extension / manager / patcher / dynamic-*
│   ├── dictionary/              # 418 条词典 + 上下文补丁
│   └── tools/                   # 测试、打包、集成脚本
└── dynamic-engine/              # 本机翻译服务
    ├── server.py                # 回环 HTTP 服务（CTranslate2）
    ├── download_model.py        # 下载并校验 Argos 模型
    └── test_lifecycle.py        # 生命周期单测
```

`dynamic-engine/models/` 和 `dynamic-engine/.venv/` 不入库，分别由 `download_model.py` 和 `准备本机翻译引擎.ps1` 生成。

## 开发与测试

```powershell
# JS：25 个用例（含 jsdom 真实 DOM 动态翻译、逐字节还原、外部篡改拒绝、并发锁）
cd cursor-zh-cn
npm ci
npm test

# Python：8 个生命周期用例
cd ..\dynamic-engine
python -m unittest -v test_lifecycle
```

集成测试需要一个真实的 Cursor 安装：

```powershell
cd cursor-zh-cn
node tools/integration.js "D:\cursor\resources\app" "D:\cursor\Cursor.exe"
```

它会把资源复制到临时目录再跑完整流程，不修改正在使用的安装。

## 已知限制

- 机器翻译，专业术语可能不准；随时用右下角开关看原文
- 只翻译「显示属性」和文本节点，不会碰你的代码、对话历史和输入框
- 上下文补丁要求原始脚本 SHA-256 完全匹配，Cursor 换版本后会跳过这些专用位置，只应用通用词典
- 卸载时只还原本项目写入的改动；若文件被其他工具改过，工具会停止覆盖而不是强写

## 免责声明

本项目通过修改 Cursor 本地安装资源、注入启动加载器的方式实现界面汉化。**这可能与 Cursor 的最终用户许可协议冲突**，是否使用请自行判断，风险由使用者承担。项目不对因此导致的账号、数据或软件损坏负责。请先备份，并优先在非生产环境试用。

## 许可证

代码以 [MIT](LICENSE) 发布。英→中翻译模型为 Argos / OPUS-MT 的 CC-BY 4.0 授权内容，署名见 [`dynamic-engine/MODEL-LICENSE.md`](dynamic-engine/MODEL-LICENSE.md)。第三方依赖见 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。
