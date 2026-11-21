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

  // Glass Commerce：工具栏购物车按钮 toggle 页面内「生成详情页」浮动窗口。
  //   content.js 发来 → 这里用 tabs.sendMessage 中转给同页面的 commerce.js（content 之间无法直接 runtime 互通）。
  if (message.type === "GLASS_COMMERCE_TOGGLE_WINDOW") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, {
        type: "GLASS_COMMERCE_TOGGLE_WINDOW"
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  // Glass Commerce：语言切换广播 → 中转给同页 commerce.js，让浮窗文案跟随语言
  if (message.type === "GLASS_COMMERCE_LANGUAGE") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, {
        type: "GLASS_COMMERCE_LANGUAGE",
        language: message.language
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  // Glass Commerce：翻译提取字段值（调后端 /api/translate-text）
  if (message.type === "GLASS_COMMERCE_TRANSLATE_FIELDS") {
    handleCommerceTranslateFields(message).then(sendResponse).catch((error) => {
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

  // 拉取当前页的清洗文本，同时跑一次 DOM 选择器提取（用于补齐 AI 丢掉的字段/图片/尺码表）
  const textResults = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      try {
        const collect = window.__glassCommerceCollectPageText;
        if (typeof collect !== "function") throw new Error("collectPageText not found");
        let domProduct = null;
        try {
          const extract = window.__glassCommerceExtractor;
          if (typeof extract === "function") domProduct = extract();
        } catch (_) {
          // DOM 提取失败不阻塞 AI 提取
        }
        return { ok: true, text: collect(), domProduct };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }
  });
  const text = textResults?.[0]?.result?.text || "";
  const domProduct = textResults?.[0]?.result?.domProduct || null;
  if (!textResults?.[0]?.result?.ok || !text) {
    throw new Error(textResults?.[0]?.result?.error || "No page text collected");
  }

  // 商品信息清洗整理跟随 Glass Translate 设置面板的默认模型，保持一致；未设置时用 gpt
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

  const product = mergeProducts(aiResultToProduct(data.result, tab.url || ""), domProduct);
  return { ok: true, product };
}

/**
 * 合并 AI 提取与 DOM 选择器提取的结果：AI 字段优先，DOM 补齐缺失字段；
 * 图片 / 尺码表 / rawSections 这类 AI 路径拿不到的内容始终取自 DOM。
 */
function mergeProducts(ai, dom) {
  if (!dom) return ai;
  const merged = { ...ai, source: "ai+dom" };

  const SIMPLE_FIELDS = [
    "name", "brand", "brandSku", "color", "availability",
    "material", "fit", "careInstructions", "description"
  ];
  for (const key of SIMPLE_FIELDS) {
    if (merged[key]?.status !== "confirmed" && dom[key]?.status === "confirmed") {
      merged[key] = dom[key];
    }
  }

  if (merged.price?.status !== "confirmed" && dom.price?.status === "confirmed") {
    merged.price = dom.price;
  }

  // 列表字段取并集：AI 和 DOM 谁抓到算谁的，大小写不敏感去重
  const unionList = (a = [], b = []) => {
    const seen = new Set();
    const out = [];
    [...a, ...b].forEach((v) => {
      const t = String(v ?? "").trim();
      const key = t.toLowerCase();
      if (t && !seen.has(key)) {
        seen.add(key);
        out.push(t);
      }
    });
    return out;
  };

  const colors = unionList(merged.allColors?.list, dom.allColors?.list);
  if (colors.length) {
    merged.allColors = { value: colors.join(", "), source: "ai+dom", status: "confirmed", list: colors };
  }

  const outOfStock = unionList(merged.sizes?.outOfStock, dom.sizes?.outOfStock);
  const inStock = unionList(merged.sizes?.inStock || merged.sizes?.list, dom.sizes?.inStock)
    .filter((s) => !outOfStock.some((o) => o.toLowerCase() === s.toLowerCase()));
  if (inStock.length || outOfStock.length) {
    merged.sizes = {
      value: inStock.join(", "),
      source: "ai+dom",
      status: "confirmed",
      list: inStock,
      all: unionList(inStock, outOfStock),
      inStock,
      outOfStock
    };
  }

  // features 不用 DOM 并集：DOM 的「扫全页 <ul><li>」会把整站分类导航菜单（침낭/텐트/스틱…）
  // 当成卖点灌进来，淹没后端 AI 干净的结果。features 只信任后端 AI 的 sanitizeFeatures 输出。
  const featureTexts = new Set();
  const features = [];
  (merged.features || []).forEach((f) => {
    const t = String(f?.text ?? f ?? "").trim();
    const key = t.toLowerCase();
    if (t && !featureTexts.has(key)) {
      featureTexts.add(key);
      features.push({ text: t, source: "ai", status: "confirmed" });
    }
  });
  merged.features = features;

  if (!merged.rating && dom.rating) merged.rating = dom.rating;
  if (!merged.sizeTable?.value && dom.sizeTable?.value) merged.sizeTable = dom.sizeTable;
  if (!merged.sourceProductId && dom.sourceProductId) {
    merged.sourceProductId = dom.sourceProductId;
  }

  merged.images = Array.isArray(dom.images) ? dom.images : [];
  merged.rawSections = (dom.rawSections || [])
    .slice(0, 5)
    .map((s) => ({ ...s, text: String(s.text || "").slice(0, 600) }));

  return merged;
}

const API_BASE = "https://glass-translate-api.onrender.com";

/**
 * 翻译 Glass Commerce 提取的字段值：转调后端 /api/translate-text，
 * 返回 { ok: true, translatedMap: { id: 译文 } }。
 */
async function handleCommerceTranslateFields(message) {
  const blocks = Array.isArray(message?.blocks) ? message.blocks : [];
  const targetLanguage = message?.targetLanguage || "English";
  if (!blocks.length) return { ok: true, translatedMap: {} };

  // 模型跟随 Glass Translate 设置面板的默认模型
  let model = "gpt";
  try {
    const { glassTranslateDefaultModel } = await chrome.storage.local.get("glassTranslateDefaultModel");
    if (["deepseek", "gpt", "gemini"].includes(glassTranslateDefaultModel)) {
      model = glassTranslateDefaultModel;
    }
  } catch (_) {
    // 保持默认 gpt
  }

  const res = await fetch(API_BASE + "/api/translate-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks, targetLanguage, model })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `字段翻译失败 ${res.status}`);
  }

  // 后端返回 blocks 数组（可能带 id），映射回 { id: 译文 }
  const translatedMap = {};
  const resultBlocks = Array.isArray(data.blocks) ? data.blocks : [];
  resultBlocks.forEach((b) => {
    const id = String(b?.id || "");
    const translated = String(b?.translatedText || b?.text || "").trim();
    if (id && translated) translatedMap[id] = translated;
  });

  return { ok: true, translatedMap };
}

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
    sizeTable: r.sizeTable
      ? { value: String(r.sizeTable), source: "ai", status: "confirmed", rows: [] }
      : null,
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
