/**
 * scripts/lib/download.js — 多源下载工具（接口 C）
 * ==================================================
 * 给安装器用的下载层：主源优先 → 备用源兜底 → 大小校验 → 临时文件原子改名。
 * 只用 Node 内置 https/fs，无第三方依赖。
 *
 * 约定：
 *   - 临时目录统一 %TEMP%\ClaudeInstall（可被雷4：不依赖 cwd）
 *   - 下载先写 .part，成功才改名（雷5：杜绝半个文件被当成功）
 *   - 目录列表解析：拉 HTML → 正则提取 → 取版本号最高（Node LTS 线动态查最新）
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');

const TEMP_DIR = path.join(os.tmpdir(), 'ClaudeInstall');

function ensureTemp() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

// ---------- 单 URL 下载（返回 Promise<{ok,size,error?,status?}>）----------
function download(url, dest, { timeoutMs = 120000, redirects = 0 } = {}) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.part';
    let received = 0;
    let total = 0;
    let settled = false;

    const done = (ok, info = {}) => {
      if (settled) return;
      settled = true;
      if (ok) {
        try {
          fs.renameSync(tmp, dest);
        } catch (e) {
          return done(false, { error: 'rename:' + e.message });
        }
        resolve({ ok: true, size: received, ...info });
      } else {
        try { fs.unlinkSync(tmp); } catch (e) { /* 忽略清理错误 */ }
        resolve({ ok: false, size: received, ...info });
      }
    };

    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      const status = res.statusCode || 0;
      // 跟随 30x 重定向（nodejs.org 偶发跳转到 CDN），最多 5 跳防死循环
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) return done(false, { error: 'too many redirects' });
        return download(res.headers.location, dest, { timeoutMs, redirects: redirects + 1 }).then(resolve);
      }
      if (status !== 200) {
        res.resume();
        return done(false, { status, error: 'HTTP ' + status });
      }
      total = parseInt(res.headers['content-length'] || '0', 10) || 0;
      res.on('data', (c) => { received += c.length; });
      const ws = fs.createWriteStream(tmp);
      ws.on('error', (e) => {
        // 写盘失败（磁盘满/权限/占用）→ 走失败路径清理 .part，不抛未捕获异常（雷13）
        done(false, { error: 'write:' + e.message });
      });
      res.pipe(ws);
      res.on('end', () => {
        // 有 content-length 就严格比对；没有则要求至少收到字节
        const sizeOk = total > 0 ? received === total : received > 0;
        if (!sizeOk) return done(false, { error: `size mismatch ${received}/${total}` });
        done(true, { total });
      });
    });
    req.on('error', (e) => done(false, { error: e.message }));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

// ---------- 多源下载：主源失败自动切备用 ----------
async function downloadFromSources(urls, dest, opts = {}) {
  let lastErr = 'download failed';
  for (const u of urls) {
    const r = await download(u, dest, opts);
    if (r.ok) return { ok: true, source: u, size: r.size };
    lastErr = r.error || lastErr;
  }
  return { ok: false, error: lastErr, sources: urls };
}

// ---------- 目录列表解析：取版本号最高的一条 ----------
// 例：listingUrl = .../node/latest-v22.x/，regex = /node-v(\d+\.\d+\.\d+)-x64\.msi/
// 返回完整文件名（如 node-v22.23.2-x64.msi）；失败返回 null
function getLatestFromListing(listingUrl, regex, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    let text = '';
    const req = https.get(listingUrl, { timeout: timeoutMs }, (res) => {
      if ((res.statusCode || 0) !== 200) { res.resume(); return resolve(null); }
      res.setEncoding('utf-8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        const found = [];
        let m;
        const re = new RegExp(regex.source, 'g');
        while ((m = re.exec(text)) !== null) {
          if (!found.includes(m[0])) found.push(m[0]);
        }
        if (found.length === 0) return resolve(null);
        const pick = found.sort((a, b) => {
          const va = extractVersion(a), vb = extractVersion(b);
          for (let i = 0; i < 3; i++) {
            if ((va[i] || 0) !== (vb[i] || 0)) return (va[i] || 0) - (vb[i] || 0);
          }
          return 0;
        }).pop();
        resolve(pick);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function extractVersion(name) {
  const m = name.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : [0, 0, 0];
}

module.exports = { TEMP_DIR, ensureTemp, download, downloadFromSources, getLatestFromListing };
