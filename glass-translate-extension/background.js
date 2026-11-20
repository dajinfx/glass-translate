chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["content/overlay.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/content.js"]
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_SIDE_PANEL") {
    chrome.storage.local.set({ glassTranslateSidePanelLanguage: message.language || "English" });
    chrome.sidePanel.open({ tabId: sender.tab.id });
    sendResponse({ ok: true });
    return true;
  }

  // Glass Commerce：AI 提取（抓页面文本 → 调 /api/extract → 结构化字段）
  if (message.type === "GLASS_COMMERCE_EXTRACT_AI") {
    handleCommerceExtractAI(sender.tab, message).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  // Glass Commerce：在 Tradeinn 商品页注入提取器，读取当前标签页
  if (message.type === "GLASS_COMMERCE_EXTRACT") {
    handleCommerceExtract(sender.tab).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  // Glass Commerce：注入「生成详情页」按钮（由 side panel 触发，或商品页加载后触发）
  if (message.type === "GLASS_COMMERCE_INJECT_BUTTON") {
    handleInjectButton(sender.tab).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  // Glass Commerce：预览数据写进 storage，供 side panel 读取
  if (message.type === "GLASS_COMMERCE_PREVIEW") {
    chrome.storage.local.set({ glassCommercePreview: message.product }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Glass Commerce：打开 side panel（无需传 tab，主动标签页）
  if (message.type === "GLASS_COMMERCE_OPEN_PANEL") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type !== "CAPTURE_VISIBLE_TAB") return false;

  chrome.tabs.captureVisibleTab(
    sender.tab.windowId,
    { format: "png" },
    (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          ok: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }

      sendResponse({
        ok: true,
        dataUrl
      });
    }
  );

  return true;
});

/**
 * AI 提取：抓当前页面的清洗后的文本，调 /api/extract 让 AI 抽取结构化字段，
 * 再映射成现有 ProductRecord 格式返回。对任意网站通用。
 */
async function handleCommerceExtractAI(tab, message) {
  if (!tab?.id) throw new Error("No active tab");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/commerce/extractors/generic.js"]
  });

  // 拉取当前页的清洗文本
  const textResults = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      try {
        const collect = window.__glassCommerceCollectPageText;
        if (typeof collect !== "function") throw new Error("collectPageText not found");
        return { ok: true, text: collect() };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }
  });
  const text = textResults?.[0]?.result?.text || "";
  if (!textResults?.[0]?.result?.ok || !text) {
    throw new Error(textResults?.[0]?.result?.error || "No page text collected");
  }

  // 调后端 AI 提取（模型跟随用户设置，默认 gpt）
  let model = "gpt";
  try {
    const { glassTranslateDefaultModel } = await chrome.storage.local.get("glassTranslateDefaultModel");
    if (["deepseek", "gpt", "gemini"].includes(glassTranslateDefaultModel)) {
      model = glassTranslateDefaultModel;
    }
  } catch (_) {
    // 保持默认 gpt
  }

  const res = await fetch(API_BASE + "/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      language: message?.language || "English",
      text
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `AI 提取失败 ${res.status}`);
  }

  const product = aiResultToProduct(data.result, tab.url || "");
  return { ok: true, product };
}

const API_BASE = "https://glass-translate-api.onrender.com";

/**
 * 把 /api/extract 返回的扁平字段映射成 ProductRecord 格式（前端面板约定）。
 * 每个字段带 source/status，缺失字段标记 missing。
 */
function aiResultToProduct(r, url) {
  const field = (value, src) => ({
    value: value == null || value === "" ? "" : String(value),
    source: src || "ai",
    status: value == null || value === "" ? "missing" : "confirmed"
  });

  const product = {
    source: "ai",
    sourceProductId: extractUrlId(url),
    url,
    name: field(r.name),
    brand: field(r.brand),
    brandSku: field(r.sku),
    color: field(r.selectedColor || (r.colors?.[0] ?? null)),
    allColors: {
      value: (r.colors || []).join(", "),
      source: "ai",
      status: (r.colors || []).length ? "confirmed" : "missing",
      list: r.colors || []
    },
    price: {
      value: r.price == null ? "" : String(r.price),
      currency: r.currency || "",
      source: "ai",
      status: r.price == null ? "missing" : "confirmed"
    },
    availability: field(r.availability),
    material: field(r.material),
    fit: field(r.fit),
    careInstructions: field(r.careInstructions),
    description: field(r.description),
    features: (r.features || []).map((t) => ({ text: t, source: "ai", status: "confirmed" })),
    rating: r.rating == null
      ? null
      : { value: String(r.rating), count: r.reviewCount || "", source: "ai", status: "confirmed" },
    sizes: {
      list: r.sizes || [],
      all: r.sizes || [],
      inStock: (r.sizes || []).filter((s) => !(r.sizesOutOfStock || []).includes(s)),
      outOfStock: r.sizesOutOfStock || [],
      source: "ai",
      status: (r.sizes || []).length ? "confirmed" : "missing"
    },
    sizeTable: null,
    images: []
  };

  return product;
}

function extractUrlId(url) {
  if (!url) return "";
  const m = String(url).match(/\/(?:product|item|dp|p|style|prod)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}

/**
 * 在 Tradeinn 商品页注入提取器脚本，并返回提取结果。
 */
async function handleCommerceExtract(tab) {
  if (!tab?.id) throw new Error("No active tab");

  const files = ["content/commerce/extractors/generic.js"];

  // 注入提取器模块
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files
  });

  // 在页面上下文中执行提取，并返回 JSON
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      try {
        // tradeinn.js 导出的 extractProduct 会挂到 window 上（下方注入器处理）
        const extractor = window.__glassCommerceExtractor || window.extractProduct;
        if (typeof extractor !== "function") {
          throw new Error("Extractor not found");
        }
        const product = extractor();
        return { ok: true, product };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }
  });

  const result = results?.[0]?.result;
  if (!result?.ok) {
    throw new Error(result?.error || "Extraction failed");
  }
  return result;
}

/**
 * 在 Tradeinn 商品页注入「生成详情页」按钮。
 */
async function handleInjectButton(tab) {
  if (!tab?.id) throw new Error("No active tab");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/commerce/commerce.js"]
  });

  return { ok: true };
}
