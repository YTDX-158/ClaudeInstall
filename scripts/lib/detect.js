/**
 * scripts/lib/detect.js — 环境检测契约（接口 B，Env Report）
 * ========================================================
 * ClaudeInstall --detect-json 与 ClaudeNeko GET /api/env 输出同一结构。
 *
 * Env Report（schemaVersion 1）：
 * {
 *   schemaVersion: 1,
 *   node:       { present, version },
 *   npm:        { present, version },
 *   claude:     { present, version },
 *   config:     { path, configured, provider, model },
 *   claudeNeko: { present, path },
 * }
 *
 * 约定：
 *   - provider：由 BASE_URL 域名按映射表推导，未知 → "custom"
 *   - claudeNeko.present：常用目录存在即视为已装（无副作用，不启动服务）
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { settingsPath, isConfigured } = require('./config.js');

// ---------- 版本探测 ----------
function versionOf(cmd) {
  // PATH 优先（尊重用户自定义）
  const viaPath = runVer(cmd + ' --version');
  if (viaPath) return viaPath;
  // 兜底（雷17）：bat 刚装完 Node，当前窗口 PATH 未刷新
  // → 本进程正跑在 node 上，从它的目录推 node.exe / npm.cmd
  if (!process.execPath) return null;
  const nodeDir = path.dirname(process.execPath);
  if (cmd === 'node') return runVer('"' + process.execPath + '" --version');
  if (cmd === 'npm') {
    const npmShim = path.join(nodeDir, 'npm.cmd');
    if (fs.existsSync(npmShim)) return runVer('"' + npmShim + '" --version');
  }
  return null;
}

// 执行 `xxx --version` 并取干净输出；失败返回 null
function runVer(cmdLine) {
  const r = spawnSync(cmdLine, {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim();
}

// ---------- provider 推导 ----------
// 已知中转域名 → provider；未知 → custom
const PROVIDER_TABLE = [
  ['api.deepseek.com', 'deepseek'],
  ['dashscope.aliyuncs.com', 'qwen'],
  ['ark.cn-beijing.volces.com', 'volcengine'],
];

function detectProvider(baseUrl) {
  if (!baseUrl) return null;
  for (const [domain, name] of PROVIDER_TABLE) {
    if (baseUrl.includes(domain)) return name;
  }
  return 'custom';
}

// ---------- ClaudeNeko 检测 ----------
// v0.2.2（D2）：不再内置开发者本机路径（分发给小白永远 false 且暴露目录痕迹），
// 只认环境变量 CLAUDE_NEKO_DIR（设置了才探测）；ClaudeNeko 侧 /api/env 是独立实现，不受影响
function detectNeko() {
  const extra = process.env.CLAUDE_NEKO_DIR;
  if (!extra) return { present: false, path: null };
  return fs.existsSync(extra) ? { present: true, path: extra } : { present: false, path: null };
}

// ---------- Env Report ----------
function detectEnv(home) {
  const nodeVer = versionOf('node');
  const npmVer = versionOf('npm');
  const claudeVer = versionOf('claude');

  let env = {};
  try {
    env = JSON.parse(fs.readFileSync(settingsPath(home), 'utf-8')).env || {};
  } catch { /* 配置不存在或损坏 → 空 env */ }

  return {
    schemaVersion: 1,
    node: { present: !!nodeVer, version: nodeVer },
    npm: { present: !!npmVer, version: npmVer },
    claude: { present: !!claudeVer, version: claudeVer },
    config: {
      path: path.join(home || os.homedir(), '.claude'),
      configured: isConfigured(home),
      provider: detectProvider(env.ANTHROPIC_BASE_URL),
      model: env.ANTHROPIC_MODEL || null,
    },
    claudeNeko: detectNeko(),
  };
}

module.exports = { detectEnv, detectProvider, detectNeko, versionOf };
