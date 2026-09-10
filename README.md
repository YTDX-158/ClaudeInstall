# ClaudeInstall 一键安装器 v0.4.1

给国内小白的一键安装器：**自动装 Node + Git + Claude Code → 填一个 key → 直接能用**。
不弹登录、不用手改任何配置文件。

> 一句话：把「装 Claude Code + 接 DeepSeek」从 UP 主教程的 8 步手动，压成 3 步（其中 2 步自动）。

## 目录结构

```
ClaudeInstall/
├── ClaudeInstall一键安装.bat   # 启动器：检测 Node → 没有则自动下载静默装 → 再调 install.js
├── scripts/
│   ├── install.js          # 核心脚本：检测 → Git → npm镜像 → 装 claude → 填 key → 写配置 → 验证
│   └── lib/
│       ├── config.js       # 接口A 配置读写契约
│       ├── detect.js       # 接口B 环境检测契约
│       ├── download.js     # 接口C 多源下载（主源→备用→校验→重试）
│       └── gitInstall.js   # Git 环境准备（检测→下载→静默装→完整路径验证）
├── Git接入方案_v0.2.txt     # v0.2 设计定稿（含 13 条排雷对策）
└── README.md
```

## 快速开始

```bash
# 方式一：双击（推荐给小白）
ClaudeInstall一键安装.bat

# 方式二：命令行（开发/测试）
node scripts/install.js
```

## ⚠️ 安全说明（装之前先看）

本安装器会做三件事，**全程本地运行，不上传任何数据**：
1. 下载并安装 **Node.js**（Claude 的运行底座，约 30MB）
2. 下载并安装 **Git**（给 Claude 提供"查看变更/提交代码"能力，约 50MB）
3. 通过 npm 安装 **Claude Code**，并把你的 API Key 写入本地配置文件

**安装过程中会弹 1~2 次授权窗口（UAC）**，那是 Windows 在问"允许安装软件吗"，点「是」即可。

**下载的安装包会先验数字签名**：Node / Git 下载完成后、安装前会校验签名（确认来源没被篡改）。若提示"签名不通过"（极少见，通常是精简系统缺证书），请手动去官网下载安装。

**杀毒软件可能提示**：本安装器会自动下载并执行安装程序，行为与常见软件安装器一致。若被杀软拦截，请选择"允许/信任"，或先手动装好 Node 和 Git 再运行本安装器。

**⚠️ 重跑会改写接入配置**：若你之前已手动配置过 Claude（如改用其他中转/模型），本安装器会把 `~/.claude/settings.json` 的接入信息（Base URL / Key / 模型）覆盖为默认的 DeepSeek。已自定义配置的用户重跑前请先自行备份 `~/.claude/settings.json`（安装器会留 `.bak`，但只保留第一次的原样）。

## 参数（install.js）

| 参数 | 说明 |
|---|---|
| `--key sk-xxx` | 直接给 API Key（跳过交互提问） |
| `--provider deepseek` | 中转服务商（默认 deepseek，可扩展） |
| `--dry-run` | 干跑：只打印要做什么，不改任何文件 |
| `--config-dir <目录>` | 指定配置目录（测试用；默认真实 `~/.claude*`） |
| `--skip-install` | 跳过 npm 装 claude-code |
| `--skip-registry` | 跳过设置 npm 镜像 |
| `--verify` | 装完用 `claude -p` 实测连通 |

## 工作原理（自动写配置）

安装器完成时自动改两个文件（**合并写入，绝不覆盖其他字段；先备份 .bak**）：

| 文件 | 写入 | 作用 |
|---|---|---|
| `~/.claude/settings.json` 的 `env` | `AUTH_TOKEN` + `BASE_URL` + `MODEL` | 有凭证，不要求登录账号 |
| `~/.claude.json` | `hasCompletedOnboarding: true` | 跳过首次引导界面 |

> 注：默认会开 `permissions.defaultMode = acceptEdits`（AI 可直接改文件，小白体验）。不需要可在 `~/.claude/settings.json` 里改掉。

## 常见报错对照表

