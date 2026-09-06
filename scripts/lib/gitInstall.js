/**
 * scripts/lib/gitInstall.js — Git 环境准备（ensureGit）
 * =====================================================
 * 检测 Git → 没有则下载（npmmirror 主源）→ 提权静默安装 → 完整路径验证。
 *
 * 关键点（对应方案排雷）：
 *   - 验证用「完整路径 C:\Program Files\Git\cmd\git.exe」而不是 PATH 里的 git
 *     （雷3 PATH 不刷新，当前窗口 `git` 会假失败；安装器 exit code 也不可靠）
 *   - 安装用 PowerShell Start-Process -Verb RunAs 触发 UAC，-Wait 等待完成
 *     （雷1 身份模型：本模块只做"装"，配置写入由 install.js 普通用户身份完成）
 *   - 版本固定写死（方案：固定稳定版，减少脆弱点；更新 = 改下面两行）
 *   - 失败返回 { installed:false, error }，由调用方黄警继续（不阻塞主流程）
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const detect = require('./detect.js');
const dl = require('./download.js');

// ---------- 固定版本（已验证 npmmirror 存在，HTTP 200）----------
const GIT_VERSION = 'v2.46.0.windows.1';
const GIT_FILE = 'Git-2.46.0-64-bit.exe';
const GIT_URLS = [
  `https://registry.npmmirror.com/-/binary/git-for-windows/${GIT_VERSION}/${GIT_FILE}`,
  `https://cdn.npmmirror.com/binaries/git-for-windows/${GIT_VERSION}/${GIT_FILE}`,
];
const GIT_EXE = path.join('C:', 'Program Files', 'Git', 'cmd', 'git.exe');

// ---------- 检测 ----------
function gitFullPath() {
  return fs.existsSync(GIT_EXE) ? GIT_EXE : null;
}

function hasGit() {
  if (gitFullPath()) return true;      // 完整路径存在（装过）
  return detect.versionOf('git') !== null; // PATH 里有 git
}

// ---------- 提权静默安装 ----------
// 触发 UAC（用户点"是"才继续），-Wait 等待安装器结束；点"否"→ false
function installSilent(exePath) {
  const ps =
    `Start-Process -FilePath '${exePath}' -Verb RunAs ` +
    // /SILENT（而非 /VERYSILENT）：显示安装进度小窗，用户能看见"正在装"而不是黑窗干等
    `-ArgumentList '/SILENT','/NORESTART','/NOCANCEL','/SP-' -Wait`;
  const r = spawnSync('powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'utf-8', shell: false, timeout: 300000 });
  if (r.error && r.error.code === 'ETIMEDOUT') return false;
  return r.status === 0;
}

// ---------- 签名验证（R1 安全加固）----------
// 装前验 Authenticode 签名：签名有效才装。Git 走黄警降级——签名是个人证书，
// 链不稳/本机缺证书时由调用方提示手动装兜底，不红停阻塞主流程。
function verifySignature(exePath) {
  const ps =
    `$s=Get-AuthenticodeSignature -LiteralPath '${exePath}'; ` +
    `if($s.Status -eq 'Valid'){exit 0}else{Write-Host ('  signature status: '+$s.Status); exit 1}`;
  const r = spawnSync('powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'utf-8', shell: false, timeout: 30000 });
  return r.status === 0;
}

// ---------- 主入口 ----------
// 返回 { installed:boolean, action:'skipped'|'installed'|'failed', error? }
async function ensureGit() {
  if (hasGit()) return { installed: true, action: 'skipped' };

  const exe = path.join(dl.ensureTemp(), GIT_FILE);
  // 下载进度：\r 覆盖同一行（节流 300ms），有 content-length 时显示百分比 —— 不再"黑窗干等"
  let lastTick = 0;
  const onProgress = ({ received, total }) => {
    const now = Date.now();
    if (now - lastTick < 300) return;
    lastTick = now;
    const mb = (received / 1048576).toFixed(1);
    if (total > 0) {
      const pct = Math.min(100, (received / total) * 100).toFixed(0);
      process.stdout.write(`\r  [下载中] ${mb} MB / ${(total / 1048576).toFixed(1)} MB（${pct}%）  `);
    } else {
      process.stdout.write(`\r  [下载中] 已接收 ${mb} MB  `);
    }
  };
  // N1：断流容忍 120s→600s（Node https timeout 是空闲超时；慢速下载不超时，仅防完全断流）
  const d = await dl.downloadFromSources(GIT_URLS, exe, { onProgress, timeoutMs: 600000 });
  if (!d.ok) {
    process.stdout.write('\n');
    return { installed: false, action: 'failed',
      error: `Git 下载失败（${d.error}）。可手动到 https://git-scm.com 下载安装，装好后重跑本安装器即可跳过。` };
  }
  process.stdout.write(`\r  [下载完成] ${(d.size / 1048576).toFixed(1)} MB\n`);
  // R1b：Git 验签（黄警降级——签名无效则提示手动装，不装、不阻塞主体）
  if (!verifySignature(exe)) {
    return { installed: false, action: 'failed',
      error: 'Git 安装包签名验证未通过（可能下载被篡改，或本机证书缺失）。请手动到 https://git-scm.com 下载安装，装好后重跑即可跳过。' };
  }
  console.log('  [提示] 签名验证通过，正在安装 Git —— 屏幕会出现安装进度小窗，装完自动关闭，请稍候…');

  const installed = installSilent(exe);
  if (installed && hasGit()) {
    return { installed: true, action: 'installed', size: d.size };
  }
  return { installed: false, action: 'failed',
    error: 'Git 安装未完成（可能取消了授权窗口）。确认安装后重跑本安装器即可跳过。' };
}

module.exports = { ensureGit, hasGit, GIT_EXE };
