/**
 * Glass Commerce — 商品页注入脚本
 *
 * 在商品页上注入：
 *  1. 「🛒 生成详情页」浮动按钮（常驻右下角）
 *  2. 一个可开关、可拖拽的浮动窗口（承载「生成详情页」UI）
 *
 * 购物车按钮（content.js 工具栏里的 research-button）通过消息 toggle 浮动窗口显隐。
 *
 * 消息协议（content <-> background）：
 *   类型 GLASS_COMMERCE_EXTRACT        （选择器提取兜底）
 *   类型 GLASS_COMMERCE_EXTRACT_AI     （AI 提取）
 *   类型 GLASS_COMMERCE_PREVIEW        （background -> 存 storage）
 *   类型 GLASS_COMMERCE_TOGGLE_WINDOW  （购物车按钮 -> toggle 浮动窗口）
 */
(() => {
  if (window.__glassCommerceInjected) return;
  window.__glassCommerceInjected = true;

  const BUTTON_ID = "glass-commerce-btn";
  const WINDOW_ID = "glass-commerce-window";

  // ---------- 多语言字典（跟随 Glass Translate 工具栏语言） ----------
  const T = {
    en: {
      title: "Glass Commerce · Detail Page",
      generate: "🛒 Generate Detail Page",
      extracting: "Extracting…",
      done: "✓ Generated",
      failed: "Extract failed",
      emptyTitle: "No product extracted yet",
      emptyHint: "Click the 「Generate Detail Page」 button at bottom-right on a product page",
      productInfo: "Product Info",
      extractDetail: "Extracted Details",
      name: "Name", brand: "Brand", sku: "SKU", color: "Color", allColors: "All Colors",
      price: "Price", availability: "Availability", material: "Material / Composition",
      fit: "Fit", care: "Care Instructions", size: "Size", sizeTable: "Size Table",
      description: "Description", rating: "Rating", features: "Selling Points / Features",
      images: "Images (drag to reorder)",
      source: "Source", close: "Close",
      na: "(not extracted)",
      outOfStock: "Out of stock",
      badgeName: "Name", badgeBrand: "Brand", badgeColor: "Color", badgeMaterial: "Material",
      badgePrice: "Price", badgeSizeTable: "Size Table", badgeCare: "Care",
      exportExcel: "Save as Excel"
    },
    zh: {
      title: "Glass Commerce · 生成详情页",
      generate: "🛒 生成详情页",
      extracting: "提取中…",
      done: "✓ 已生成",
      failed: "提取失败",
      emptyTitle: "尚未提取商品",
      emptyHint: "在商品页点击右下角「生成详情页」按钮",
      productInfo: "商品信息",
      extractDetail: "提取详情",
      name: "名称", brand: "品牌", sku: "货号 SKU", color: "颜色", allColors: "全部颜色",
      price: "价格", availability: "库存", material: "材质 / 成分",
      fit: "版型", care: "洗护说明", size: "尺码", sizeTable: "尺码表",
      description: "商品描述", rating: "评分", features: "卖点 / 功能",
      images: "图片排序（拖动调整）",
      source: "来源", close: "关闭",
      na: "（未提取到）",
      outOfStock: "缺货",
      badgeName: "品名", badgeBrand: "品牌", badgeColor: "颜色", badgeMaterial: "材质",
      badgePrice: "价格", badgeSizeTable: "尺码表", badgeCare: "洗护",
      exportExcel: "另存为 Excel"
    },
    ko: {
      title: "Glass Commerce · 상세페이지 생성",
      generate: "🛒 상세페이지 생성",
      extracting: "추출 중…",
      done: "✓ 생성 완료",
      failed: "추출 실패",
      emptyTitle: "아직 상품을 추출하지 않았습니다",
      emptyHint: "상품 페이지에서 우측 하단 「상세페이지 생성」 버튼을 클릭하세요",
      productInfo: "상품 정보",
      extractDetail: "추출 상세",
      name: "상품명", brand: "브랜드", sku: "SKU", color: "색상", allColors: "전체 색상",
      price: "가격", availability: "재고", material: "소재 / 성분",
      fit: "핏", care: "세탁 안내", size: "사이즈", sizeTable: "사이즈표",
      description: "상품 설명", rating: "평점", features: "판매 포인트 / 기능",
      images: "이미지 정렬 (드래그)",
      source: "출처", close: "닫기",
      na: "(추출 안 됨)",
      outOfStock: "품절",
      badgeName: "상품명", badgeBrand: "브랜드", badgeColor: "색상", badgeMaterial: "소재",
      badgePrice: "가격", badgeSizeTable: "사이즈표", badgeCare: "세탁",
      exportExcel: "Excel로 저장"
    },
    ja: {
      title: "Glass Commerce · 詳細ページ生成",
      generate: "🛒 詳細ページ生成",
      extracting: "抽出中…",
      done: "✓ 生成完了",
      failed: "抽出失敗",
      emptyTitle: "まだ商品を抽出していません",
      emptyHint: "商品ページ右下の「詳細ページ生成」ボタンをクリック",
      productInfo: "商品情報",
      extractDetail: "抽出詳細",
      name: "名称", brand: "ブランド", sku: "SKU", color: "カラー", allColors: "全カラー",
      price: "価格", availability: "在庫", material: "素材 / 成分",
      fit: "フィット", care: "お手入れ", size: "サイズ", sizeTable: "サイズ表",
      description: "商品説明", rating: "評価", features: "セールスポイント / 機能",
      images: "画像の並び替え（ドラッグ）",
      source: "ソース", close: "閉じる",
      na: "（未抽出）",
      outOfStock: "品切れ",
      badgeName: "品名", badgeBrand: "ブランド", badgeColor: "カラー", badgeMaterial: "素材",
      badgePrice: "価格", badgeSizeTable: "サイズ表", badgeCare: "お手入れ",
      exportExcel: "Excel として保存"
    },
    fr: {
      title: "Glass Commerce · Page Détail",
      generate: "🛒 Générer la page",
      extracting: "Extraction…",
      done: "✓ Généré",
      failed: "Échec extraction",
      emptyTitle: "Aucun produit extrait",
      emptyHint: "Cliquez sur « Générer la page » en bas à droite sur une page produit",
      productInfo: "Infos produit",
      extractDetail: "Détails extraits",
      name: "Nom", brand: "Marque", sku: "SKU", color: "Couleur", allColors: "Toutes couleurs",
      price: "Prix", availability: "Disponibilité", material: "Matière / Composition",
      fit: "Coupe", care: "Entretien", size: "Taille", sizeTable: "Guide des tailles",
      description: "Description", rating: "Note", features: "Points forts / Fonctions",
      images: "Images (glisser pour trier)",
      source: "Source", close: "Fermer",
      na: "(non extrait)",
      outOfStock: "Épuisé",
      badgeName: "Nom", badgeBrand: "Marque", badgeColor: "Couleur", badgeMaterial: "Matière",
      badgePrice: "Prix", badgeSizeTable: "Taille", badgeCare: "Entretien",
      exportExcel: "Enregistrer en Excel"
    },
    de: {
      title: "Glass Commerce · Detailseite",
      generate: "🛒 Detailseite erstellen",
      extracting: "Extrahiere…",
      done: "✓ Erstellt",
      failed: "Extraktion fehlgeschlagen",
      emptyTitle: "Noch kein Produkt extrahiert",
      emptyHint: "Auf der Produktseite unten rechts auf «Detailseite erstellen» klicken",
      productInfo: "Produktinfo",
      extractDetail: "Extrahierte Details",
      name: "Name", brand: "Marke", sku: "SKU", color: "Farbe", allColors: "Alle Farben",
      price: "Preis", availability: "Verfügbarkeit", material: "Material / Zusammensetzung",
      fit: "Passform", care: "Pflege", size: "Größe", sizeTable: "Größentabelle",
      description: "Beschreibung", rating: "Bewertung", features: "Verkaufsargumente / Funktionen",
      images: "Bilder (ziehen zum Sortieren)",
      source: "Quelle", close: "Schließen",
      na: "(nicht extrahiert)",
      outOfStock: "Ausverkauft",
      badgeName: "Name", badgeBrand: "Marke", badgeColor: "Farbe", badgeMaterial: "Material",
      badgePrice: "Preis", badgeSizeTable: "Größe", badgeCare: "Pflege",
      exportExcel: "Als Excel speichern"
    },
    es: {
      title: "Glass Commerce · Página de Detalle",
      generate: "🛒 Generar página",
      extracting: "Extrayendo…",
      done: "✓ Generado",
      failed: "Extracción fallida",
      emptyTitle: "Aún no se ha extraído ningún producto",
      emptyHint: "Haz clic en «Generar página» abajo a la derecha en una página de producto",
      productInfo: "Info del producto",
      extractDetail: "Detalles extraídos",
      name: "Nombre", brand: "Marca", sku: "SKU", color: "Color", allColors: "Todos los colores",
      price: "Precio", availability: "Disponibilidad", material: "Material / Composición",
      fit: "Ajuste", care: "Cuidados", size: "Talla", sizeTable: "Tabla de tallas",
      description: "Descripción", rating: "Valoración", features: "Puntos de venta / Funciones",
      images: "Imágenes (arrastra para ordenar)",
      source: "Fuente", close: "Cerrar",
      na: "(no extraído)",
      outOfStock: "Agotado",
      badgeName: "Nombre", badgeBrand: "Marca", badgeColor: "Color", badgeMaterial: "Material",
      badgePrice: "Precio", badgeSizeTable: "Talla", badgeCare: "Cuidados",
      exportExcel: "Guardar como Excel"
    }
  };

  const LANG_KEY_BY_VALUE = {
    "English": "en", "中文": "zh", "日本語": "ja", "한국어": "ko",
    "Français": "fr", "Deutsch": "de", "Español": "es",
    "Русский": "zh", "العربية": "zh", "हिन्दी": "zh",
    "en": "en", "zh": "zh", "ja": "ja", "ko": "ko", "fr": "fr", "de": "de", "es": "es"
  };

  let UI_LANG = "zh"; // 默认中文，初始化时从 storage 读取
  const state = { dragIndex: null, product: null, windowOpen: false };
  function t(key) { return (T[UI_LANG] || T.zh)[key] || T.zh[key] || key; }

  // ---------- 浮动「生成详情页」按钮 ----------
  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.setAttribute("translate", "no");
    btn.classList.add("notranslate");
    btn.textContent = t("generate");
    btn.style.cssText = `
      position: fixed; right: 22px; bottom: 22px; z-index: 2147483000;
      display: none; align-items: center; gap: 6px;
      height: 44px; padding: 0 18px; border: none; border-radius: 22px;
      background: #2563eb; color: #fff; font-size: 14px; font-weight: 600;
      cursor: pointer; box-shadow: 0 8px 24px rgba(37,99,235,0.35);
      font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    `;
    btn.addEventListener("click", onGenerate);
    document.body.appendChild(btn);
  }

  // ---------- 跟随 Glass Translate 工具栏显隐 ----------
  // 「生成详情页」按钮只在 Glass Translate 工具栏（#glass-translate-root）存在时显示
  function syncButtonVisibility() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    const toolbarOpen = !!document.getElementById("glass-translate-root");
    btn.style.display = toolbarOpen ? "inline-flex" : "none";
  }

  function watchToolbar() {
    syncButtonVisibility();
    if (window.__glassCommerceWatchingToolbar) return;
    window.__glassCommerceWatchingToolbar = true;
    // 工具栏是点扩展图标后由 background 动态注入的，用 MutationObserver 监听其增删
    const observer = new MutationObserver(() => syncButtonVisibility());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------- 旋转 loading 样式 ----------
  function ensureSpinnerStyle() {
    if (document.getElementById("glass-commerce-spinner-style")) return;
    const style = document.createElement("style");
    style.id = "glass-commerce-spinner-style";
    style.textContent = `
      @keyframes glass-commerce-spin { to { transform: rotate(360deg); } }
      #glass-commerce-btn .gc-spinner {
        width: 16px; height: 16px; flex: 0 0 auto;
        border: 2px solid rgba(255,255,255,0.4);
        border-top-color: #fff; border-radius: 50%;
        animation: glass-commerce-spin 0.7s linear infinite;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setBtnLoading(btn, loading) {
    if (loading) {
      ensureSpinnerStyle();
      btn.innerHTML = `<span class="gc-spinner"></span><span>${t("extracting")}</span>`;
      btn.disabled = true;
    } else {
      btn.textContent = t("generate");
      btn.disabled = false;
    }
  }

  // ---------- 浮动窗口（承载「生成详情页」UI） ----------
  function ensureWindowStyle() {
    if (document.getElementById("glass-commerce-window-style")) return;
    const style = document.createElement("style");
    style.id = "glass-commerce-window-style";
    style.textContent = `
      #${WINDOW_ID} {
        position: fixed; right: 22px; top: 80px; z-index: 2147483000;
        width: 380px; max-height: 78vh; display: none; flex-direction: column;
        background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px;
        box-shadow: 0 16px 48px rgba(15,23,42,0.22);
        font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
        color: #0f172a; font-size: 13px; line-height: 1.5; overflow: hidden;
      }
      #${WINDOW_ID}.open { display: flex; }
      #${WINDOW_ID} .gcw-header {
        display: flex; align-items: center; gap: 8px; padding: 12px 14px;
        background: #fff; border-bottom: 1px solid #e2e8f0; cursor: move;
        font-size: 15px; font-weight: 700; user-select: none;
      }
      #${WINDOW_ID} .gcw-header .logo { font-size: 18px; }
      #${WINDOW_ID} .gcw-close {
        margin-left: auto; width: 28px; height: 28px; border: none; border-radius: 8px;
        background: transparent; color: #64748b; font-size: 18px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      #${WINDOW_ID} .gcw-close:hover { background: #f1f5f9; color: #0f172a; }
      #${WINDOW_ID} .gcw-export {
        margin-left: auto; display: inline-flex; align-items: center; gap: 4px;
        height: 28px; padding: 0 10px; border: 1px solid #16a34a; border-radius: 8px;
        background: #f0fdf4; color: #16a34a; font-size: 12px; font-weight: 600; cursor: pointer;
        white-space: nowrap;
      }
      #${WINDOW_ID} .gcw-export:hover { background: #dcfce7; }
      #${WINDOW_ID} .gcw-export:disabled { opacity: 0.45; cursor: not-allowed; }
      #${WINDOW_ID} .gcw-body { padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
      #${WINDOW_ID} .gcw-card {
        background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;
      }
      #${WINDOW_ID} .gcw-empty { text-align: center; color: #64748b; padding: 32px 12px; }
      #${WINDOW_ID} .gcw-empty .icon { font-size: 40px; margin-bottom: 8px; }
      #${WINDOW_ID} .gcw-label {
        font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;
        letter-spacing: 0.02em; margin-bottom: 4px;
      }
      #${WINDOW_ID} .gcw-row { margin-bottom: 10px; }
      #${WINDOW_ID} .gcw-row .k {
        font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;
        letter-spacing: 0.02em; margin-bottom: 2px;
      }
      #${WINDOW_ID} .gcw-row .v { font-size: 13px; white-space: pre-wrap; word-break: break-word; }
      #${WINDOW_ID} .gcw-row .v.empty { color: #cbd5e1; font-style: italic; }
      #${WINDOW_ID} .gcw-badge {
        display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px;
        font-weight: 600; margin-right: 4px; margin-bottom: 4px;
      }
      #${WINDOW_ID} .gcw-badge.ok { background: #dcfce7; color: #16a34a; }
      #${WINDOW_ID} .gcw-badge.warn { background: #fef3c7; color: #d97706; }
      #${WINDOW_ID} .gcw-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        min-height: 36px; padding: 0 16px; border: 1px solid #2563eb; border-radius: 8px;
        background: #2563eb; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
      }
      #${WINDOW_ID} .gcw-btn:hover { opacity: 0.92; }
      #${WINDOW_ID} .gcw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      #${WINDOW_ID} .gcw-btn.secondary { background: #fff; color: #2563eb; }
      #${WINDOW_ID} .gcw-toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
      #${WINDOW_ID} .gcw-muted { color: #64748b; font-size: 12px; }
      #${WINDOW_ID} .gcw-resize {
        position: absolute; right: 0; bottom: 0; width: 16px; height: 16px;
        cursor: nwse-resize;
      }
      #${WINDOW_ID} .gcw-resize::after {
        content: ""; position: absolute; right: 3px; bottom: 3px;
        width: 8px; height: 8px; border-right: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8;
      }
      #${WINDOW_ID} .gcw-img-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
      #${WINDOW_ID} .gcw-thumb {
        aspect-ratio: 3/4; border-radius: 8px; overflow: hidden; border: 2px solid #e2e8f0;
        cursor: grab; position: relative; background: #f1f5f9;
      }
      #${WINDOW_ID} .gcw-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      #${WINDOW_ID} .gcw-thumb .idx {
        position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.6);
        color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createWindow() {
    ensureWindowStyle();
    if (document.getElementById(WINDOW_ID)) return;

    const win = document.createElement("div");
    win.id = WINDOW_ID;
    win.setAttribute("translate", "no");
    win.classList.add("notranslate");
    win.innerHTML = `
      <div class="gcw-header">
        <span class="logo">🛒</span>
        <span data-gcw="title">${t("title")}</span>
        <button class="gcw-export" id="gcw-export" type="button" title="${t("exportExcel")}" disabled>📊 ${t("exportExcel")}</button>
        <button class="gcw-close" type="button" title="${t("close")}">×</button>
      </div>
      <div class="gcw-body">
        <div class="gcw-empty" id="gcw-empty">
          <div class="icon">🔍</div>
          <div>${t("emptyTitle")}</div>
          <div class="gcw-muted">${t("emptyHint")}</div>
        </div>
        <div id="gcw-content" style="display:none;"></div>
      </div>
      <div class="gcw-resize" id="gcw-resize"></div>
    `;
    document.body.appendChild(win);

    // 关闭按钮
    win.querySelector(".gcw-close").addEventListener("click", () => {
      toggleWindow(false);
      syncWindowState(false);
    });

    // 导出 Excel 按钮
    win.querySelector("#gcw-export").addEventListener("click", () => {
      exportToExcel();
    });

    // 拖拽（标题栏）
    makeDraggable(win, win.querySelector(".gcw-header"));
    // 调整大小（右下角手柄）
    makeResizable(win, win.querySelector("#gcw-resize"));
  }

  function makeDraggable(win, header) {
    let drag = null;
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest(".gcw-close")) return;
      const rect = win.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!drag) return;
      let x = e.clientX - drag.dx;
      let y = e.clientY - drag.dy;
      // 限制在视口内
      x = Math.max(0, Math.min(x, window.innerWidth - 40));
      y = Math.max(0, Math.min(y, window.innerHeight - 40));
      win.style.left = x + "px";
      win.style.top = y + "px";
      win.style.right = "auto";
    });
    document.addEventListener("mouseup", () => { drag = null; });
  }

  function makeResizable(win, handle) {
    let resize = null;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      resize = {
        startX: e.clientX, startY: e.clientY,
        startW: win.offsetWidth, startH: win.offsetHeight
      };
    });
    document.addEventListener("mousemove", (e) => {
      if (!resize) return;
      const w = Math.max(280, Math.min(resize.startW + (e.clientX - resize.startX), window.innerWidth - 20));
      const h = Math.max(200, Math.min(resize.startH + (e.clientY - resize.startY), window.innerHeight - 20));
      win.style.width = w + "px";
      win.style.height = h + "px";
    });
    document.addEventListener("mouseup", () => { resize = null; });
  }

  function toggleWindow(show) {
    const win = document.getElementById(WINDOW_ID);
    if (!win) return;
    if (show) win.classList.add("open");
    else win.classList.remove("open");
  }

  function isWindowOpen() {
    const win = document.getElementById(WINDOW_ID);
    return !!win && win.classList.contains("open");
  }

  function syncWindowState(open) {
    chrome.storage.local.set({ glassCommerceWindowOpen: !!open }).catch(() => {});
  }

  // ---------- 渲染提取结果到浮动窗口 ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderProduct(p) {
    const empty = document.getElementById("gcw-empty");
    const content = document.getElementById("gcw-content");
    if (!p) {
      if (empty) empty.style.display = "";
      if (content) content.style.display = "none";
      return;
    }
    if (empty) empty.style.display = "none";
    if (content) content.style.display = "";

    const f = (x) => (x && (x.value || x.text)) ? String(x.value || x.text).trim() : "";
    const badge = (label, ok) =>
      `<span class="gcw-badge ${ok ? "ok" : "warn"}">${esc(label)}: ${ok ? "✓" : "✗"}</span>`;

    const checks = {
      name: !!f(p.name), brand: !!f(p.brand), color: !!f(p.color),
      material: !!f(p.material), price: !!(p.price && p.price.value),
      sizeTable: !!(p.sizeTable && p.sizeTable.value),
      careInstructions: !!f(p.careInstructions)
    };

    let badges = "";
    const meta = [
      [t("badgeName"), "name"], [t("badgeBrand"), "brand"], [t("badgeColor"), "color"],
      [t("badgeMaterial"), "material"], [t("badgePrice"), "price"],
      [t("badgeSizeTable"), "sizeTable"], [t("badgeCare"), "careInstructions"]
    ];
    meta.forEach(([label, key]) => { badges += badge(label, checks[key]); });

    const row = (k, v) => `<div class="gcw-row"><div class="k">${esc(k)}</div><div class="v${v ? "" : " empty"}">${v ? esc(v) : esc(t("na"))}</div></div>`;

    let html = "";
    html += `<div class="gcw-card"><div class="gcw-label">${t("productInfo")}</div>`;
    html += `<div class="gcw-muted">${t("source")} ${esc(p.source || "generic")} · ID ${esc(p.sourceProductId || "-")}</div>`;
    html += badges;
    html += `</div>`;
    html += `<div class="gcw-card"><div class="gcw-label">${t("extractDetail")}</div>`;
    html += row(t("name"), f(p.name));
    html += row(t("brand"), f(p.brand));
    html += row(t("sku"), f(p.brandSku) || f(p.sku));
    html += row(t("color"), f(p.color));
    if (p.allColors?.list?.length) html += row(t("allColors"), p.allColors.list.join(", "));
    const price = p.price?.value ? `${p.price.value}${p.price.currency ? " " + p.price.currency : ""}` : "";
    html += row(t("price"), price);
    html += row(t("availability"), f(p.availability));
    html += row(t("material"), f(p.material));
    html += row(t("fit"), f(p.fit));
    html += row(t("care"), f(p.careInstructions));
    if (p.sizes?.list?.length || p.sizes?.all?.length) {
      const inStock = p.sizes.inStock || p.sizes.list || [];
      const outOfStock = p.sizes.outOfStock || [];
      let sizeText = inStock.join(", ");
      if (outOfStock.length) sizeText += `（${t("outOfStock")}：${outOfStock.join(", ")}）`;
      html += row(t("size"), sizeText);
    }
    const sizeTableText = p.sizeTable?.value || "";
    if (sizeTableText) html += row(t("sizeTable"), sizeTableText);
    html += row(t("description"), f(p.description));
    if (p.rating?.value) html += row(t("rating"), `${p.rating.value} (${p.rating.count}건)`);
    if (p.features && p.features.length) {
      html += row(t("features"), p.features.map((x) => x.text || x).join("\n"));
    }
    if (p.rawSections?.length) {
      p.rawSections.forEach((s, i) => { html += row(`${t("extractDetail")} · ${esc(s.label)}`, s.text); });
    }
    html += `</div>`;

    // 图片收集 + 拖拽排序（恢复原 side panel 功能）
    const imgs = p.images || [];
    if (imgs.length) {
      html += `<div class="gcw-card"><div class="gcw-label">${t("images")}</div><div class="gcw-img-grid" id="gcw-img-grid"></div></div>`;
    }

    content.innerHTML = html;
    state.product = p;

    // 有结果后启用导出按钮
    const expBtn = document.getElementById("gcw-export");
    if (expBtn) expBtn.disabled = false;

    if (imgs.length) renderImageGrid(imgs);
  }

  function renderImageGrid(imgs) {
    const grid = document.getElementById("gcw-img-grid");
    if (!grid) return;
    grid.innerHTML = "";
    imgs.forEach((img, i) => {
      const thumb = document.createElement("div");
      thumb.className = "gcw-thumb";
      thumb.draggable = true;
      thumb.dataset.index = i;
      thumb.innerHTML = `<img src="${esc(img.url)}" alt="img ${i + 1}" /><span class="idx">${i + 1}</span>`;
      thumb.addEventListener("dragstart", (e) => {
        state.dragIndex = i;
        e.dataTransfer.effectAllowed = "move";
      });
      thumb.addEventListener("dragover", (e) => e.preventDefault());
      thumb.addEventListener("drop", (e) => {
        e.preventDefault();
        dropImage(i);
      });
      grid.appendChild(thumb);
    });
  }

  function dropImage(targetIndex) {
    const imgs = state.product?.images;
    if (!imgs || state.dragIndex == null || state.dragIndex === targetIndex) return;
    const [moved] = imgs.splice(state.dragIndex, 1);
    imgs.splice(targetIndex, 0, moved);
    state.dragIndex = null;
    renderImageGrid(imgs);
  }

  // ---------- 导出 Excel（CSV，Excel/WPS 可直接打开） ----------
  function exportToExcel() {
    const p = state.product;
    if (!p) {
      const btn = document.getElementById("gcw-export");
      if (btn) { btn.disabled = true; }
      return;
    }

    const v = (x) => (x && (x.value || x.text)) ? String(x.value || x.text).trim() : "";
    const price = p.price?.value ? `${p.price.value}${p.price.currency ? " " + p.price.currency : ""}` : "";
    const inStock = (p.sizes?.inStock || p.sizes?.list || []).join(", ");
    const outStock = (p.sizes?.outOfStock || []).join(", ");
    const sizeField = inStock + (outStock ? `（${t("outOfStock")}：${outStock}）` : "");
    const features = (p.features || []).map((x) => x.text || x).join("\n");
    const images = (p.images || []).map((x) => x.url || x).join("\n");
    const rawSections = (p.rawSections || []).map((s) => `${s.label}: ${s.text}`).join("\n");

    const rows = [
      [t("name"), v(p.name)],
      [t("brand"), v(p.brand)],
      [t("sku"), v(p.brandSku) || v(p.sku)],
      [t("color"), v(p.color)],
      [t("allColors"), p.allColors?.list?.join(", ") || ""],
      [t("price"), price],
      [t("availability"), v(p.availability)],
      [t("material"), v(p.material)],
      [t("fit"), v(p.fit)],
      [t("care"), v(p.careInstructions)],
      [t("size"), sizeField],
      [t("sizeTable"), p.sizeTable?.value || ""],
      [t("description"), v(p.description)],
      [t("rating"), p.rating?.value ? `${p.rating.value} (${p.rating.count || 0})` : ""],
      [t("features"), features],
      [t("images"), images]
    ];
    if (rawSections) rows.push([t("source"), rawSections]);

    // CSV 转义（字段含逗号/引号/换行时包引号并转义内部引号）
    const csvEscape = (s) => {
      s = String(s == null ? "" : s);
      if (/[\",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    // 表头：字段 + 值（两列）
    const lines = [csvEscape(t("productInfo")) + "," + csvEscape(t("extractDetail"))];
    rows.forEach(([k, val]) => { lines.push(csvEscape(k) + "," + csvEscape(val)); });

    // UTF-8 BOM 防 Excel 打开中文/韩文乱码
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (v(p.name) || v(p.brandSku) || "product").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
    a.href = url;
    a.download = (safeName || "product") + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- 提取流程 ----------
  async function onGenerate() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn || btn.disabled) return;
    setBtnLoading(btn, true);

    try {
      let product;
      try {
        product = await runExtractorAI();
      } catch (aiError) {
        console.warn("[GlassCommerce] AI 提取失败，回退选择器提取", aiError);
        product = await runExtractor();
      }

      // 存 storage（供可能的 side panel 兼容读取）+ 翻译字段值后渲染到浮动窗口
      chrome.runtime.sendMessage({ type: "GLASS_COMMERCE_PREVIEW", product });
      renderProduct(product);
      toggleWindow(true);
      syncWindowState(true);

      // 异步翻译字段值（商品名/描述/材质等），完成后刷新显示
      translateProductContent(product).then((translated) => {
        if (translated) renderProduct(translated);
      }).catch((e) => console.warn("[GlassCommerce] 字段翻译失败", e));

      btn.innerHTML = `<span>${t("done")}</span>`;
      btn.disabled = true;
    } catch (error) {
      console.error("[GlassCommerce]", error);
      btn.textContent = t("failed");
      btn.disabled = true;
      showErrorToast(error);
    } finally {
      setTimeout(() => setBtnLoading(btn, false), 1200);
    }
  }

  // 把提取出的字段值翻译成当前目标语言；返回带翻译文本的新 product（失败返回 null）
  async function translateProductContent(product) {
    if (!product) return null;
    const targetLang = targetLanguageName() || "English";
    // 旧逻辑：目标语言是英文就直接短路，导致 UI_LANG 状态哪怕是 en（未同步到 zh），
    // 翻译也会被静默跳过，韩语/德语脏数据原样留下。
    // 新逻辑：不再依赖这个脆弱的短路。只收集所有字段的可见文本，
    // 若文本里存在韩文/日文/中文等非拉丁字符（即确需翻译），就照常翻译。

    const v = (x) => (x && (x.value || x.text)) ? String(x.value || x.text).trim() : "";
    const blocks = [];
    const push = (id, text) => { if (text) blocks.push({ id, sourceText: text }); };

    push("name", v(product.name));
    push("brand", v(product.brand));
    push("color", v(product.color));
    if (product.allColors?.list?.length) push("allColors", product.allColors.list.join(", "));
    const sizesIn = product.sizes?.inStock || product.sizes?.list || [];
    const sizesOut = product.sizes?.outOfStock || [];
    if (sizesIn.length || sizesOut.length) {
      const sizesText = sizesIn.join(", ") + (sizesOut.length ? " (" + sizesOut.join(", ") + ")" : "");
      push("sizes", sizesText);
    }
    push("availability", v(product.availability));
    push("material", v(product.material));
    push("fit", v(product.fit));
    push("care", v(product.careInstructions));
    const sizeTableText = product.sizeTable?.value || "";
    if (sizeTableText) push("sizeTable", sizeTableText);
    push("description", v(product.description));
    if (product.features?.length) push("features", product.features.map((x) => x.text || x).join("\n"));
    if (product.rawSections?.length) {
      product.rawSections.forEach((s, i) => push(`raw_${i}`, s.text));
    }

    if (!blocks.length) return null;

    const translatedMap = await requestFieldTranslation(blocks, targetLang);
    if (!translatedMap) return null;

    // 克隆 product，替换翻译后的字段值
    const out = JSON.parse(JSON.stringify(product));
    const setT = (src, key) => {
      const id = translatedMap[key];
      if (id && src) {
        if (src.value != null) src.value = id;
        else if (src.text != null) src.text = id;
      }
    };
    setT(out.name, "name");
    setT(out.brand, "brand");
    setT(out.color, "color");
    setT(out.availability, "availability");
    setT(out.material, "material");
    setT(out.fit, "fit");
    setT(out.careInstructions, "care");
    if (out.allColors?.list?.length && translatedMap.allColors) {
      out.allColors.list = translatedMap.allColors.split(/\s*[,，]\s*/).filter(Boolean);
      out.allColors.value = out.allColors.list.join(", ");
    }
    if (out.sizes && translatedMap.sizes) {
      const sizeParts = translatedMap.sizes;
      out.sizes.inStock = sizeParts;
      out.sizes.list = sizeParts;
      out.sizes.outOfStock = [];
    }
    if (out.sizeTable && translatedMap.sizeTable) out.sizeTable.value = translatedMap.sizeTable;
    setT(out.description, "description");
    if (out.features?.length && translatedMap.features) {
      const lines = translatedMap.features.split(/\n+/).filter(Boolean);
      out.features.forEach((f, i) => { if (lines[i]) f.text = lines[i]; });
    }
    if (out.rawSections?.length) {
      out.rawSections.forEach((s, i) => { if (translatedMap[`raw_${i}`]) s.text = translatedMap[`raw_${i}`]; });
    }
    return out;
  }

  // 调后端 /api/translate-text 翻译字段块，返回 { id: 译文 } 映射
  function requestFieldTranslation(blocks, targetLang) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "GLASS_COMMERCE_TRANSLATE_FIELDS", blocks, targetLanguage: targetLang },
        (response) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (response?.ok && response.translatedMap) resolve(response.translatedMap);
          else reject(new Error(response?.error || "字段翻译失败"));
        }
      );
    });
  }

  function targetLanguageName() {
    // UI_LANG 是短键（zh/en/ko/...），映射回后端需要的目标语言名
    const map = { zh: "中文", en: "English", ko: "한국어", ja: "日本語", fr: "Français", de: "Deutsch", es: "Español" };
    return map[UI_LANG] || UI_LANG;
  }

  async function runExtractor() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GLASS_COMMERCE_EXTRACT" }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response?.ok && response.product) resolve(response.product);
        else reject(new Error(response?.error || "提取失败"));
      });
    });
  }

  async function runExtractorAI() {
    return new Promise((resolve, reject) => {
      // 目标语言直接取 UI 选择（和字段翻译 targetLanguageName() 同一来源）。
      // 之前读 window.__glassCommerceLanguage 该变量从未被赋值，永远 undefined → fallback "English"，
      // 导致用户在 UI 选中文后，提取内容语言仍不受控制（输出源语言/韩语脏数据）。
      const language = targetLanguageName() || "English";
      chrome.runtime.sendMessage(
        { type: "GLASS_COMMERCE_EXTRACT_AI", language },
        (response) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (response?.ok && response.product) resolve(response.product);
          else reject(new Error(response?.error || "AI 提取失败"));
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

  // ---------- 监听购物车按钮的 toggle 指令 ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "GLASS_COMMERCE_TOGGLE_WINDOW") {
      const next = !isWindowOpen();
      toggleWindow(next);
      syncWindowState(next);
    }
    // 语言切换广播：直接套用语言值，实时刷新浮窗文案
    if (msg?.type === "GLASS_COMMERCE_LANGUAGE") {
      applyLanguageValue(msg.language);
    }
  });

  // ---------- 初始化 ----------
  // 从 storage 读取（启动时的初始语言）
  function applyLanguage() {
    try {
      chrome.storage.local.get(
        ["glassTranslateDefaultLanguage", "glassTranslateSidePanelLanguage"],
        (r) => {
          const langValue = r?.glassTranslateDefaultLanguage || r?.glassTranslateSidePanelLanguage || "English";
          applyLanguageValue(langValue);
        }
      );
    } catch (_) {}
  }

  // 套用语言值（storage 初始值 or 广播传来的 currentLanguage）
  function applyLanguageValue(langValue) {
    const key = LANG_KEY_BY_VALUE[langValue] || "zh";
    if (key !== UI_LANG) {
      UI_LANG = key;
      refreshUI();
    }
  }

  // 语言变化时刷新窗口标题、按钮文案与字段标签（已渲染的提取内容保持原样，不重复拉取/不重新翻译）
  function refreshUI() {
    const win = document.getElementById(WINDOW_ID);
    const titleEl = win?.querySelector("[data-gcw='title']");
    if (titleEl) titleEl.textContent = t("title");
    const closeBtn = win?.querySelector(".gcw-close");
    if (closeBtn) closeBtn.title = t("close");
    const btn = document.getElementById(BUTTON_ID);
    if (btn && !btn.disabled) btn.textContent = t("generate");
    const empty = document.getElementById("gcw-empty");
    if (empty && empty.style.display !== "none") {
      empty.querySelector(".gcw-muted").textContent = t("emptyHint");
      empty.querySelectorAll("div")[1].textContent = t("emptyTitle");
    }
    // 已有提取结果时重新渲染面板：字段标签（t()）跟随语言实时变化，内容保持原样不翻译
    if (state.product && !document.getElementById("gcw-empty")?.offsetParent) {
      renderProduct(state.product);
    }
  }

  function init() {
    applyLanguage();
    createButton();
    createWindow();
    watchToolbar();
    // 语言变化监听
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && (changes.glassTranslateDefaultLanguage || changes.glassTranslateSidePanelLanguage)) {
          applyLanguage();
        }
      });
    } catch (_) {}
  }

  function ensureUI() {
    if (document.body) { init(); return; }
    const observer = new MutationObserver(() => {
      if (document.body) { init(); observer.disconnect(); }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  setTimeout(ensureUI, 1000);
  window.addEventListener("load", ensureUI);
})();
