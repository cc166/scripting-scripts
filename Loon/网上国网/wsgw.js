// 网上国网 Loon 启动器
// 业务脚本来源：https://github.com/Yuheng0101/X/blob/main/Tasks/95598/95598.js
// 参考配置来源：https://github.com/Primovist/Scripting/blob/main/wsgw.sgmodule
// 上游业务脚本版本：3.1.4 (2026-05-06)

(() => {
  "use strict";

  const CORE_URL =
    "https://raw.githubusercontent.com/cc166/scripting-scripts/main/Loon/%E7%BD%91%E4%B8%8A%E5%9B%BD%E7%BD%91/95598.js";
  const CORE_CACHE_KEY = "cc166.wsgw.core.cache.v1";
  const CORE_HASH_KEY = "cc166.wsgw.core.hash.v1";
  const MAX_JITTER = 600;
  const REQUEST_TIMEOUT = 30000;
  const startedAt = Date.now();
  const originalDone = $done;

  const isRequest = typeof $request !== "undefined";
  const arg = normalizeArgument(typeof $argument === "object" ? $argument : {});

  run().catch((error) => finishError(error));

  async function run() {
    console.log(`[网上国网] 开始：${isRequest ? "接口查询" : "定时查询"}`);

    if (!arg.username || !arg.password) {
      throw new Error("请先在插件设置中填写网上国网账号和密码");
    }

    if (!isRequest) {
      const delay = randomDelay(arg.jitterMax);
      if (delay > 0) {
        console.log(`[网上国网] 随机延迟 ${delay} 秒`);
        await wait(delay * 1000);
      }
    }

    const core = await loadCore();
    globalThis.$argument = {
      username: arg.username,
      password: arg.password,
      debug: arg.debug,
      show_recent_usage: arg.showRecentUsage,
      notify_all_accounts: arg.notifyAllAccounts,
    };
    globalThis.$done = (value) => {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `[网上国网] 完成：${isRequest ? "接口查询" : "定时查询"}；账号 ${maskAccount(
          arg.username
        )}；耗时 ${elapsed} 秒`
      );
      originalDone(value);
    };

    try {
      // 间接调用可避免脚本内容与当前启动器作用域发生变量冲突。
      (0, eval)(core);
    } catch (error) {
      throw new Error(`业务脚本启动失败：${messageOf(error)}`);
    }
  }

  function normalizeArgument(value) {
    return {
      username: String(value.username || "").trim(),
      password: String(value.password || ""),
      debug: toBool(value.debug),
      showRecentUsage: toBool(value.showRecentUsage),
      notifyAllAccounts: toBool(value.notifyAllAccounts),
      jitterMax: clampInt(value.jitterMax, 300, 0, MAX_JITTER),
    };
  }

  async function loadCore() {
    try {
      const response = await httpGet(CORE_URL);
      const body = String(response.body || "");
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`HTTP ${response.statusCode}`);
      }
      if (!looksLikeCore(body)) {
        throw new Error("返回内容不是有效的网上国网业务脚本");
      }
      $persistentStore.write(body, CORE_CACHE_KEY);
      $persistentStore.write(simpleHash(body), CORE_HASH_KEY);
      console.log(`[网上国网] 业务脚本已更新（${body.length} 字节）`);
      return body;
    } catch (error) {
      const cached = $persistentStore.read(CORE_CACHE_KEY);
      if (looksLikeCore(cached)) {
        const hash = $persistentStore.read(CORE_HASH_KEY) || "unknown";
        console.log(`[网上国网] 下载失败，使用本地缓存（${hash}）：${messageOf(error)}`);
        return cached;
      }
      throw new Error(`业务脚本下载失败且无可用缓存：${messageOf(error)}`);
    }
  }

  function httpGet(url) {
    return new Promise((resolve, reject) => {
      $httpClient.get(
        {
          url,
          timeout: REQUEST_TIMEOUT,
          headers: { "User-Agent": "Loon/WSGW" },
        },
        (error, response, body) => {
          if (error) return reject(error);
          resolve({
            statusCode: Number(response && (response.status || response.statusCode)) || 0,
            body,
          });
        }
      );
    });
  }

  function looksLikeCore(value) {
    return (
      typeof value === "string" &&
      value.length > 50000 &&
      value.includes("95598_username") &&
      value.includes("api.120399.xyz") &&
      value.includes("请先配置网上国网账号和密码")
    );
  }

  function randomDelay(max) {
    return max > 0 ? Math.floor(Math.random() * (max + 1)) : 0;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function toBool(value) {
    return value === true || /^(1|true|yes|on|是)$/i.test(String(value || ""));
  }

  function clampInt(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value), 10);
    const number = Number.isFinite(parsed) ? parsed : fallback;
    return Math.min(max, Math.max(min, number));
  }

  function simpleHash(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function maskAccount(account) {
    const value = String(account || "");
    if (value.length <= 5) return "****";
    return `${value.slice(0, 3)}****${value.slice(-2)}`;
  }

  function messageOf(error) {
    return String((error && (error.message || error.error)) || error || "未知错误");
  }

  function finishError(error) {
    const message = messageOf(error);
    const account = maskAccount(arg.username);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[网上国网] 失败：${message}；账号 ${account}；耗时 ${elapsed} 秒`);
    $notification.post("网上国网", "❌ 执行失败", message);
    originalDone({});
  }
})();
