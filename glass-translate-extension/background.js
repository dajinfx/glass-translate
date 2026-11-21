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
 * 从原始 HTML 字符串里抽取干净文本（JSON-LD Product + meta + 表格 + 正文本体）。
 * 用 DOMParser 解析，与页面当前（可能被 Google 翻译污染的）DOM 完全隔离。
 */
function extractTextFromHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const chunks = [];

    // 1) JSON-LD（商品结构化数据最干净，只保留 Product）
    const jsonld = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      const t = (s.textContent || "").trim();
      if (t && /"@type"\s*:\s*("|\[\s*")?\w*Product/i.test(t)) jsonld.push(t);
    });
    if (jsonld.length) chunks.push("=== JSON-LD ===\n" + jsonld.join("\n---\n").slice(0, 5000));

    // 2) title + 商品相关 meta
    const metaLines = [];
    const title = doc.querySelector("title")?.textContent || "";
    if (title) metaLines.push("title: " + title.trim());
    doc.querySelectorAll("meta[property], meta[name], meta[itemprop]").forEach((m) => {
      const k = m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("itemprop") || "";
      if (!/^(og:|product:|twitter:)|description|price|currency|availability|brand|color|title/i.test(k)) return;
      const v = (m.getAttribute("content") || "").trim().replace(/\s+/g, " ");
      if (v && v.length <= 300) metaLines.push(k + ": " + v);
    });
    if (metaLines.length) chunks.push("=== META ===\n" + metaLines.slice(0, 40).join("\n"));

    // 3) 表格（尺码表/规格表）
    const tableLines = [];
    doc.querySelectorAll("table").forEach((tb, i) => {
      if (i >= 5) return;
      const rows = Array.from(tb.querySelectorAll("tr")).slice(0, 30)
        .map((tr) => Array.from(tr.querySelectorAll("th,td")).map((c) => (c.textContent || "").trim().replace(/\s+/g, " ")).join(" | "))
        .filter((r) => r.replace(/\|/g, "").trim());
      if (rows.length) tableLines.push("[table " + (i + 1) + "]\n" + rows.join("\n"));
    });
    if (tableLines.length) chunks.push("=== TABLES ===\n" + tableLines.join("\n\n").slice(0, 3500));

    // 3b) 颜色/尺码变体（VARIANTS：色块 <li>/<a title>/<img alt>、下拉 select>option、radio）。
    //     颜色选项的唯一可靠来源（如 cortexpower 的 div.variant-farbe 里 a[title]="Rot"）。
    //     静态 HTML 里就有（服务端渲染），必须采集，否则后端 AI 只能从正文抠到 1 个颜色。
    const variantColors = [];
    const variantSizes = [];
    const pushUnique = (arr, v) => {
      const t = String(v ?? "").trim().replace(/\s+/g, " ");
      if (t && t.length <= 40 && !arr.includes(t)) arr.push(t);
    };
    // 色块：div.variant-farbe/.variant-color/.variant-item 里的 <li>，颜色名在 a[title] 或 img[alt]
    doc.querySelectorAll('.variant-farbe li, .variant-color li, .variant-item li, [class*="color-variant"] li, .sizes li').forEach((li) => {
      const a = li.querySelector('a[title]');
      const img = li.querySelector('img[alt]');
      const label = (a && a.getAttribute("title")) || (img && img.getAttribute("alt")) || "";
      if (label) pushUnique(variantColors, label);
    });
    // 下拉/radio：颜色名在 option 文本或 radio 的 aria-label/value
    doc.querySelectorAll('select option, [name*="color" i] option, [name*="variant" i] option').forEach((opt) => {
      const t = (opt.getAttribute("value") || opt.textContent || "").trim();
      if (t && t.length <= 40) pushUnique(variantSizes, t);
    });
    if (variantColors.length) chunks.push("=== VARIANTS (colors) ===\n" + variantColors.join(", "));
    if (variantSizes.length) chunks.push("=== VARIANTS (sizes) ===\n" + variantSizes.join(", "));

    // 4) 正文本体（去脚本/样式/导航/页头页尾）
    doc.querySelectorAll("script,style,noscript,svg,iframe,header,footer,nav,form").forEach((n) => n.remove());
    const bodyText = (doc.body?.innerText || "")
      .split(/\n+/).map((l) => l.trim()).filter((l) => l.length >= 2)
      .slice(0, 600).join("\n");
    if (bodyText) chunks.push("=== PAGE_TEXT ===\n" + bodyText.slice(0, 12000));

    return chunks.join("\n\n\n").slice(0, 24000);
  } catch (_) {
    return "";
  }
}

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

  // 数据源优先级：
  //   1) fetch 当前商品页 URL → 服务器返回的【原始语言 HTML】，从干净原文抽取，
  //      彻底绕开 Google 翻译对页面 DOM 的污染（商品内容语言只由「语言设置 + 生成详情按钮」决定）。
  //   2) 回退：注入脚本抓当前 DOM（可能已被 Google 翻译改写）。
  let text = "";
  let domProduct = null;

  const pageUrl = tab.url || "";
  if (/^https?:\/\//i.test(pageUrl)) {
    try {
      const rawRes = await fetch(pageUrl, {
        credentials: "include",
        headers: {
          "Accept": "text/html",
          // 关键：强制以德语原文请求。用户浏览器语言是韩语时，服务器会直接返回韩语版页面，
          // 导致抓到的商品内容是韩语而非原文。这里固定请求德语，拿到原始商品文本后再由
          // 后端 AI 按用户选择的语言（语言设置 + 生成详情按钮）翻译。
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.8"
        }
      });
      if (rawRes.ok) {
        const rawHtml = await rawRes.text();
        const freshText = extractTextFromHtml(rawHtml);
        if (freshText && freshText.length >= 80) {
          text = freshText;
        }
      }
    } catch (_) {
      // fetch 原始 HTML 失败（跨域/CSP/网络/需登录页）→ 忽略，走 DOM 回退
    }
  }

  // 回退：抓当前 DOM（可能被 Google 翻译污染）
  if (!text) {
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
    text = textResults?.[0]?.result?.text || "";
  }

  // 始终再跑一次 DOM 选择器提取（图片/尺码表/rawSections 等只在活动 DOM 里的内容）
  const domResults = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      try {
        const extract = window.__glassCommerceExtractor;
        if (typeof extract === "function") return { ok: true, product: extract() };
        return { ok: false };
      } catch (_) { return { ok: false }; }
    }
  });
  domProduct = domResults?.[0]?.result?.product || null;

  if (!text) {
    throw new Error("No page text collected");
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

  // 列表字段（colors/sizes）不再与 DOM 并集，见下方分别处理。

  // colors（全部颜色列表）不跟 DOM 并集：DOM 选择器从被 Google 翻译污染的 DOM 里抓到译文字符串
  // （빨간색/감청색/검은색），会污染后端 AI 翻译好的中文列表。colors 只信任后端 AI 输出，
  // 与 features 同理（DOM 扫全页是把脏数据）。单值 color 也已在 aiResultToProduct 用 AI 结果。
  // 仅当 AI 完全没拿到 colors 时才回退到 DOM 补齐。
  const aiColors = merged.allColors?.list || [];
  if (!aiColors.length && (dom.allColors?.list || []).length) {
    merged.allColors = {
      value: dom.allColors.list.join(", "),
      source: "dom",
      status: "confirmed",
      list: dom.allColors.list
    };
  }

  // sizes（尺码列表）同样不跟 DOM 并集：DOM 选择器从被翻译污染的 DOM 里抓到译文（如
  // 「Bitte auswählen」德语未翻译），会污染后端 AI 翻译好的列表。AI 空才回退 DOM。
  const aiSizes = merged.sizes?.all || merged.sizes?.list || [];
  if (!aiSizes.length && ((dom.sizes?.inStock || []).length || (dom.sizes?.outOfStock || []).length)) {
    const inStock = dom.sizes?.inStock || [];
    const outOfStock = dom.sizes?.outOfStock || [];
    merged.sizes = {
      value: inStock.join(", "),
      source: "dom",
      status: "confirmed",
      list: inStock,
      all: [...inStock, ...outOfStock],
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