| 现象 | 原因 | 处理 |
|---|---|---|
| 验证那步提示"连通失败 ①" | API Key 无效 / 复制漏了字符 | 重跑，核对 key |
| 提示"连通失败 ②" | 网络不通 / 需要代理 | 检查网络 |
| 提示"连通失败 ③" | DeepSeek 账户余额不足 | 到 platform.deepseek.com 充值 |
| 装完 `claude` 命令找不到 | 当前窗口 PATH 未刷新 | 关闭命令行，重开一个再输入 claude |
| bat 双击没反应 | 系统阻止了"来自其他电脑"的文件 | 右键该文件 → 属性 → 勾选"解除阻止" |
| Git 下载失败黄警 | 网络/镜像问题 | 手动装 Git 后重跑即可跳过 |

## 接口预留（ClaudeInstall × ClaudeNeko 联动契约）

为未来联动预埋两个接口（只定型契约，不实现联动功能，启动契约放第二波）：

**🔌 接口 A：配置读写契约** — `scripts/lib/config.js`
统一操作 `~/.claude` 配置：`writeEnv` / `setOnboarding` / `isConfigured` / `readJson` / `writeJson`
> ClaudeNeko 侧对应 `server/lib/configService.js`，读写同一套文件

**🔌 接口 B：环境检测契约（Env Report）** — `scripts/lib/detect.js`
`node install.js --detect-json` 输出标准 JSON（schemaVersion 1）
> ClaudeNeko 侧对应 `GET /api/env`，输出同结构

```json
{ "schemaVersion": 1, "node": {"present","version"}, "npm": {...},
  "claude": {...}, "config": {"path","configured","provider","model"},
  "claudeNeko": {"present","path"} }
```

契约约定：
- `provider`：BASE_URL 域名映射表推导（deepseek/qwen/volcengine），未知 → `"custom"`
- `claudeNeko.present`：常用目录存在即视为已装（无副作用，不启动服务）

## 版本策略

| 组件 | 策略 |
|---|---|
| Node.js | 检测 → 已装够用跳过；缺 → 自动下载**固定 v22.20.0**（curl 实时进度；主源 npmmirror / 备源 nodejs.org），**装前验签名**（无效即拒装），`/qb` 进度小窗安装 |
| Git | 检测 → 已装跳过；缺 → 自动下载固定 2.46.0（实时进度；npmmirror），**装前验签名**（个人证书签名，失败黄警提示手动装、不阻塞） |
| Claude Code | npm 装最新稳定版 |

## 测试记录

- 2026-08-28 v0.1：dry-run ✅ / 真实写配置（临时目录）✅ / Windows `.cmd` shell bug 修复 ✅
- 2026-09-01 v0.2：实现完成 · 语法全过 ✅ · dry-run 全流程 ✅ · 接口B detect-json ✅ · 隔离目录写配置+`.bak` ✅ · 本机 Git 检测 skipped ✅；**虚拟机真机验证（待做）**
- 2026-09-05：全面改名 ClaudeNeko→**ClaudeInstall**（banner/bat/README/说明全改，接口契约与 ClaudeNeko 检测保留）✅ · **排雷三轮**：①修雷1 bat 管理员提权、雷2 findClaude() 防 PATH 未刷新误报、雷3 Git UAC 预告+超时缩短、雷4 README 覆盖说明、雷5 download 重定向上限、雷6 askKey 空输入退出；②修雷11 提权重启透传参数、雷17 Node 刚装完 PATH 未刷新致 install.js 误判缺 Node（execPath 兜底+bat PATH 注入双保险）、雷13 download 写流错误监听；③修雷18 verify 参数中文/引号经 cmd 破坏（改 `-p hi` 单 token）、雷19 老 Node(<18) 装上跑不动（bat 自动升级+install.js 拦截，PowerShell 判版本避开 cmd ^ 转义坑）；雷7~10/12/14/15/20 记入 `排雷记录_2026-09-05.txt` 待 M3 对照 ✅
- 2026-09-05 **M2 打 exe** ✅：`ClaudeInstall安装器.iss` 全中文向导（欢迎→填 key→安装→完成），编译产物 `dist_installer\ClaudeInstall安装器_v0.2.exe`（admin 一次 UAC，收 key → 调 bat --silent 完成真实安装）· **雷21（重大）**：bat 此前从未真实跑过——UTF-8无BOM+LF+中文+括号块 → cmd 必崩；已根治（全英文+CRLF+goto 标签化），bat silent+dry-run 实测 exit 0 ✅

