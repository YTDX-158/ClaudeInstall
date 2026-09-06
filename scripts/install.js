#!/usr/bin/env node
/**
 * ClaudeInstall 一键安装器 · 核心脚本 v0.2
 * =====================================
 * 目标：把「装 Claude Code + 接 DeepSeek」压成一条命令。
 *   检测 Node → 设国内 npm 镜像 → 装 claude-code → 填 key → 自动写配置（跳过登录）→ 验证
 *
 * 用法：
 *   node install.js                          # 交互式（提示填 key）
 *   node install.js --key sk-xxx             # 命令行直接给 key
 *   node install.js --provider deepseek      # 中转服务商（默认 deepseek，可扩展）
 *   node install.js --dry-run                # 只打印要做什么，不改任何文件
 *   node install.js --config-dir <目录>      # 指定配置目录（测试用；默认真实 ~/.claude*）
 *   node install.js --skip-install           # 跳过 npm 装 claude-code
 *   node install.js --skip-registry          # 跳过设置 npm 镜像
 *   node install.js --verify                 # 装完用 claude -p 实测连通
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const config = require('./lib/config.js');
const detect = require('./lib/detect.js');
const gitInstall = require('./lib/gitInstall.js');

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(name);
const KEY = flag('--key');
const PROVIDER = flag('--provider') || 'deepseek';
const CONFIG_DIR = flag('--config-dir');
const DRY_RUN = has('--dry-run');
const SKIP_INSTALL = has('--skip-install');
const SKIP_REGISTRY = has('--skip-registry');
const VERIFY = has('--verify');
const DETECT = has('--detect-json');

// ---------- 中转服务商表（扩展：加一行即可） ----------
const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    model: 'deepseek-v4-flash[1m]',
    keyHint: '去 platform.deepseek.com 创建 API Key（key 只显示一次，务必复制保存）',
  },
  // 预留：豆包 / 通义 / 其他 Anthropic 兼容接口
};
const prov = PROVIDERS[PROVIDER] || PROVIDERS.deepseek;

// ---------- 目标路径（--config-dir 覆盖，测试用） ----------
const HOME = CONFIG_DIR ? path.resolve(CONFIG_DIR) : os.homedir();

// ---------- 输出 ----------
const C = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', b: '\x1b[36m', z: '\x1b[0m' };
const ok = (m) => console.log(`${C.g}✅ ${m}${C.z}`);
const warn = (m) => console.log(`${C.y}⚠️  ${m}${C.z}`);
const err = (m) => console.log(`${C.r}❌ ${m}${C.z}`);
const info = (m) => console.log(`${C.b}ℹ️  ${m}${C.z}`);
const say = (m) => console.log(`   ${m}`);

// ---------- 工具函数 ----------
function run(cmd, cmdArgs, opts = {}) {
  if (DRY_RUN) {
    info(`[dry-run] 将执行: ${cmd} ${cmdArgs.join(' ')}`);
    return { status: 0 };
  }
  const r = spawnSync(cmd, cmdArgs, {
    shell: process.platform === 'win32', // Windows 下 npm 等是 .cmd，需要 shell
    stdio: 'inherit',
    ...opts,
  });
  // L3：超时转译——Windows 下 .cmd 超时只杀顶层，npm 的子 node 可能残留继续装；
  // 返回 timedout 标记，调用方提示"可能已装好，重跑会自动跳过"（幂等兜底）
  if (r.error && r.error.code === 'ETIMEDOUT') return { status: -1, timedout: true };
  return { status: r.status };
}

function versionOf(cmd) {
  // 版本探测已抽到 lib/detect.js（接口 B 共用）
  return detect.versionOf(cmd);
}

function getOut(cmd, args) {
  // 只读命令取输出（如 npm config get registry），不改状态
  const r = spawnSync(cmd, args, {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

function findClaude() {
  // 1) PATH 里直接找（versionOf 返回版本串，找不到返回 null）
  const ver = detect.versionOf('claude');
  if (ver) return { found: true, version: ver };
  // 2) PATH 没刷新：npm 全局 bin 目录常见位置探测（npm install -g 默认落这里）
  //    注意 npm 全局 root 因前缀而异，取 `npm prefix -g` 更稳，但此刻可能连 node 都刚装完
  const globals = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'claude.cmd') : null,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'claude.cmd'),
  ].filter(Boolean);
  for (const p of globals) {
    if (fs.existsSync(p)) return { found: true, version: '（位于 ' + p + '）' };
  }
  return { found: false, version: null };
}

function askKey() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  请输入你的 ${prov.label} API Key：\n   （${prov.keyHint}）\n   （在窗口里【右键】= 粘贴，Ctrl+V 有时无效）\n  > `, (ans) => {
      rl.close();
      resolve((ans || '').trim());
    });
  });
}

function askConfirm(msg) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${msg}（回车确认 / 输入 n 重输）：`, (ans) => {
      rl.close();
      resolve(!/^n/i.test((ans || '').trim()));
    });
  });
}

// 粘贴 key 后回显末尾几位，让用户确认没复制错（防 key 打错导致白装）
// 空输入/否定循环 3 次 → 给提示后退出，避免小白卡死在交互里（雷6）
async function askKeyWithConfirm() {
  let blanks = 0;
  for (;;) {
    const key = await askKey();
    if (!key) {
      blanks++;
      if (blanks >= 3) {
        console.log('\n  ⚠️ 连续 3 次未收到 key，安装已取消。\n    重新运行安装器，在提示处【右键】粘贴你的 API Key 即可。');
        return null;
      }
      console.log('  （未收到内容，请把 key 粘贴进来：在窗口里【右键】= 粘贴）\n');
      continue;
    }
    const tail = key.slice(-4);
    if (await askConfirm(`已收到 key（末尾 ${tail}）`)) return key;
  }
}

// readJson / writeJson 已抽到 lib/config.js（接口 A，合并写入 + 备份）

/** R2b：key 白名单校验（宽容：字母数字 + 下划线/点/连字符；禁空格/引号/& | < > 等 cmd 危险字符；不强制前缀） */
function isValidKey(k) {
  return typeof k === 'string' && k.length > 0 && k.length <= 300 && /^[A-Za-z0-9_.-]+$/.test(k);
}

