/**
 * Glass Commerce — 通用商品提取器（全字段版）
 *
 * 作为内容脚本注入（非 ES module），函数挂到 window.__glassCommerceExtractor。
 *
 * 目标：把商品页的关键介绍信息尽可能全部、干净地抓出来：
 *   - 基础：名称 / 品牌 / 货号 / 颜色 / 价格 / 库存
 *   - 描述：商品描述 / 功能卖点列表
 *   - 规格：材质(成分) / 版型 / 洗护说明 / 尺码表
 *   - 图片：og:image + 相册
 * 优先 JSON-LD Product schema，再用通用语义标签 + 多策略关键字兜底。
 */

(function () {
  if (window.__glassCommerceExtractor) return;

  function buildEmptyProduct() {
    return {
      source: detectSource(),
      sourceProductId: "",
      name: { value: "", source: "", status: "missing" },
      brand: { value: "", source: "", status: "missing" },
      brandSku: { value: "", source: "", status: "missing" },
      color: { value: "", source: "", status: "missing" },
      price: { value: "", source: "", status: "missing", currency: "" },
      availability: { value: "", source: "", status: "missing" },
      images: [],
      fit: { value: "", source: "", status: "missing" },
      material: { value: "", source: "", status: "missing" },
      features: [],
      careInstructions: { value: "", source: "", status: "missing" },
      sizeTable: { value: "", source: "", status: "missing", rows: [] },
      description: { value: "", source: "", status: "missing" },
      rawSections: [], // [{ label, text, source }] 页面上所有疑似商品信息段落
      extractedAt: new Date().toISOString(),
      pageUrl: ""
    };
  }

  function detectSource() {
    const h = location.hostname;
    if (h.includes("nordstrom")) return "nordstrom";
    if (h.includes("tradeinn")) return "tradeinn";
    if (h.includes("dressinn")) return "dressinn";
    if (h.includes("zappos")) return "zappos";
    if (h.includes("amazon")) return "amazon";
    return "generic";
  }

  function setField(obj, key, value, source) {
    if (value && String(value).trim()) {
      obj[key] = { value: String(value).trim(), source, status: "confirmed" };
    } else {
      obj[key] = { value: "", source: "", status: "missing" };
    }
  }

  function fieldConfirmed(field) {
    return field && field.status === "confirmed";
  }

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function typeOf(node) {
    const t = node?.["@type"];
    if (Array.isArray(t)) return t.join(",");
    return String(t || "");
  }

  // 从 URL 里提取商品 ID（product/xxx，或 dp/xxx，或 item/xxx 等）
  function extractUrlId(url) {
    const m = String(url || location.href).match(/\/(?:product|item|dp|p|style|prod)\/([A-Za-z0-9]+)/i);
    if (m) return m[1];
    const m2 = String(url || location.href).match(/\/(\d{6,})\b/);
    return m2 ? m2[1] : "";
  }

  function pushUnique(arr, val) {
    if (val && !arr.includes(val)) arr.push(val);
  }

  function addFeature(product, text, source) {
    const t = clean(text);
    if (t && !product.features.find((f) => f.text === t)) {
      product.features.push({ text: t, source });
    }
  }

  function addRawSection(product, label, text, source) {
    const t = clean(text);
    if (!t || t.length < 3) return;
    if (product.rawSections.find((s) => s.text === t)) return;
    product.rawSections.push({ label, text: t, source });
  }

  /* ---------------- JSON-LD ---------------- */
  function extractFromJsonLd(product) {
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    );
    // 先把所有 Product 节点收集起来，再选出「主商品」
    const products = [];
    for (const script of scripts) {
      let data;
      try {
        data = JSON.parse(script.textContent || "{}");
      } catch (_) {
        continue;
      }
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const graphed = Array.isArray(item?.["@graph"]) ? item["@graph"] : [];
        const candidates = graphed.length ? graphed : [item];
        for (const node of candidates) {
          if (typeOf(node).includes("Product")) {
            products.push(node);
          }
        }
      }
    }

    // 选主商品：优先「用 URL 里的商品 ID 精确匹配 sku」，因为 Zappos 等站点
    // 页面会埋多个商品（当前商品 + 相似推荐），URL 的 product/xxx ID 是最可靠的锚点。
    const urlId = extractUrlId(location.href);
    const norm = (v) => String(v || "").replace(/\D/g, "");
    const skuMatches = (n) => {
      if (!n) return false;
      const candidates = [n.sku, n.mpn, n.productID, n["@id"]];
      const m = norm(urlId);
      if (!m) return false;
      return candidates.some((c) => c && norm(c) === m);
    };

    let main = null;
    if (urlId) {
      main = products.find(skuMatches) ||
             products.find((n) => {
               // 兜底：url 里含当前 sku
               const u = String(n.url || n.offers?.url || "");
               return u && u.includes(String(urlId));
             });
    }
    if (!main) {
      const noSim = (u) => !/sims_|recommend|related/i.test(String(u || ""));
      main = products.find((n) => noSim(n.url) && !noSim(n.offers?.url)) ||
             (products.find((n) => noSim(n.url) && noSim(n.offers?.url)) ) ||
             products[0];
    }

    if (main) {
      const node = main;
      if (node.name) setField(product, "name", node.name, "json-ld:name");
      if (!product.brand.value && node.brand) {
        const brandName =
          typeof node.brand === "string" ? node.brand : node.brand?.name;
        setField(product, "brand", brandName, "json-ld:brand");
      }
      if (node.sku) setField(product, "brandSku", node.sku, "json-ld:sku");
      if (node.mpn) setField(product, "brandSku", node.mpn, "json-ld:mpn");
      if (node.color) setField(product, "color", node.color, "json-ld:color");
      if (node.material) setField(product, "material", node.material, "json-ld:material");
      if (node.description) setField(product, "description", node.description, "json-ld:description");
      if (node.image) {
        const imgs = Array.isArray(node.image) ? node.image : [node.image];
        imgs.forEach((img) => {
          const url = typeof img === "string" ? img : img?.url;
          if (url && !product.images.find((i) => i.url === url)) {
            product.images.push({ url, source: "json-ld:image" });
          }
        });
      }
      if (node.additionalProperty) {
        const props = Array.isArray(node.additionalProperty)
          ? node.additionalProperty
          : [node.additionalProperty];
        props.forEach((p) => {
          if (!p?.name) return;
          const v = clean(p.value);
          const n = String(p.name).toLowerCase();
          if (v && (n.includes("material") || n.includes("fabric") || n.includes("composition"))) {
            setField(product, "material", v, "json-ld:additionalProperty");
          } else if (v && (n.includes("care") || n.includes("wash"))) {
            setField(product, "careInstructions", v, "json-ld:additionalProperty");
          } else if (v && (n.includes("fit") || n.includes("版型"))) {
            setField(product, "fit", v, "json-ld:additionalProperty");
          } else if (v) {
            addRawSection(product, n, v, "json-ld:additionalProperty");
          }
        });
      }
      const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      if (offer) {
        if (offer.price !== undefined && offer.price !== null) {
          product.price = {
            value: String(offer.price),
            source: "json-ld:offers.price",
            status: "confirmed",
            currency: offer.priceCurrency || ""
          };
        }
        if (offer.sku && !fieldConfirmed(product.brandSku)) {
          setField(product, "brandSku", offer.sku, "json-ld:offers.sku");
        }
        if (offer.availability) {
          const av =
            typeof offer.availability === "string"
              ? offer.availability
              : offer.availability?.["@type"] || offer.availability?.name;
          setField(product, "availability", av, "json-ld:offers.availability");
        }
      }
      if (node.productID) product.sourceProductId = String(node.productID);
      if (node.aggregateRating?.ratingValue) {
        product.rating = {
          value: String(node.aggregateRating.ratingValue),
          count: node.aggregateRating.reviewCount || node.aggregateRating.ratingCount || 0,
          source: "json-ld:rating",
          status: "confirmed"
        };
      }
    }
  }

  /* ---------------- DOM ---------------- */
  function extractFromDom(product) {
    product.pageUrl = location.href;

    if (!product.sourceProductId) {
      const urlId = extractUrlId(location.href);
      if (urlId) product.sourceProductId = urlId;
    }

    // 名称
    if (!fieldConfirmed(product.name)) {
      const nameSel =
        document.querySelector('[itemprop="name"]') ||
        document.querySelector('[data-testid*="product-title" i]') ||
        document.querySelector('h1[class*="title" i]') ||
        document.querySelector('h1[class*="name" i]') ||
        document.querySelector("h1");
      setField(product, "name", nameSel?.textContent, "dom:h1");
    }

    // 品牌
    if (!fieldConfirmed(product.brand)) {
      const brandSel =
        document.querySelector('[itemprop="brand"]') ||
        document.querySelector('[class*="brand" i]');
      setField(product, "brand", brandSel?.textContent, "dom:brand");
    }

    // 颜色（多选）：主商品颜色组在 div[data-testid="colorDisplayGroup-all"]，
    // 颜色项是 label[data-testid^="colorSwatch-"] 里的 input[type=radio][name="colorSelect"]，
    // 颜色名在 input 的 aria-label（"Select the XXX color option"），当前选中色带 checked。
    const colorInputs = Array.from(
      document.querySelectorAll('[data-testid="colorDisplayGroup-all"] input[name="colorSelect"], [data-testid="colorDisplayGroup"] input[name="colorSelect"]')
    );
    if (colorInputs.length) {
      const colors = [];
      let selected = "";
      colorInputs.forEach((i) => {
        const aria = i.getAttribute("aria-label") || "";
        const m = aria.match(/select the (.+?) color option/i);
        const c = m ? clean(m[1]) : "";
        if (c && !colors.includes(c)) colors.push(c);
        if (c && i.hasAttribute("checked") && !selected) selected = c;
      });
      if (colors.length) {
        product.allColors = { value: colors.join(", "), source: "dom:colorDisplayGroup", status: "confirmed", list: colors };
      }
      // 当前选中色：优先 checked，其次页面顶部“Color: XXX”文本
      if (!selected) {
        const colorLabel = Array.from(document.querySelectorAll('span')).find(
          (el) => el.children.length === 0 && /^\s*color\s*:?\s*/i.test((el.textContent || "").trim())
        );
        const val = colorLabel?.nextElementSibling?.textContent;
        if (val) selected = clean(val);
      }
      if (selected) {
        setField(product, "color", selected, "dom:colorDisplayGroup");
      } else if (colors.length && !fieldConfirmed(product.color)) {
        setField(product, "color", colors[0], "dom:colorDisplayGroup");
      }
    }

    if (!fieldConfirmed(product.color)) {
      const colorSel =
        document.querySelector('[itemprop="color"]') ||
        document.querySelector('[class*="color" i][class*="selected" i]') ||
        document.querySelector('[data-selected="true"]') ||
        document.querySelector('[aria-label*="color" i]');
      setField(product, "color", colorSel?.textContent, "dom:color");
    }

    // 尺码（多档）：读 input[name=size] 的 radio，区分「有货/缺货」。
    // Zappos 缺货的尺码 aria-label 会带 "Out of Stock"。
    const sizeInputs = Array.from(document.querySelectorAll('input[type="radio"][name="size"]'));
    if (sizeInputs.length) {
      const inStock = [];
      const outOfStock = [];
      sizeInputs.forEach((i) => {
        const val = i.value || clean(i.getAttribute("aria-label")?.replace(/^size\s*/i, ""));
        const aria = i.getAttribute("aria-label") || "";
        if (!val) return;
        if (/out of stock/i.test(aria) || i.disabled) {
          if (!outOfStock.includes(val)) outOfStock.push(val);
        } else {
          if (!inStock.includes(val)) inStock.push(val);
        }
      });
      if (inStock.length || outOfStock.length) {
        product.sizes = {
          value: inStock.join(", "),
          source: "dom:size-radio",
          status: "confirmed",
          list: inStock,
          all: inStock.concat(outOfStock),
          inStock,
          outOfStock
        };
      }
    } else {
      const sizeBtns = Array.from(document.querySelectorAll('[data-testid*="size" i] button, button[aria-label*="size" i]'))
        .map((b) => clean(b.textContent || b.getAttribute("aria-label")))
        .filter((t) => t && /^(XS|S|M|L|XL|XXL|XXXL|1X|2X|3X|4X|[0-9]{1,3}(\.[0-9])?)$/i.test(t));
      const uniqueSizes = Array.from(new Set(sizeBtns));
      if (uniqueSizes.length) {
        product.sizes = { value: uniqueSizes.join(", "), source: "dom:size-btn", status: "confirmed", list: uniqueSizes, all: uniqueSizes, inStock: uniqueSizes, outOfStock: [] };
      }
    }

    // 价格
    if (!fieldConfirmed(product.price)) {
      const priceSel =
        document.querySelector('[itemprop="price"]') ||
        document.querySelector('[data-testid*="price" i]') ||
        document.querySelector('[class*="price" i]');
      const priceText = clean(priceSel?.textContent || "");
      const priceNum = priceText.replace(/[^0-9.,]/g, "");
      if (priceNum) {
        product.price = {
          value: priceNum.replace(",", "."),
          source: "dom:price",
          status: "confirmed",
          currency: /\$/.test(priceText) ? "USD" : /€/.test(priceText) ? "EUR" : /£/.test(priceText) ? "GBP" : /₩/.test(priceText) ? "KRW" : ""
        };
      }
    }

    // 尺码表
    const sizeTableSel =
      document.querySelector('[class*="size" i] table') ||
      document.querySelector('table[class*="size" i]') ||
      document.querySelector(".size-guide table") ||
      document.querySelector(".size-chart table");
    if (!sizeTableSel) {
      // 兜底：任何含 size 关键字的容器里的 table
      const anyTable = document.querySelector('table');
      if (anyTable) product.sizeTable = parseTable(anyTable);
    } else {
      product.sizeTable = parseTable(sizeTableSel);
    }

    // 描述（多策略）
    if (!fieldConfirmed(product.description)) {
      const descSel =
        document.querySelector('[itemprop="description"]') ||
        document.querySelector('[class*="description" i]') ||
        document.querySelector('[class*="product-details" i]') ||
        document.querySelector('[class*="details" i]') ||
        document.querySelector('[data-testid*="description" i]');
      if (descSel) {
        setField(product, "description", descSel.textContent, "dom:description");
        // 从描述里拆出 li 作为卖点
        descSel.querySelectorAll("li").forEach((li) => addFeature(product, li.textContent, "dom:features"));
      }
    }

    // 功能卖点：扫描所有列表项，识别「卖点」性质
    const listItems = document.querySelectorAll(
      'ul li, [class*="feature" i] li, [class*="bullet" i] li'
    );
    listItems.forEach((li) => {
      const t = clean(li.textContent);
      if (t && t.length >= 4 && t.length <= 200) addFeature(product, t, "dom:list");
    });

    // 材质
    if (!fieldConfirmed(product.material)) {
      const materialSel =
        document.querySelector('[itemprop="material"]') ||
        document.querySelector('[data-testid*="material" i]') ||
        document.querySelector('[class*="material" i]') ||
        document.querySelector('[class*="fabric" i]') ||
        document.querySelector('[class*="composition" i]');
      setField(product, "material", materialSel?.textContent, "dom:material");
    }

    // 洗护
    if (!fieldConfirmed(product.careInstructions)) {
      const careSel =
        document.querySelector('[class*="care" i]') ||
        document.querySelector('[data-testid*="care" i]') ||
        document.querySelector('[class*="washing" i]') ||
        document.querySelector('[class*="fabric-care" i]') ||
        document.querySelector('[class*="machine wash" i]');
      setField(product, "careInstructions", careSel?.textContent, "dom:care");
    }

    // 版型
    if (!fieldConfirmed(product.fit)) {
      const fitSel =
        document.querySelector('[class*="fit" i]') ||
        document.querySelector('[class*="sizing" i]');
      setField(product, "fit", fitSel?.textContent, "dom:fit");
    }

    // 图片
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg?.content) {
      product.images.push({ url: ogImg.content, source: "meta:og:image" });
    }
    document.querySelectorAll(
      "[itemprop='image'], [class*='product' i] img, [class*='gallery' i] img, [class*='carousel' i] img, [class*='media' i] img"
    ).forEach((img) => {
      const url = img.currentSrc || img.src || img.getAttribute("data-src");
      if (url && url.startsWith("http") && !product.images.find((i) => i.url === url)) {
        product.images.push({ url, source: "dom:gallery" });
      }
    });

    // 兜底：把页面里所有疑似商品信息的长段落抓进 rawSections，供用户判断
    collectRawSections(product);
  }

  function parseTable(table) {
    const rows = Array.from(table.querySelectorAll("tr"))
      .map((tr) => Array.from(tr.querySelectorAll("th,td")).map((td) => clean(td.textContent)))
      .filter((r) => r.length > 0 && r.some((c) => c));
    return {
      value: rows.map((r) => r.join(" | ")).join("\n"),
      source: "dom:table",
      status: rows.length ? "confirmed" : "missing",
      rows
    };
  }

  // 关键词 → 段落标签，用于把页面正文归类
  const SECTION_RULES = [
    { label: "材质/成分", re: /(material|fabric|composition|shell|lining|fill|polyester|wool|leather|shearling|cotton|nylon|材质|成分|面料|겉감|안감|소재)/i },
    { label: "洗护", re: /(care|wash|dry clean|machine wash|do not|iron|洗|세탁|드라이|다림질)/i },
    { label: "尺码/版型", re: /(size|fit|measurement|chest|length|sleeve|waist|尺码|版型|사이즈|핏)/i },
    { label: "功能/设计", re: /(feature|design|hood|pocket|zip|adjust|ventilation|breathable|waterproof|water.?repellent|기능|후드|포켓|지퍼|방수|투습|통기)/i }
  ];

  function collectRawSections(product) {
    // 抓取商品信息容器里的正文段落和标题
    const containers = document.querySelectorAll(
      '[class*="product-details" i], [class*="product-info" i], [class*="description" i], [class*="accordion" i], [class*="specification" i], [class*="details" i]'
    );
    containers.forEach((c) => {
      const text = clean(c.textContent);
      if (!text || text.length < 8 || text.length > 4000) return;
      let label = "商品说明";
      for (const rule of SECTION_RULES) {
        if (rule.re.test(text)) { label = rule.label; break; }
      }
      addRawSection(product, label, text, "dom:container");
    });

    // 兜底：meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc?.content) {
      addRawSection(product, "Meta描述", metaDesc.content, "meta:description");
    }
  }

  function extractProduct() {
    const product = buildEmptyProduct();
    extractFromJsonLd(product);
    extractFromDom(product);
    return product;
  }

  /**
   * 抓取当前页面的清洗后文本，供 AI 提取（/api/extract）使用。
   * 不是硬编码选择器，而是把页面的「商品相关信息」尽可能收集成纯文本，
   * 交给 AI 理解并抽取结构化字段——因此对任意网站通用。
   */
  function collectPageText() {
    const chunks = [];

    // 1) JSON-LD（商品结构化数据最干净，优先）
    const jsonld = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      if (s.textContent) jsonld.push(s.textContent.trim());
    });
    if (jsonld.length) {
      chunks.push("=== JSON-LD ===\n" + jsonld.join("\n---\n"));
    }

    // 2) 页面标题
    const title = document.querySelector("title")?.textContent || "";
    if (title) chunks.push("=== TITLE ===\n" + clean(title));

    // 3) meta 描述
    const metaDesc = document.querySelector('meta[name="description"], meta[property="og:description"]');
    if (metaDesc?.content) chunks.push("=== META_DESC ===\n" + metaDesc.content.trim());

    // 4) 正文容器里的候选段落（去掉 script/style/nav/header/footer）
    const blocked = "script,style,noscript,svg,iframe,header,footer,nav,form";
    const containers = document.querySelectorAll(
      '[itemprop="description"], [class*="product-detail" i], [class*="product-info" i], ' +
      '[class*="product-description" i], [class*="description" i], [class*="details" i], ' +
      '[class*="specification" i], [class*="accordion" i], [class*="material" i], [class*="care" i], ' +
      'main, article, [data-testid*="description" i], [data-testid*="detail" i]'
    );
    const seen = new Set();
    containers.forEach((c) => {
      const clone = c.cloneNode(true);
      clone.querySelectorAll(blocked).forEach((n) => n.remove());
      const text = clean(clone.textContent);
      if (text && text.length >= 12 && text.length <= 4000 && !seen.has(text)) {
        seen.add(text);
        chunks.push(text);
      }
    });

    // 去重后的最终文本（限制总长度）
    const joined = chunks.join("\n\n\n");
    return joined.slice(0, 9000);
  }

  window.__glassCommerceExtractor = extractProduct;
  window._glassCommerceExtractProduct = extractProduct;
  window.__glassCommerceCollectPageText = collectPageText;
})();
