# 第三方组件与许可

本项目自身代码以 MIT 发布（见 [LICENSE](LICENSE)）。下面列出运行时用到的第三方组件、许可证，以及各自的合规义务。

## 运行时依赖

| 组件 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| [acorn](https://github.com/acornjs/acorn) | 8.15.0 | MIT | JavaScript 分词器，用于安全定位界面字符串 |
| [CTranslate2](https://github.com/OpenNMT/CTranslate2) | 4.8.3 | MIT | 本机推理引擎 |
| [SentencePiece](https://github.com/google/sentencepiece) | 0.2.2 | Apache-2.0 | 分词 |
| [NumPy](https://numpy.org/) | 2.4.6 | BSD-3-Clause | CTranslate2 依赖 |
| [PyYAML](https://pyyaml.org/) | 6.0.3 | MIT | CTranslate2 依赖 |
| [CPython](https://www.python.org/) | 3.11.x | PSF-2.0 | 本机运行环境 |

上述 Python 组件由 `准备本机翻译引擎.ps1` 在用户本机通过 pip 安装，本仓库不分发其源码或二进制。

## 翻译模型

**Argos `translate-en_zh-1_9`**

- 作者：Jörg Tiedemann, Santhosh Thottingal
- 论文：*OPUS-MT — Building open translation services for the World*（EAMT 2020）
- 原始 OPUS-MT 模型许可：**Creative Commons Attribution 4.0 (CC-BY 4.0)**
- 来源：<https://data.argosopentech.com/argospm/v1/translate-en_zh-1_9.argosmodel>
- SHA-256：`433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab`

模型**不入库**，由 [`dynamic-engine/download_model.py`](dynamic-engine/download_model.py) 下载并做校验和验证。若要再分发模型副本，必须保留上面的署名信息，并遵守 CC-BY 4.0 的署名要求。详见 [`dynamic-engine/MODEL-LICENSE.md`](dynamic-engine/MODEL-LICENSE.md)。

## 开发依赖（不随发布件分发）

| 组件 | 版本 | 许可证 |
| --- | --- | --- |
| [@vscode/vsce](https://github.com/microsoft/vscode-vsce) | 4.0.0 | MIT |
| [jsdom](https://github.com/jsdom/jsdom) | 30.1.3 | MIT |

## 未随本项目分发的第三方内容

- **微软简体中文语言包**（`MS-CEINTL.vscode-language-pack-zh-hans`，MIT）：本项目只在运行时读取用户**已安装**的语言包文件来扩充词典，不分发、不打包其内容。语言包需用户自行安装。
- **Cursor 应用资源**：本项目不包含 Cursor 的任何代码或资源副本。[`cursor-zh-cn/dictionary/chat-profile.json`](cursor-zh-cn/dictionary/chat-profile.json) 中的 13 个定位锚点是短字符串标识符，仅用于在用户本机的安装文件里定位待替换的界面文案，不含可运行的 Cursor 源码。

## 商标

Cursor 是 Anysphere, Inc. 的商标；Visual Studio Code 与相关语言包归 Microsoft Corporation 所有。本项目与上述公司无隶属关系，也未获得其背书。
