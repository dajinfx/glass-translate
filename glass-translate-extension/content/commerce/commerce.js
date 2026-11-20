/**
 * Glass Commerce — Tradeinn 商品页注入脚本
 *
 * 在 Tradeinn 商品页上注入一个「生成韩文详情页」浮动按钮。
 * 点击后提取商品数据 → 打开 side panel → 把 ProductRecord 交给预览面板。
 *
 * 消息协议（content <-> background）：
 *   类型 GLASS_COMMERCE_EXTRACT
 *   类型 GLASS_COMMERCE_PREVIEW  (background -> sidepanel，附带 product)
 */
(() => {
  if (window.__glassCommerceInjected) return;
  window.__glassCommerceInjected = true;

  const BUTTON_ID = "glass-commerce-btn";

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.textContent = "🛒 生成详情页";
    btn.style.cssText = `
      position: fixed; right: 22px; bottom: 22px; z-index: 2147483000;
      display: inline-flex; align-items: center; gap: 6px;
      height: 44px; padding: 0 18px; border: none; border-radius: 22px;
      background: #2563eb; color: #fff; font-size: 14px; font-weight: 600;
      cursor: pointer; box-shadow: 0 8px 24px rgba(37,99,235,0.35);
      font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    `;
    btn.addEventListener("click", onGenerate);
    document.body.appendChild(btn);
  }

  async function onGenerate() {
    const btn = document.getElementById(BUTTON_ID);
    const original = btn.textContent;
    btn.textContent = "提取中…";
    btn.disabled = true;

    try {
      // 优先 AI 提取（抓页面文本 → AI 抽取结构化字段，通用任意网站）
      let product;
      try {
        product = await runExtractorAI();
      } catch (aiError) {
        console.warn("[GlassCommerce] AI 提取失败，回退选择器提取", aiError);
        product = await runExtractor();
      }
      // 请求 background 打开 side panel 并传递数据
      chrome.runtime.sendMessage(
        {
          type: "GLASS_COMMERCE_PREVIEW",
          product
        },
        () => {
          chrome.runtime.sendMessage({ type: "GLASS_COMMERCE_OPEN_PANEL" });
        }
      );
      btn.textContent = "✓ 已生成";
    } catch (error) {
      console.error("[GlassCommerce]", error);
      btn.textContent = "提取失败";
      showErrorToast(error);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = original;
      }, 1500);
    }
  }

  /**
   * 提取器不在 content script 的打包图里时，通过 DOM 直接内联执行。
   * 这里用 scripting 注入提取器脚本，再读取结果。
   */
  async function runExtractor() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GLASS_COMMERCE_EXTRACT" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.ok && response.product) {
          resolve(response.product);
        } else {
          reject(new Error(response?.error || "提取失败"));
        }
      });
    });
  }

  /**
   * AI 提取：把当前页面清洗文本交给后台，后台调 /api/extract 让 AI 抽取字段。
   */
  async function runExtractorAI() {
    return new Promise((resolve, reject) => {
      const language = (window.__glassCommerceLanguage || "English");
      chrome.runtime.sendMessage(
        { type: "GLASS_COMMERCE_EXTRACT_AI", language },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.ok && response.product) {
            resolve(response.product);
          } else {
            reject(new Error(response?.error || "AI 提取失败"));
          }
        }
      );
    });
  }

  function showErrorToast(error) {
    const el = document.createElement("div");
    el.textContent = "提取失败：" + (error?.message || "");
    el.style.cssText = `
      position: fixed; right: 22px; bottom: 74px; z-index: 2147483000;
      max-width: 320px; padding: 10px 14px; border-radius: 8px;
      background: #dc2626; color: #fff; font-size: 13px; font-family: system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function init() {
    createButton();
  }

  // 按钮注入增强：SPA 场景下 body 可能后到达，用 MutationObserver 兜底
  function ensureButton() {
    if (document.body) {
      createButton();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.body) {
        createButton();
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // 二次保全：延迟再试 + 拦截后续动态路由
  setTimeout(ensureButton, 1000);
  window.addEventListener("load", ensureButton);
})();
