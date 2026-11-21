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
  const GC_EXTRACTOR_VERSION = 2;

  // 版本号从 manifest 依赖无法直接注入到内容脚本，用硬编码递增版本覆盖旧 tab 的旧实现。
  // 旧 tab 里若已挂载旧版 extractor，且版本低于当前，则强制重新挂载，避免锁死旧代码。
  if (window.__glassCommerceExtractor && window.__gcExtractorVersion === GC_EXTRACTOR_VERSION) return;

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
    // 统一用 clean 压缩连续空白（\s+ → 单空格）：避免 textContent 里 <br>/空 <p> 的成串 \n
    // 在面板渲染时被 white-space:pre-wrap 摊成大片空白。
    const v = clean(value);
    if (v) {
      obj[key] = { value: v, source, status: "confirmed" };
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

  // 字段级安全校验：抓到的字段值若明显是「评论用户名/账户文案/加载占位/纯数字日期」等噪声，
  //   则判定为误抓（返回 true），由调用方放弃该值、交给后端 AI。
  function looksLikeNoiseField(text) {
    const t = String(text || "").trim();
    if (!t) return true;
    if (t.length < 3 || t.length > 2000) return true;
    // 加载占位符
    if (/^(loader|loading|スケルトン|skeleton|spinner|lade|chargement|로딩)\b/i.test(t)) return true;
    // 账户/登录/注册文案
    if (/(开设客户账户|创建账户|登录|登入|注册|账号|账户|account|login|register|sign ?in|sign ?up|konto|anmelden|개설|계정|로그인)/i.test(t)) return true;
    // 评论/好评率/日期（“84% 的用户认为…有帮助” / “2018-11-09” / 用户名）
    if (/(%\s*(的)?用户|%의 사용자|helfen|hilfreich|helpful|认为.*有帮助|的用户认为|评论|评价|리뷰|후기|review)/i.test(t)) return true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return true; // 纯日期
    // 客服/联系/FAQ/页脚
    if (/(문의|문의하기|자주 묻는 질문|도움말|联系方式|客服|联系我们|kontakt|hilfe|faq|customer service)/i.test(t)) return true;
    return false;
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
      const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
      const offer = offers[0];
      if (offer) {
        const price = offer.price ?? offer.lowPrice; // AggregateOffer 用 lowPrice
        if (price !== undefined && price !== null) {
          product.price = {
            value: String(price),
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

      // ProductGroup/hasVariant 与多 offer：把所有变体的颜色/尺码收齐
      const variantColors = [];
      const variantSizes = [];
      const variants = Array.isArray(node.hasVariant) ? node.hasVariant : [];
      [...variants, ...offers].forEach((v) => {
        if (!v || typeof v !== "object") return;
        const item = v.itemOffered && typeof v.itemOffered === "object" ? v.itemOffered : v;
        if (item.color) pushUnique(variantColors, clean(item.color));
        if (item.size) pushUnique(variantSizes, clean(typeof item.size === "object" ? item.size.name : item.size));
      });
      if (variantColors.length && !product.allColors?.list?.length) {
        product.allColors = {
          value: variantColors.join(", "),
          source: "json-ld:variants",
          status: "confirmed",
          list: variantColors
        };
      }
      if (variantSizes.length && !product.sizes) {
        product.sizes = {
          value: variantSizes.join(", "),
          source: "json-ld:variants",
          status: "confirmed",
          list: variantSizes,
          all: variantSizes,
          inStock: variantSizes,
          outOfStock: []
        };
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
      const rawName = clean(nameSel?.textContent || "");
      // 防御：抓到的“名称”若实为说明书/手册/文档标题，则丢弃，留给后端 AI 判断
      const isDocTitle = /(사용 설명서|설명서|매뉴얼|manual|anleitung|bedienungsanleitung|gebruiksaanwijzing|說明書|说明书|用户手册|instruction|datenblatt|datasheet|mode d'emploi)/i.test(rawName);
      if (rawName && !isDocTitle) {
        setField(product, "name", rawName, "dom:h1");
      }
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

    // 通用颜色变体 fallback（Template Cloud / tc- 主题等）：
    //   颜色缩略图是 div.variant-farbe 里的 li 项，每项含一个 img，颜色名在 img[alt]（如 Rot/Royal/Schwarz）。
    //   这类站没有 data-testid 选择器，也不给选中项带 active/selected class，
    //   所以这里是“全部颜色”的唯一可究来源。
    if (!product.allColors?.list?.length) {
      const tcColorImgs = Array.from(document.querySelectorAll('.variant-farbe img[alt], .variant-color img[alt]'));
      const tcColors = [];
      tcColorImgs.forEach((img) => {
        const c = clean(img.getAttribute("alt") || "");
        if (c && c.length <= 40 && !/\|/.test(c) && !tcColors.includes(c)) tcColors.push(c);
      });
      if (tcColors.length >= 2) {
        product.allColors = { value: tcColors.join(", "), source: "dom:variant-farbe", status: "confirmed", list: tcColors };
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

    // 尺码兜底：<select> 下拉框（很多站点尺码只在下拉框里，disabled 选项=缺货）
    if (!product.sizes) {
      const sizeSelect = document.querySelector(
        'select[name*="size" i], select[id*="size" i], select[aria-label*="size" i], select[class*="size" i]'
      );
      if (sizeSelect) {
        const inStock = [];
        const outOfStock = [];
        Array.from(sizeSelect.options).forEach((o) => {
          const t = clean(o.textContent);
          if (!t || (!o.value && /select|choose|选择/i.test(t))) return;
          if (o.disabled) {
            if (!outOfStock.includes(t)) outOfStock.push(t);
          } else if (!inStock.includes(t)) {
            inStock.push(t);
          }
        });
        if (inStock.length || outOfStock.length) {
          product.sizes = {
            value: inStock.join(", "),
            source: "dom:size-select",
            status: "confirmed",
            list: inStock,
            all: inStock.concat(outOfStock),
            inStock,
            outOfStock
          };
        }
      }
    }

    // 价格（跳过划线原价：del/s 标签或 old/was/compare 类名里的是促销前价格）
    if (!fieldConfirmed(product.price)) {
      const struck = (el) =>
        !!el.closest('del,s,strike,[class*="old" i],[class*="was" i],[class*="compare" i],[class*="strike" i],[class*="original" i]');
      const candidates = Array.from(document.querySelectorAll(
        '[itemprop="price"], [data-testid*="price" i], [class*="price" i]'
      ));
      const priceSel = candidates.find((el) => !struck(el) && /\d/.test(el.textContent || "")) || candidates[0];
      const priceText = clean(priceSel?.getAttribute("content") || priceSel?.textContent || "");
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
        document.querySelector('[itemprop="careInstructions"]') ||
        document.querySelector('[class*="care-instruction" i]') ||
        document.querySelector('[class*="washing" i]') ||
        document.querySelector('[class*="fabric-care" i]') ||
        document.querySelector('[class*="pflege" i]') ||
        document.querySelector('[class*="Waschanleitung" i]') ||
        document.querySelector('[data-testid*="care" i]');
      const careText = clean(careSel?.textContent || "");
      // 防御：洗护内容若是评论用户名/账户文案/加载占位，则放弃，交给后端 AI
      if (careText && !looksLikeNoiseField(careText)) {
        setField(product, "careInstructions", careText, "dom:care");
      }
    }

    // 版型
    if (!fieldConfirmed(product.fit)) {
      const fitSel =
        document.querySelector('[class*="fit-guide" i]') ||
        document.querySelector('[class*="fit-information" i]') ||
        document.querySelector('[class*="sizing" i]') ||
        document.querySelector('[itemprop="sizing" i]') ||
        document.querySelector('[class*="passform" i]');
      const fitText = clean(fitSel?.textContent || "");
      if (fitText && !looksLikeNoiseField(fitText)) {
        setField(product, "fit", fitText, "dom:fit");
      }
    }

    // 图片 —— 确定性通用收集，不靠 URL 关键词 / class 名猜。
    //   优先级：① JSON-LD image 数组（已在 parseJsonLd 处理） ② og:image/og:image:url
    //   ③ 全页 <img> 按实际渲染面积排序取前 N（商品图远大于 logo/icon/箭头）
    const tryAbsUrl = (raw) => {
      if (!raw) return null;
      try { return new URL(raw, location.href).href; } catch (_) { return null; }
    };
    const pushImg = (rawUrl, source) => {
      const u = tryAbsUrl(rawUrl);
      if (!u || !u.startsWith("http")) return;
      // 只剔除明确的非商品图：svg / 图标 / logo / 头像 / 占位 / 雪碧
      if (/sprite|icon|logo|placeholder|avatar|\.svg(\?|$)|social|flag|brand/i.test(u)) return;
      if (!product.images.find((i) => i.url === u)) {
        product.images.push({ url: u, source });
      }
    };

    // og:image 系列（多张）
    document.querySelectorAll('meta[property="og:image"], meta[property="og:image:url"]')
      .forEach((m) => m.content && pushImg(m.content, "meta:og:image"));

    // 面积排序兜底：收集全部 <img>，按 naturalWidth*naturalHeight 面积降序，取商品大图
    const bestFromSrcset = (img) => {
      const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
      let best = "", bestW = 0;
      ss.split(",").forEach((entry) => {
        const [u, d] = entry.trim().split(/\s+/);
        const w = parseFloat(d) || 0;
        if (u && w >= bestW) { bestW = w; best = u; }
      });
      return best;
    };
    const candidates = [];
    document.querySelectorAll("img").forEach((img) => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w > 0 && h > 0 && w < 200 && h < 200) return; // 剔除过小（图标/箭头）
      const url = bestFromSrcset(img) || img.currentSrc || img.src || img.getAttribute("data-src");
      const u = tryAbsUrl(url);
      if (!u) return;
      if (/sprite|icon|logo|placeholder|avatar|\.svg(\?|$)|social|flag|brand/i.test(u)) return;
      candidates.push({ url: u, area: w * h });
    });
    // 按面积降序，去重后取前 20
    candidates.sort((a, b) => b.area - a.area);
    for (const c of candidates) {
      if (product.images.length >= 20) break;
      if (!product.images.find((i) => i.url === c.url)) {
        product.images.push({ url: c.url, source: "dom:largest" });
      }
    }

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

    // 检测页面是否已被 Chrome 原生 Google 页面翻译改写（污染源）。
    // Google 翻译会在 <html> 上打 translated-ltr/translated-rtl 类，正文文本节点被换成译文。
    // 一旦命中，第 5/6 步的正文 DOM 采集就被跳过——那些文本已经是译文（脏数据），
    // 只剩 JSON-LD + meta + title 这类 Google 翻译不碰的原始结构化数据，才干净可靠。
    const htmlEl = document.documentElement;
    const isGoogleTranslated = /(^|\s)translated-(ltr|rtl)(\s|$)/i.test(htmlEl.className || "")
      || !!htmlEl.querySelector("font[style*='vertical-align']")
      || document.body?.querySelectorAll("font[style*='vertical-align']").length > 0;

    // 1) JSON-LD（商品结构化数据最干净，优先）
    //    只保留含 Product 的节点并限长，避免面包屑/评论等 JSON-LD 吃掉总字符预算
    const jsonld = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      const t = (s.textContent || "").trim();
      if (t && /"@type"\s*:\s*("|\[\s*")?\w*Product/i.test(t)) jsonld.push(t);
    });
    if (jsonld.length) {
      chunks.push("=== JSON-LD ===\n" + jsonld.join("\n---\n").slice(0, 5000));
    }

    // 2) 页面标题 + 全部商品相关 meta 标签（og:price / availability / brand 等往往只在这里）
    const metaLines = [];
    const title = document.querySelector("title")?.textContent || "";
    if (title) metaLines.push("title: " + clean(title));
    document.querySelectorAll("meta[property], meta[name], meta[itemprop]").forEach((m) => {
      const key = m.getAttribute("property") || m.getAttribute("name") || m.getAttribute("itemprop") || "";
      if (!/^(og:|product:|twitter:)|description|price|currency|availability|brand|color|title/i.test(key)) return;
      const v = clean(m.getAttribute("content"));
      if (v && v.length <= 300) metaLines.push(`${key}: ${v}`);
    });
    if (metaLines.length) chunks.push("=== META ===\n" + metaLines.slice(0, 40).join("\n"));

    // 3) 变体选择器（尺码/颜色/库存的真实来源——下拉框选项、radio 组、swatch 按钮，
    //    这些在纯文本遍历里抓不到或丢失 disabled/checked 状态）
    const variantLines = [];
    document.querySelectorAll("select").forEach((sel) => {
      const label = clean(sel.getAttribute("aria-label") || sel.name || sel.id || "select");
      const opts = Array.from(sel.options)
        .map((o) => {
          const t = clean(o.textContent);
          if (!t || (!o.value && /select|choose|选择/i.test(t))) return "";
          return t + (o.disabled ? " [OUT_OF_STOCK]" : "") + (o.selected && o.value ? " [SELECTED]" : "");
        })
        .filter(Boolean);
      if (opts.length >= 2 && opts.length <= 80) variantLines.push(`${label}: ${opts.join(" | ")}`);
    });
    const radioGroups = new Map();
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((i) => {
      const group = i.name || "options";
      const val = clean(i.value || i.getAttribute("aria-label") || i.closest("label")?.textContent);
      if (!val || val.length > 60) return;
      if (!radioGroups.has(group)) radioGroups.set(group, []);
      radioGroups.get(group).push(val + (i.disabled ? " [OUT_OF_STOCK]" : "") + (i.checked ? " [SELECTED]" : ""));
    });
    radioGroups.forEach((vals, group) => {
      if (vals.length >= 2 && vals.length <= 80) variantLines.push(`${group}: ${vals.join(" | ")}`);
    });
    const swatchTexts = [];
    document.querySelectorAll(
      '[class*="swatch" i] [aria-label], [class*="swatch" i] button, [class*="color" i] button, [class*="size" i] button, [class*="variant" i] button'
    ).forEach((b) => {
      const t = clean(b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent);
      if (t && t.length <= 60 && !swatchTexts.includes(t)) {
        swatchTexts.push(t + (b.disabled || b.getAttribute("aria-disabled") === "true" ? " [OUT_OF_STOCK]" : ""));
      }
    });
    if (swatchTexts.length >= 2) variantLines.push("buttons: " + swatchTexts.slice(0, 80).join(" | "));
    if (variantLines.length) {
      chunks.push("=== VARIANTS ===\n" + variantLines.join("\n").slice(0, 3000));
    }

    // 4) 表格 + 定义列表（尺码表、规格/成分表几乎都长这样）
    const tableLines = [];
    Array.from(document.querySelectorAll("table")).slice(0, 5).forEach((tb, i) => {
      const rows = Array.from(tb.querySelectorAll("tr")).slice(0, 30)
        .map((tr) => Array.from(tr.querySelectorAll("th,td")).map((c) => clean(c.textContent)).join(" | "))
        .filter((r) => r.replace(/\|/g, "").trim());
      if (rows.length) tableLines.push(`[table ${i + 1}]\n` + rows.join("\n"));
    });
    Array.from(document.querySelectorAll("dl")).slice(0, 5).forEach((dl) => {
      const dts = Array.from(dl.querySelectorAll("dt"));
      const dds = Array.from(dl.querySelectorAll("dd"));
      const pairs = dts.map((dt, i) => `${clean(dt.textContent)}: ${clean(dds[i]?.textContent)}`)
        .filter((p) => p.length > 3 && p.length <= 300);
      if (pairs.length) tableLines.push(pairs.join("\n"));
    });
    if (tableLines.length) {
      chunks.push("=== TABLES ===\n" + tableLines.join("\n\n").slice(0, 3500));
    }

    // 5) 正文容器里的候选段落（去掉 script/style/nav/header/footer）。
    //    注意：这里不做可见性过滤——折叠手风琴里的描述/洗护说明正是要抓的内容。
    //    若页面已被 Google 翻译改写，这些正文文本已变成译文（脏数据），跳过。
    if (!isGoogleTranslated) {
    const blocked = "script,style,noscript,svg,iframe,header,footer,nav,form";
    const containers = document.querySelectorAll(
      '[itemprop="description"], [class*="product-detail" i], [class*="product-info" i], ' +
      '[class*="product-description" i], [class*="description" i], [class*="details" i], ' +
      '[class*="specification" i], [class*="accordion" i], [class*="material" i], [class*="care" i], ' +
      '[data-testid*="description" i], [data-testid*="detail" i]'
    );
    // 分类导航/目录行判定：以「모두 보기 / 查看全部 / See all」结尾，或是一串纯品类名词。
    //   （BERGFREUNDE 导航形如 "등산화 트레킹화 … » 모두 보기"）
    const isCategoryLine = (t) => {
      return /(모두 보기|查看全部|查看全部|全部|see all|view all|alle ansehen|zur Übersicht)/i.test(t);
    };
    const seen = new Set();
    const sectionTexts = [];
    containers.forEach((c) => {
      if (sectionTexts.length >= 10) return;
      const clone = c.cloneNode(true);
      clone.querySelectorAll(blocked).forEach((n) => n.remove());
      // 按行拆分，剔除分类导航目录行（含「모두 보기」等），只保留真实商品描述行
      const rawText = clean(clone.textContent);
      const filteredLines = rawText
        .split(/[\n\r]+/)
        .map((line) => line.trim())
        .filter((line) => line.length >= 2 && !isCategoryLine(line));
      const text = filteredLines.join("\n").slice(0, 1800);
      if (text && text.length >= 12 && !seen.has(text)) {
        seen.add(text);
        sectionTexts.push(text);
      }
    });
    if (sectionTexts.length) {
      chunks.push("=== SECTIONS ===\n" + sectionTexts.join("\n---\n"));
    }
    } // end if(!isGoogleTranslated)

    // 6) 主路径：采集整个 body 的可见文本节点（结构化、按 DOM 顺序，不剔除商品信息区）。
    //    这是通用解——不依赖 JSON-LD、不依赖候选容器是否匹配某站 DOM。
    //    很多电商站（Zappos/HOKA）商品信息靠 JS 渲染、分散在右侧，不在这里就永远抓不到。
    //    若页面已被 Google 翻译改写，可见文本已是译文（脏数据），跳过。
    if (!isGoogleTranslated && document.body) {
      // 隐藏判定带缓存：同一父元素下的多个文本节点只算一次
      const visCache = new WeakMap();
      const isHidden = (el) => {
        if (el === document.body || el === document.documentElement) return false;
        if (visCache.has(el)) return visCache.get(el);
        let hidden = false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") {
          hidden = true;
        } else if (el.offsetParent === null && style.position !== "fixed" && style.position !== "sticky") {
          // offsetParent 为 null 且非 fixed：祖先链上存在 display:none
          hidden = true;
        }
        visCache.set(el, hidden);
        return hidden;
      };
      // 关键：按「块级父元素」整块 innerText 采集，而不是逐 text 节点拆碎。
      //   这样尺码列表（如 "Size: 10 11 11.5 12"）会作为一个完整上下文喂给 AI，
      //   而不是被拆成孤立的 "10" "11" 数字散落全文，导致 AI 无法关联到「尺码」语义。
      //   一个块容器内的相邻文本节点本来就是一体的（label + 选项值），必须保序保上下文。
      const BLOCK_TAGS = new Set([
        "DIV","P","LI","SPAN","TD","TH","DD","DT","LABEL",
        "H1","H2","H3","H4","H5","H6","SECTION","TR","BUTTON","OPTION","A"
      ]);
      const blocks = [];
      const seenBlock = new Set();
      // 排除噪声区：导航/页头/页尾/侧边栏（推荐位）+ 促销/关注/新闻订阅等营销区块
      //   否则 Zalando 这类站的分类导航词、BlackFriday 横幅、推荐商品会全灌进正文，
      //   被 AI 误当成「卖点/功能」。
      const NOISE_RE = /nav|header|footer|aside|sidebar|menu|breadcrumb|recommend|promotion|promo|sale|banner|newsletter|social|follow|subscribe|cart|checkout|modal|related|similar|recently|trending|deal|wishlist|favorite|gift|logo|_outlined|heart|meganav|megamenu|dropdown|category|categories|submenu|subnav|taxonomy|flyout|mega-menu/i;
      const isNoise = (el) => {
        const id = (el.id || "") + " " + (el.className || "");
        if (NOISE_RE.test(id)) return true;
        const role = (el.getAttribute && el.getAttribute("role")) || "";
        if (/navigation|banner|complementary|contentinfo|menu|menuitem|listbox/i.test(role)) return true;
        return false;
      };
      // 丢弃「分类导航/目录」特征行：以「查看全部/모두 보기/See all」结尾，或是一串纯品类名词。
      //   （BERGFREUNDE 导航形如 "등산화 트레킹화 … » 모두 보기"）
      const isCategoryLine = (t) => {
        if (/(모두 보기|查看全部|查看全部|全部|see all|view all|alle ansehen|zur Übersicht)/i.test(t)) return true;
        return false;
      };
      // 丢弃「推荐位商品价格卡」特征行：同时含货币价格 + 折扣/中位价/原价标记。
      //   （Zalando 推荐卡片形如 "Lasocki LASOCKI LOW SHOES … €51.99 中位价 €64.99 -20%"）
      const isPriceCard = (t) => {
        const hasPrice = /[€$£¥]\s?\d|\d+\s?[€$£¥]/.test(t);
        const hasDiscount = /中位价|原价|参考价|median|-\d+%|%\s*off|RP\s/i.test(t);
        return hasPrice && hasDiscount;
      };
      // 丢弃「买家评论」特征行：优点/缺点/使用场景/评分内容等用户评价，不是商品卖点。
      //   （BERGFREUNDE 评论形如 "장점 체온을 저장 … / 단점 제 팔이 너무 짧아요"）
      const isReviewLine = (t) => {
        return /(장점|단점|사용 용도|사용\s?용도|평점|리뷰|review|pros|cons|pros\/cons|vorteile|nachteile|verwendungszweck)/i.test(t);
      };
      // 丢弃「推荐位其他商品」特征行：品牌名 + 商品名 + 价格 + 折扣%（推荐卡片）。
      const isRecommendProduct = (t) => {
        const hasBrand = /브랜드|brand\s*:|^[A-Z][a-z]+\s/i.test(t);
        const hasPrice = /[€$£¥]\s?\d|\d+\s?[€$£¥]/.test(t);
        const hasDiscount = /할인|\d+%|-\d+%|%\s*off/i.test(t);
        return hasBrand && hasPrice && hasDiscount;
      };
      // 遍历所有「叶子块级」元素：本身有文本，但子元素里不再有 BLOCK_TAGS（即把最小文字单元归组）
      const allEls = document.querySelectorAll("body *");
      for (const el of allEls) {
        if (el.closest("script,style,noscript,svg,iframe,head")) continue;
        if (isHidden(el)) continue;
        if (el.getAttribute && el.getAttribute("aria-hidden") === "true") continue;
        if (isNoise(el)) continue;
        if (el.closest('nav,header,footer,aside,[role="navigation"],[role="banner"],[role="complementary"],[role="contentinfo"]')) continue;
        // 仅取「叶子块」：其直接文本节点可作为独立上下文，且不重复包含子块
        let directText = "";
        el.childNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) directText += n.nodeValue;
        });
        const t = clean(el.innerText);
        if (t && t.length >= 2 && t.length <= 300) {
          // 优先用整块 innerText（含 label+值），但若块太大则退化为直接文本
          const ctx = clean(directText).length >= 2 ? clean(directText) : t;
          if (ctx.length >= 2 && ctx.length <= 200 && !seenBlock.has(ctx)) {
            if (isPriceCard(ctx)) continue; // 跳过推荐商品价格卡
            if (isCategoryLine(ctx)) continue; // 跳过分类导航目录词
            if (isReviewLine(ctx)) continue; // 跳过买家评论
            if (isRecommendProduct(ctx)) continue; // 跳过推荐位其他商品
            seenBlock.add(ctx);
            blocks.push(ctx);
          }
        }
      }
      if (blocks.length) {
        chunks.push("=== PAGE_TEXT ===\n" + blocks.join("\n").slice(0, 12000));
      }
    }

    // 去重后的最终文本（限制总长度，关键字段尽量靠前；与服务端 MAX_PAGE_TEXT=24000 对齐）
    const joined = chunks.join("\n\n\n");
    return joined.slice(0, 24000);
  }

  window.__glassCommerceExtractor = extractProduct;
  window._glassCommerceExtractProduct = extractProduct;
  window.__glassCommerceCollectPageText = collectPageText;
  window.__gcExtractorVersion = GC_EXTRACTOR_VERSION;
})();
