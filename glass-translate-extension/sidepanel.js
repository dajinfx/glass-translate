// Glass Commerce — side panel 详情页生成与预览（纯 vanilla JS，无外部依赖）

const API_BASE = "https://glass-translate-api.onrender.com";
const GENERATE_URL = `${API_BASE}/api/generate-detail`;
const DRAFT_KEY = "glassCommerceDrafts";

// 语言映射：工具栏语言显示名 -> 后端 API 语言名
const LANG_FOR_API = {
  English: "English",
  "中文": "Chinese",
  "日本語": "Japanese",
  "한국어": "Korean",
  Français: "French",
  Deutsch: "German",
  Español: "Spanish",
  Русский: "Russian",
  العربية: "Arabic",
  हिन्दी: "Hindi"
};

let state = {
  product: null,
  result: null,
  language: "English",
  dragIndex: null
};

// DOM 引用
const els = {
  empty: document.getElementById("empty-state"),
  main: document.getElementById("main-content"),
  badges: document.getElementById("badges"),
  productMeta: document.getElementById("product-meta"),
  generateBtn: document.getElementById("generate-btn"),
  saveBtn: document.getElementById("save-btn"),
  draftSaved: document.getElementById("draft-saved"),
  preview: document.getElementById("preview"),
  detailsCard: document.getElementById("details-card"),
  detailsBody: document.getElementById("details-body"),
  editor: document.getElementById("editor"),
  editTitle: document.getElementById("edit-title"),
  editPoints: document.getElementById("edit-points"),
  editSpec: document.getElementById("edit-spec"),
  imgsCard: document.getElementById("imgs-card"),
  imgGrid: document.getElementById("img-grid"),
  exportRow: document.getElementById("export-row"),
  exportTextBtn: document.getElementById("export-text-btn"),
  toast: document.getElementById("toast")
};

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.style.display = "block";
  els.toast.style.opacity = "1";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.style.opacity = "0";
    setTimeout(() => { els.toast.style.display = "none"; }, 300);
  }, 2000);
}

function fieldStatus(field) {
  if (!field) return "missing";
  return field.status || "missing";
}

const BADGE_META = [
  { key: "name", label: "品名" },
  { key: "brand", label: "品牌" },
  { key: "color", label: "颜色" },
  { key: "material", label: "材质" },
  { key: "price", label: "价格" },
  { key: "sizeTable", label: "尺码表" },
  { key: "careInstructions", label: "洗护" }
];

function renderBadges() {
  els.badges.innerHTML = "";
  BADGE_META.forEach((m) => {
    const st = fieldStatus(state.product[m.key]);
    const icon = st === "confirmed" ? "✓" : st === "needs_confirmation" ? "?" : "✗";
    const span = document.createElement("span");
    span.className = "status-badge status-" + st;
    span.textContent = `${m.label}: ${icon}`;
    els.badges.appendChild(span);
  });
}

function renderMeta() {
  const p = state.product;
  els.productMeta.textContent =
    `来源 ${p.source || "generic"} · ID ${p.sourceProductId || "未识别"}`;
}

function fieldText(field) {
  return (field && field.value) ? field.value : "";
}

function detailRow(label, text) {
  const has = text && String(text).trim();
  return `<div class="detail-row">
    <div class="k">${escapeHtml(label)}</div>
    <div class="v${has ? "" : " empty"}">${has ? escapeHtml(text) : "（未提取到）"}</div>
  </div>`;
}

