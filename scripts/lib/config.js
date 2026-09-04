/**
 * scripts/lib/config.js — 配置读写契约（接口 A）
 * ============================================
 * ClaudeInstall × ClaudeNeko 共用同一套文件读写逻辑，保证两边操作 ~/.claude 配置永远一致。
 *
 * 契约函数：
 *   settingsPath(home) / claudeJsonPath(home)  → 目标文件路径
 *   readJson(p) / writeJson(p, obj)            → 底层读写（合并写入，先备份）
 *   writeEnv(home, { baseUrl, authToken, model }) → 合并写 settings.json 的 env
 *   setOnboarding(home)                          → 合并写 claude.json 的 hasCompletedOnboarding
 *   isConfigured(home)                           → env 里有没有凭证（AUTH_TOKEN + BASE_URL）
 *
 * 约定：home 传参可覆盖（测试/隔离用），默认真实用户目录。
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------- 路径 ----------
function settingsPath(home) {
  return path.join(home || os.homedir(), '.claude', 'settings.json');
}

function claudeJsonPath(home) {
  return path.join(home || os.homedir(), '.claude.json');
}

// ---------- 底层读写 ----------
function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function writeJson(p, obj) {
  // 先备份已存在的原文件，再写（合并写入，绝不整体覆盖丢失其他字段）
  if (fs.existsSync(p)) {
    const bak = p + '.bak';
    if (!fs.existsSync(bak)) fs.copyFileSync(p, bak);
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8');
}

// ---------- 契约函数 ----------
/** 合并写入 settings.json 的 env（保留其他字段；备份先行）→ 返回文件路径 */
function writeEnv(home, { baseUrl, authToken, model }) {
  const p = settingsPath(home);
  const cfg = readJson(p);
  cfg.env = cfg.env || {};
  if (baseUrl) cfg.env.ANTHROPIC_BASE_URL = baseUrl;
  if (authToken) cfg.env.ANTHROPIC_AUTH_TOKEN = authToken;
  if (model) {
    cfg.env.ANTHROPIC_MODEL = model;
    cfg.env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
    cfg.env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
    cfg.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
    // *_MODEL_NAME 系列也统一写：claude 实际调用优先认 NAME，历史残留的旧模型名会覆盖 MODEL（实测：配置 pro 实际跑 flash）
    cfg.env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME = model;
    cfg.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME = model;
    cfg.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME = model;
  }
  writeJson(p, cfg);
  return p;
}

/** 合并写入 claude.json 的 hasCompletedOnboarding → 返回文件路径 */
function setOnboarding(home) {
  const p = claudeJsonPath(home);
  const cfg = readJson(p);
  cfg.hasCompletedOnboarding = true;
  writeJson(p, cfg);
  return p;
}

/** 是否已配置：env 里有凭证 + 有 baseUrl */
function isConfigured(home) {
  const cfg = readJson(settingsPath(home));
  const env = cfg.env || {};
  return Boolean(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY)
    && Boolean(env.ANTHROPIC_BASE_URL);
}

module.exports = { settingsPath, claudeJsonPath, readJson, writeJson, writeEnv, setOnboarding, isConfigured };