// ---------- 主流程 ----------
async function main() {
  // --detect-json：只输出环境报告（接口 B），不做任何安装动作
  if (DETECT) {
    console.log(JSON.stringify(detect.detectEnv(HOME), null, 2));
    return;
  }

  console.log('');
  console.log('┌──────────────────────────────────────────────┐');
  console.log('│  ClaudeInstall 一键安装器 v0.2             │');
  console.log(`│  装 Claude Code + 接入 ${prov.label}${' '.repeat(20 - prov.label.length)}│`);
  console.log('└──────────────────────────────────────────────┘');
  if (DRY_RUN) warn('干跑模式（--dry-run）：只打印要做什么，不改任何文件');
  say(`配置文件目录: ${HOME}`);

  // ---- ① 环境检测 ----
  console.log('\n── ① 环境检测 ──');
  const nodeVer = versionOf('node');
  const npmVer = versionOf('npm');
  const claude = findClaude();
  const claudeVer = claude.found ? claude.version : null;
  nodeVer ? ok(`Node.js ${nodeVer}`) : warn('未检测到 Node.js');
  npmVer ? ok(`npm ${npmVer}`) : warn('未检测到 npm');
  const gitOk = gitInstall.hasGit();
  gitOk ? ok('Git 已就绪') : info('未检测到 Git（稍后自动安装）');
  claudeVer ? ok(`Claude Code ${claudeVer}（已装，跳过安装）`) : info('未检测到 Claude Code（稍后安装）');

  if (!nodeVer || !npmVer) {
    err('缺少 Node.js 运行环境。请运行「ClaudeInstall一键安装.bat」自动安装，或手动到 https://nodejs.org 下载 LTS 版。');
    process.exitCode = 1;
    return;
  }

  // 雷19：Claude Code 要求 Node 18+，老版本装上也会跑不动 → 装前先拦
  const nodeMajor = parseInt((nodeVer.match(/v?(\d+)/) || [])[1], 10);
  if (nodeMajor && nodeMajor < 18) {
    err(`检测到 Node.js ${nodeVer}，但 Claude Code 需要 Node 18+。`);
    err('请先升级 Node：运行「ClaudeInstall一键安装.bat」自动装新版，');
    err('或手动到 https://nodejs.org 下载最新 LTS 版。升级后再重跑本安装器。');
    process.exitCode = 1;
    return;
  }

  // ---- ①.5 环境准备 · Git ----
  console.log('\n── ①.5 环境准备 · Git ──');
  if (DRY_RUN) {
    info('[dry-run] 将检测 Git，缺失则下载并静默安装（会弹一次授权窗口）');
  } else if (!gitOk) {
    ok('未检测到 Git，开始下载 Git 安装包（约 50MB，下载有实时进度）…');
    info('下载完会自动弹出「用户账户控制」授权窗口，请点「是」；随后会出现安装进度小窗。');
    const g = await gitInstall.ensureGit();
    if (g.action === 'skipped') ok('Git 已就绪');
    else if (g.action === 'installed') ok('Git 安装完成');
    else warn(g.error);
  } else {
    ok('Git 已就绪，跳过');
  }

  // ---- ② 国内 npm 镜像（尊重已有配置，不覆盖用户自定义）----
  if (SKIP_REGISTRY) {
    info('--skip-registry：跳过 npm 镜像设置');
  } else {
    console.log('\n── ② 设置国内 npm 镜像（加速安装）──');
    const currentRegistry = getOut('npm', ['config', 'get', 'registry']);
    if (currentRegistry && currentRegistry.includes('npmmirror')) {
      ok('npm 镜像已是 npmmirror，跳过');
    } else if (currentRegistry && !currentRegistry.includes('registry.npmjs.org')) {
      info(`检测到已有自定义镜像：${currentRegistry}，保留你的设置`);
    } else {
      const r = run('npm', ['config', 'set', 'registry', 'https://registry.npmmirror.com']);
      if (r.status === 0) ok('npm 镜像已设为 npmmirror（国内加速）');
      else warn('设置镜像失败，可稍后手动执行：npm config set registry https://registry.npmmirror.com');
    }
  }

  // ---- ③ 安装 Claude Code ----
  console.log('\n── ③ 安装 Claude Code ──');
  if (claudeVer) {
    ok(`已检测到 Claude Code ${claudeVer}，跳过安装`);
  } else if (SKIP_INSTALL) {
    info('--skip-install：跳过安装（用于测试）');
  } else {
    info('正在通过 npm 安装 Claude Code（最新稳定版，约 1-3 分钟）…');
    const r = run('npm', ['install', '-g', '@anthropic-ai/claude-code'], { timeout: 600000 });
    if (r.status !== 0) {
      err(r.timedout
        ? 'Claude Code 安装超时（网络太慢）。可稍后重跑本安装器——若其实已装好，重跑会自动跳过。'
        : 'Claude Code 安装失败，请检查网络后重试');
      process.exitCode = 1;
      return;
    }
    ok('Claude Code 安装完成');
  }

  // ---- ④ 获取 API Key ----
  console.log('\n── ④ 配置 API Key ──');
  let key = KEY;
  if (!key) {
    if (DRY_RUN) {
      key = '<your-key>';
      info('[dry-run] 此处将提示用户输入 API Key');
    } else {
      key = await askKeyWithConfirm();
    }
  }
  if (!key || key === '<your-key>') {
    err('未提供 API Key，无法继续。用 --key sk-xxx 传入，或在提示时粘贴。');
    process.exitCode = 1;
    return;
  }
  // R2b：key 格式校验（防粘贴带多余字符 + 防 cmd 注入；宽容白名单，不强制前缀）
  if (!isValidKey(key)) {
    err('API Key 格式不正确：只能含字母/数字/下划线/点/连字符，不能有空格、引号或 & | < > 等字符。');
    err('请复制完整 key（形如 sk-xxxx…）后重试，或用 --key 传入。');
    process.exitCode = 1;
    return;
  }
  ok('已获取 API Key（不会明文打印到日志）');

  // ---- ⑤ 写入配置（自动跳过登录引导） ----
  console.log('\n── ⑤ 写入配置（自动跳过登录引导）──');

  // 5a. settings.json：env 写入 baseUrl / authToken / model（走契约 writeEnv）
  if (!DRY_RUN) {
    config.writeEnv(HOME, { baseUrl: prov.baseUrl, authToken: key, model: prov.model });
    // 权限：首次使用让 AI 能自动接受编辑请求（小白体验），已有配置则保留
    const settings = config.readJson(config.settingsPath(HOME));
    settings.permissions = settings.permissions || {};
    settings.permissions.defaultMode = settings.permissions.defaultMode || 'acceptEdits';
    config.writeJson(config.settingsPath(HOME), settings);
    ok(`settings.json 已写入（env 指向 ${prov.label}，备份见 .bak）`);
  } else {
    info(`[dry-run] 将写入 ${config.settingsPath(HOME)}`);
    info(`   env.ANTHROPIC_AUTH_TOKEN = <你的key>`);
    info(`   env.ANTHROPIC_BASE_URL = ${prov.baseUrl}`);
    info(`   env.ANTHROPIC_MODEL = ${prov.model}`);
    info(`   env.ANTHROPIC_DEFAULT_*_MODEL = ${prov.model}`);
    info(`   permissions.defaultMode = acceptEdits（无则设）`);
  }

  // 5b. claude.json：hasCompletedOnboarding = true 跳过首次引导（走契约 setOnboarding）
  if (!DRY_RUN) {
    config.setOnboarding(HOME);
    ok('claude.json 已写入 hasCompletedOnboarding: true（跳过首次引导）');
  } else {
    info(`[dry-run] 将写入 ${config.claudeJsonPath(HOME)} 的 hasCompletedOnboarding: true`);
  }

  // ---- ⑥ 验证 ----
  console.log('\n── ⑥ 验证 ──');
  const claudeFinal = findClaude();
  if (claudeFinal.found && /^v?\d/.test(claudeFinal.version)) {
    // PATH 里能找到 → 真能跑，可实测连通
    ok(`Claude Code 可用：${claudeFinal.version}`);
    if (VERIFY && !DRY_RUN) {
      info('正在实测连通（claude -p，约需几秒）…');
      // 雷18：run() 在 Windows 走 cmd shell 拼接，参数含空格/引号/中文会被二次解析
      // → 必须用纯 ASCII 无空格无引号的单 token（'hi'），否则命令可能被拆坏
      const r = run('claude', ['-p', 'hi']);
      if (r.status === 0) {
        ok('连通测试通过，可以开始使用了');
      } else {
        warn('连通测试未通过。常见原因：');
        warn('  ① API Key 无效或复制漏了字符 → 重跑并核对 key');
        warn('  ② 网络不通（或需要代理）→ 检查网络');
        warn('  ③ DeepSeek 账户余额不足 → 到 platform.deepseek.com 充值');
        warn('  处理完任一项后重跑本安装器即可');
      }
    } else if (VERIFY) {
      info('[dry-run] 将执行 claude -p "hi" 实测连通');
    }
  } else if (claudeFinal.found) {
    // 只在全局 bin 找到 → 已装好，只是当前窗口 PATH 没刷新（雷2 修：不再误报失败）
    warn('Claude Code 已安装完成，但当前窗口还没认出它。');
    warn('  请关闭这个窗口，重新打开命令行，输入 claude 即可使用。');
  } else {
    err('未找到 claude 命令。请关闭并重开命令行，再运行 claude');
  }

  console.log('\n' + '═'.repeat(46));
  ok('全部完成！打开命令行输入 claude 即可开始使用');
  info('首次运行若提示「是否信任此文件夹」，选择「信任」即可。');
  info('如果觉得好用，欢迎请开发者喝杯奶茶 ☕');
  console.log('═'.repeat(46));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