function renderDetails() {
  const p = state.product;
  if (!p) return;

  let html = "";
  html += detailRow("名称", fieldText(p.name));
  html += detailRow("品牌", fieldText(p.brand));
  html += detailRow("货号 SKU", fieldText(p.brandSku));
  html += detailRow("颜色", fieldText(p.color));
  if (p.allColors?.list?.length) {
    html += detailRow("全部颜色", p.allColors.list.join(", "));
  }

  const price = p.price?.value
    ? `${p.price.value}${p.price.currency ? " " + p.price.currency : ""}`
    : "";
  html += detailRow("价格", price);
  html += detailRow("库存", fieldText(p.availability));

  html += detailRow("材质 / 成分", fieldText(p.material));
  html += detailRow("版型", fieldText(p.fit));
  html += detailRow("洗护说明", fieldText(p.careInstructions));

  if (p.sizes?.list?.length || p.sizes?.all?.length) {
    const inStock = p.sizes.inStock || p.sizes.list || [];
    const outOfStock = p.sizes.outOfStock || [];
    let sizeText = inStock.join(", ");
    if (outOfStock.length) {
      sizeText += outOfStock.length ? `（缺货：${outOfStock.join(", ")}）` : "";
    }
    html += detailRow("尺码", sizeText);
  }
  const sizeTableText = p.sizeTable?.value || "";
  if (sizeTableText) {
    html += detailRow("尺码表", sizeTableText);
  }

  html += detailRow("商品描述", fieldText(p.description));

  if (p.rating?.value) {
    html += detailRow("评分", `${p.rating.value} (${p.rating.count}건)`);
  }

  if (p.features && p.features.length) {
    html += detailRow("卖点 / 功能", p.features.map((f) => f.text).join("\n"));
  }

  if (p.rawSections && p.rawSections.length) {
    p.rawSections.forEach((s, i) => {
      html += detailRow(`说明小节 · ${s.label}`, s.text);
    });
  }

  els.detailsBody.innerHTML = html;
  els.detailsCard.classList.remove("hidden");
}

function renderPreview() {
  if (!state.result) return;
  const r = state.result;
  const hero = state.product.images?.[0]?.url || "";

  let html = "";
  html += '<div class="preview-hero">';
  if (hero) {
    html += `<img src="${hero}" alt="hero" />`;
  } else {
    html += '<div style="aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;color:#94a3b8;">无主图</div>';
  }
  html += '</div>';
  html += `<div class="preview-title">${escapeHtml(r.title || "")}</div>`;

  html += '<div class="preview-section"><div class="label">卖点</div>';
  (r.sellingPoints || []).forEach((sp, i) => {
    html += `<div class="sp-row"><div class="sp-dot">${i + 1}</div><div class="sp-text">${escapeHtml(sp)}</div></div>`;
  });
  html += '</div>';

  html += '<div class="preview-section"><div class="label">规格</div>';
  html += `<div class="sp-text">${escapeHtml(r.specSummary || "")}</div>`;
  html += '</div>';

  els.preview.innerHTML = html;
  els.preview.classList.remove("hidden");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderEditor() {
  if (!state.result) return;
  els.editTitle.value = state.result.title || "";
  els.editPoints.value = (state.result.sellingPoints || []).join("\n");
  els.editSpec.value = state.result.specSummary || "";
  els.editor.classList.remove("hidden");
  els.exportRow.classList.remove("hidden");
}

function renderImages() {
  const imgs = state.product?.images || [];
  if (!imgs.length) {
    els.imgsCard.classList.add("hidden");
    return;
  }
  els.imgsCard.classList.remove("hidden");
  els.imgGrid.innerHTML = "";
  imgs.forEach((img, i) => {
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.draggable = true;
    thumb.dataset.index = i;
    thumb.innerHTML = `<img src="${img.url}" alt="img ${i + 1}" /><span class="idx">${i + 1}</span>`;
    thumb.addEventListener("dragstart", (e) => {
      state.dragIndex = i;
      e.dataTransfer.effectAllowed = "move";
    });
    thumb.addEventListener("dragover", (e) => e.preventDefault());
    thumb.addEventListener("drop", (e) => {
      e.preventDefault();
      dropImage(i);
    });
    els.imgGrid.appendChild(thumb);
  });
}

function dropImage(targetIndex) {
  const imgs = state.product.images;
  if (state.dragIndex == null || state.dragIndex === targetIndex) return;
  const [moved] = imgs.splice(state.dragIndex, 1);
  imgs.splice(targetIndex, 0, moved);
  state.dragIndex = null;
  renderImages();
}

function toPlainProduct() {
  const p = state.product;
  return {
    name: p.name?.value || "",
    brand: p.brand?.value || "",
    brandSku: p.brandSku?.value || "",
    color: p.color?.value || "",
    price: p.price?.value || "",
    currency: p.price?.currency || "",
    availability: p.availability?.value || "",
    fit: p.fit?.value || "",
    material: p.material?.value || "",
    features: (p.features || []).map((f) => f.text),
    careInstructions: p.careInstructions?.value || "",
    sizeTable: p.sizeTable?.value || "",
    description: p.description?.value || ""
  };
}

async function generate() {
  if (!state.product) return;
  els.generateBtn.disabled = true;
  els.generateBtn.textContent = "生成中…";
  try {
    const payload = {
      model: "deepseek",
      language: LANG_FOR_API[state.language] || "English",
      product: toPlainProduct()
    };
    const res = await fetch(GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || `生成失败 ${res.status}`);
    }
    state.result = data.result || null;
    renderPreview();
    renderEditor();
    showToast("✓ 文案已生成");
  } catch (error) {
    console.error(error);
    showToast("生成失败：" + error.message);
  } finally {
    els.generateBtn.disabled = false;
    els.generateBtn.textContent = "✨ 生成文案";
  }
}

