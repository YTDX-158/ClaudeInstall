/**
 * scripts/lib/download.js — 多源下载工具（接口 C）
 * ==================================================
 * 给安装器用的下载层：主源优先 → 备用源兜底 → 大小校验 → 临时文件原子改名。
 * 只用 Node 内置 https/fs，无第三方依赖。
 *
 * 约定：
 *   - 临时目录统一 %TEMP%\ClaudeInstall（可被雷4：不依赖 cwd）
 *   - 下载先写 .part，成功才改名（雷5：杜绝半个文件被当成功）
 *   - 多源下载：主源失败自动切备用（v0.2.2 起 Node/Git 均固定版本，目录动态解析已移除）
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { pipeline } = require('node:stream');

const TEMP_DIR = path.join(os.tmpdir(), 'ClaudeInstall');

function ensureTemp() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

// ---------- 单 URL 下载（返回 Promise<{ok,size,error?,status?}>）----------
function download(url, dest, { timeoutMs = 120000, redirects = 0, onProgress } = {}) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.part';
    let received = 0;
    let total = 0;
    let settled = false;

    const done = (ok, info = {}) => {
      if (settled) return;
      settled = true;
      // 清理 .part（失败路径 / rename 失败路径共用；清理本身的错误忽略）
      const cleanup = () => { try { fs.unlinkSync(tmp); } catch (e) { /* 忽略清理错误 */ } };
      if (ok) {
        try {
          fs.renameSync(tmp, dest);
          resolve({ ok: true, size: received, ...info });
        } catch (e) {
          // R-04（9-10 外审）：rename 失败时**不能**再递归调 done(false) —— settled 已置 true
          // 会被开头的 if 拦掉，导致 Promise 永不 resolve、下载流程挂死。这里直接清理 + 返回失败。
          cleanup();
          resolve({ ok: false, size: received, error: 'rename:' + e.message });
        }
      } else {
        cleanup();
        resolve({ ok: false, size: received, ...info });
      }
    };

    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      const status = res.statusCode || 0;
      // 跟随 30x 重定向（nodejs.org / npmmirror 偶发跳转到 CDN），最多 5 跳防死循环
      if (status >= 300 && status < 400 && res.headers.location) {
        if (redirects >= 5) { res.resume(); return done(false, { error: 'too many redirects' }); }
        // 等 302 body 读完再递归（串行跟随——直接并行发新连接会挂起不 settle）；
        // 递归必须带 onProgress：丢了它下载后半程就黑住（npmmirror registry → CDN 必经 302）
        res.resume();
        res.on('end', () => {
          download(res.headers.location, dest, { timeoutMs, redirects: redirects + 1, onProgress }).then(resolve);
        });
        return;
      }
      if (status !== 200) {
        res.resume();
        return done(false, { status, error: 'HTTP ' + status });
      }
      total = parseInt(res.headers['content-length'] || '0', 10) || 0;
      res.on('data', (c) => {
        received += c.length;
        // 进度回调（节流/打印交给调用方）—— 安装器实时显示"下到多少"用的
        onProgress?.({ received, total });
      });
      const ws = fs.createWriteStream(tmp);
      // R-05（9-10 外审）：原实现监听 res 'end' 就改名 —— 此时写入流可能还没 flush 完，
      // 会拿到不完整文件。改用 pipeline：等写入流真正 finish（或出错）再校验 + 改名。
      // pipeline 自带错误传导（写盘失败/连接中断都进 cb），故不再单独挂 ws.on('error')（雷13 同义）
      pipeline(res, ws, (err) => {
        if (err) return done(false, { error: 'write:' + err.message });
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

// v0.2.2：getLatestFromListing / extractVersion 已删——Node 改固定版本后目录列表动态解析成死代码
module.exports = { TEMP_DIR, ensureTemp, download, downloadFromSources };