- 2026-09-06 **v0.2.1 安装全程可见** ✅：Node 固定 v22.20.0（curl 实时进度 + 双源）+ Node/Git 装改 `/qb` `/SILENT` 进度小窗 + Git 下载 `[下载中 x/y MB (pct%)]` 实时刷新 + 阶段中文预告（commit e3bab20）
- 2026-09-06 **v0.2.2 安全加固 + 瘦身** ✅：装前 **Authenticode 验签**（Node 红停 / Git 黄警降级）+ key 白名单校验（iss 手写循环 + install.js，防 cmd 注入/粘贴带杂质）+ npm 安装 600s 超时提示 + bat 下载前清半截残留 + 删 download.js 死代码 + 删 detect.js 硬编码开发者路径 + 文档同步
- 2026-09-06 **v0.2.2-fix** ✅：修复 download 302 重定向**挂起**（registry→CDN 改串行跟随 + 递归带进度回调，302 实测下载通过、进度不丢）+ Git 下载断流容忍 120s→600s + banner 版本对齐 + 过时注释清理
- 2026-09-10 **v0.3 新手引导向导页** ✅：欢迎页后插 3 页带图引导（页A cmd 引导·双图并排 / 页B DeepSeek 注册 / 页C 充值+拿key），配图 4 张 BMP 放 `assets/`（Inno `TBitmapImage` 只吃 BMP 不吃 PNG）；填 Key 页副标题改为指向前两页（commit cace0cb）
- 2026-09-10 **GitHub Release v0.3 发布** ✅：本仓库首个 Release（https://github.com/YTDX-158/ClaudeInstall/releases/tag/v0.3），资产 `ClaudeInstall-Setup-v0.3.exe`（2.24MB）。⚠️ 注意：**GitHub Release 资产名不支持中文**——必须先复制成英文名再上传，否则会被转义成乱码
- 2026-09-10 **v0.4.1** ✅：完成页按钮指向**蓝奏云网盘**（https://wwbkn.lanzoum.com/b01giav0pi，国内直连免登录）+ 按钮下加一行「下载密码：YTDX666」；另：冒烟模式（CI_SMOKE=1）跳过 key 校验，便于自动化验证向导全流程
- 2026-09-10 **v0.4 推广入口** ✅：向导**完成页**加「获取 ClaudeNeko（图形界面版）」按钮（可点击 → 用默认浏览器打开 ClaudeNeko 的下载页），作为 ClaudeInstall → ClaudeNeko 的引流入口（CI 定位=Neko 前置）

## 下一步

- ⬜ **多中转服务商选项**：支持 DeepSeek 以外的中转（`scripts/lib/config.js` 的 provider 映射已预留 qwen / volcengine，接 UI 即可）
- ⬜ **双向互装**：与 ClaudeNeko 互相检测 + 可选安装引导（配置打通已无需做）—— 等 ClaudeNeko 权限 P1 落地 + 真发人时整条做
- ⬜ **切官方原生包**（触发式）：npm 装 claude 已被官方标记 deprecated，等"npm 装拉不到新版"再动；届时 ClaudeNeko 的 `findClaudeBin`（按 npm 固定路径找 claude.exe）需一并跟改

> **已完成**：exe 手动 UAC 验证（v0.3，含 3 页引导）· 真机验证（9-07：Node/Git 自动装 + UAC 预告 + 配置写对）· GitHub Release v0.3 / v0.4 / v0.4.1 · **网盘分发**（9-10：蓝奏云**文件夹分享**，链接固定 + 免登录下载，用于推广入口）