async function saveDraft() {
  if (!state.product) return;
  els.saveBtn.disabled = true;
  els.saveBtn.textContent = "保存中…";
  try {
    // 同步编辑器里的修改
    if (state.result) {
      state.result.title = els.editTitle.value.trim();
      state.result.sellingPoints = els.editPoints.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 3);
      state.result.specSummary = els.editSpec.value.trim();
    }
    const draft = {
      id: `draft_${Date.now()}`,
      product: state.product,
      result: state.result,
      language: state.language,
      savedAt: new Date().toISOString()
    };
    const { [DRAFT_KEY]: existing } = await chrome.storage.local.get(DRAFT_KEY);
    const drafts = Array.isArray(existing) ? existing : [];
    drafts.unshift(draft);
    await chrome.storage.local.set({ [DRAFT_KEY]: drafts.slice(0, 50) });
    els.draftSaved.textContent = "已保存草稿 · " + new Date().toLocaleTimeString();
    els.draftSaved.classList.remove("hidden");
    showToast("✓ 已存草稿");
  } catch (error) {
    console.error(error);
    showToast("保存失败");
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = "💾 存草稿";
  }
}

async function exportText() {
  if (!state.result) return;
  state.result.title = els.editTitle.value.trim();
  state.result.sellingPoints = els.editPoints.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  state.result.specSummary = els.editSpec.value.trim();

  const lines = [
    state.result.title,
    "",
    "卖点：",
    ...(state.result.sellingPoints || []).map((s) => "- " + s),
    "",
    "规格：",
    state.result.specSummary,
    "",
    "商品信息告示 / 下单后海外采购 / 预计配送时间 / 退换货规则"
  ];
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    showToast("✓ 已复制");
  } catch (_) {
    showToast("复制失败，请手动选择文本");
  }
}

async function load() {
  // 语言
  try {
    const { glassTranslateSidePanelLanguage } = await chrome.storage.local.get("glassTranslateSidePanelLanguage");
    state.language = glassTranslateSidePanelLanguage || "English";
  } catch (_) {
    state.language = "English";
  }

  // 预览数据
  try {
    const { glassCommercePreview } = await chrome.storage.local.get("glassCommercePreview");
    state.product = glassCommercePreview || null;
  } catch (_) {
    state.product = null;
  }

  if (!state.product) {
    els.empty.classList.remove("hidden");
    els.main.classList.add("hidden");
    return;
  }

  els.empty.classList.add("hidden");
  els.main.classList.remove("hidden");
  renderBadges();
  renderMeta();
  renderDetails();
  renderImages();
  renderPreview();
  renderEditor();
}

els.generateBtn.addEventListener("click", generate);
els.saveBtn.addEventListener("click", saveDraft);
els.exportTextBtn.addEventListener("click", exportText);

load();
