import express from "express";
import OpenAI from "openai";
import { parseModelJson } from "../utils/json.js";

export const extractProductRouter = express.Router();

const ALLOWED_MODELS = new Set(["gpt", "gemini", "deepseek"]);
// 与扩展端 collectPageText 的 24000 上限对齐，避免服务端二次截断丢信息
const MAX_PAGE_TEXT = 24000;

/**
 * 用 AI 从清洗后的商品页文本中提取结构化商品信息。
 * 返回原文（不翻译），缺失字段以 null 标记，绝不编造。
 *
 * body: { text, model?, language? }
 *   text    —— 清洗后的页面文本（JSON-LD + title + meta + 正文段落）
 *   model   —— gpt | gemini | deepseek（默认 deepseek）
 *   language—— 仅用作提示，让 AI 知道来源语言语境（不改变输出语言）
 */
extractProductRouter.post("/", async (req, res) => {
  try {
    const input = validatePayload(req.body);
    const result = await extract(input);
    res.json({ success: true, result });
  } catch (error) {
    console.error("[extractProduct]", error);
    res.status(error.status || 500).json({
      success: false,
      errorCode: error.code || "SERVER_ERROR",
      message: error.message || "Product extraction failed"
    });
  }
});

function validatePayload(body) {
  if (!body || typeof body !== "object") {
    throwHttp(400, "INVALID_BODY", "Request body must be an object");
  }
  const text = String(body.text || "").trim();
  if (!text) {
    throwHttp(400, "INVALID_TEXT", "text field is required (cleaned page text)");
  }
  return {
    text: text.slice(0, MAX_PAGE_TEXT),
    model: normalizeModel(body.model),
    language: String(body.language || "English").trim()
  };
}

function normalizeModel(value) {
  // 商品信息清洗整理固定走 OpenAI（与后台翻译一致），其余模型仅作显式指定时的备选
  const model = String(value || process.env.DEFAULT_EXTRACT_MODEL || "gpt").trim();
  if (!ALLOWED_MODELS.has(model)) {
    throwHttp(400, "INVALID_MODEL", "Unsupported model");
  }
  return model;
}

// 这些字段缺 ≥2 个时触发第二遍定向补漏
const CRITICAL_FIELDS = ["name", "price", "description", "material", "colors", "sizes"];

async function extract(input) {
  const first = await callModel(input.model, buildPrompt(input));
  const missing = missingCritical(first);
  if (missing.length < 2) return first;

  // 二遍补漏：带着首轮结果和缺失清单定向重扫；失败不影响首轮结果
  try {
    const second = await callModel(input.model, buildRepairPrompt(input, first, missing));
    return mergeResults(first, second);
  } catch (error) {
    console.warn("[extractProduct] repair pass failed:", error.message);
    return first;
  }
}

function callModel(model, prompt) {
  switch (model) {
    case "gpt":
      return extractWithOpenAI(prompt);
    case "gemini":
      return extractWithGemini(prompt);
    case "deepseek":
    default:
      return extractWithDeepSeek(prompt);
  }
}

function missingCritical(result) {
  return CRITICAL_FIELDS.filter((k) => {
    const v = result[k];
    return v == null || (Array.isArray(v) && v.length === 0);
  });
}

// 标量取先到的非空值，数组取并集（大小写不敏感去重）
function mergeResults(first, second) {
  const merged = { ...first };
  for (const [k, v] of Object.entries(second)) {
    if (Array.isArray(v)) {
      const seen = new Set();
      const out = [];
      [...(first[k] || []), ...v].forEach((item) => {
        const key = String(item).trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          out.push(String(item).trim());
        }
      });
      merged[k] = out;
    } else if (merged[k] == null && v != null) {
      merged[k] = v;
    }
  }
  return merged;
}

function buildRepairPrompt(input, current, missing) {
  return `${buildPrompt(input)}

PREVIOUS ATTEMPT (incomplete):
${JSON.stringify(current)}

The fields [${missing.join(", ")}] were NOT found in the previous attempt.
Re-scan the ENTIRE page text above specifically for these fields — they are often inside
the VARIANTS section (selects/radios/buttons), the TABLES section, or near the end of
PAGE_TEXT. Output the complete corrected JSON (all fields, exact same schema).
If a field truly does not exist anywhere in the text, keep it null / [].`;
}

async function extractWithDeepSeek(prompt) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "DEEPSEEK_API_KEY is not configured");
  }
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });
  const response = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    // 强制 JSON 模式：杜绝 markdown 围栏/闲聊导致的解析失败（提取返回空的主因之一）
    response_format: { type: "json_object" }
  });
  return parseResult(response.choices?.[0]?.message?.content || "");
}

// OpenAI 结构化输出 schema：API 层面保证返回合法 JSON 且字段齐全
const EXTRACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name", "brand", "sku", "colors", "selectedColor", "sizes",
    "sizesOutOfStock", "price", "currency", "availability", "material",
    "fit", "careInstructions", "description", "features", "sizeTable",
    "rating", "reviewCount"
  ],
  properties: {
    name: { type: ["string", "null"] },
    brand: { type: ["string", "null"] },
    sku: { type: ["string", "null"] },
    colors: { type: "array", items: { type: "string" } },
    selectedColor: { type: ["string", "null"] },
    sizes: { type: "array", items: { type: "string" } },
    sizesOutOfStock: { type: "array", items: { type: "string" } },
    price: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    availability: { type: ["string", "null"] },
    material: { type: ["string", "null"] },
    fit: { type: ["string", "null"] },
    careInstructions: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    features: { type: "array", items: { type: "string" } },
    sizeTable: { type: ["string", "null"] },
    rating: { type: ["number", "null"] },
    reviewCount: { type: ["number", "null"] }
  }
};

async function extractWithOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const base = {
    model: process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano",
    input: prompt,
    temperature: 0.1
  };
  try {
    // 首选 json_schema 严格模式：模型被强制按 schema 输出，字段不会少、JSON 不会坏
    const response = await client.responses.create({
      ...base,
      text: {
        format: {
          type: "json_schema",
          name: "product_extraction",
          schema: EXTRACT_JSON_SCHEMA,
          strict: true
        }
      }
    });
    return parseResult(response.output_text || "");
  } catch (error) {
    // 模型/账号不支持结构化输出时退回普通调用（parseModelJson 兜底解析）
    console.warn("[extractProduct] json_schema mode failed, falling back:", error.message);
    const response = await client.responses.create(base);
    return parseResult(response.output_text || "");
  }
}

async function extractWithGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "GEMINI_API_KEY is not configured");
  }
  const model = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VISION_MODEL || "gemini-1.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throwHttp(response.status, "MODEL_REQUEST_FAILED", data?.error?.message || "Gemini request failed");
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return parseResult(text);
}

/**
 * 让 AI 从页面文本中提取结构化字段。强调：
 *  - 只输出事实，缺失用 null，绝不编造
 *  - 返回原文（不翻译）
 *  - 颜色/尺码要全列表，尺码标注缺货
 */
function buildPrompt({ text, language }) {
  return `
You are a structured-data extraction engine for a cross-border e-commerce tool.

Below is a raw dump of a product detail page (source language context: ${language || "unknown"}).
The dump is organized into labeled sections, in order:
  === JSON-LD ===   structured product data (most reliable for name/brand/sku/price/currency)
  === META ===      page title and og:/product: meta tags (often carries price/availability/brand)
  === VARIANTS ===  option selectors: selects, radio groups, swatch buttons. THIS is the live
                    source of truth for colors, sizes, and stock. "[OUT_OF_STOCK]" marks a
                    sold-out option; "[SELECTED]" marks the currently selected one.
  === TABLES ===    serialized tables and definition lists (size charts, spec/material tables)
  === SECTIONS ===  candidate description blocks (may include collapsed accordion content)
  === PAGE_TEXT === the full visible page text, in DOM order
Extract the product's factual information INTO structured JSON.

EXTRACTION STRATEGY (important — follow in order):
1. Read the ENTIRE text before answering. Relevant facts (sizes, materials, care, colors)
   are often scattered and may appear near the END of PAGE_TEXT. Do not stop early.
2. Cross-check sections: JSON-LD/META for identity and price; VARIANTS for colors/sizes/stock;
   TABLES for the size chart and material composition; SECTIONS + PAGE_TEXT for description,
   features, fit, and care instructions.
3. Be EXHAUSTIVE for list fields: "colors" must include EVERY color option mentioned
   anywhere; "sizes" must include EVERY size option (options marked [OUT_OF_STOCK] go into
   "sizesOutOfStock" too).
3b. "features" is ONLY the selling points / feature highlights of THE SINGLE PRODUCT being
    sold on this page. A valid feature is a SHORT phrase describing one of THIS product's own
    product attributes — its material, function, craftsmanship, origin, warmth/breathability,
    fit, or similar intrinsic benefit (e.g. "hand-painted ceramic base", "mulesing-free merino
    wool", "breathable and quick-drying").
    STRICTLY EXCLUDE — these are NEVER features, no matter how they are worded:
      - Site navigation / category lists / taxonomy ("Shoes", "Backpacks", "남성/여성/아동",
        anything ending in "» 모두 보기 / View all / See all", breadcrumbs, folder labels).
      - Names/brands/prices of OTHER products (recommendations, "you may also like",
        bestsellers, discount cards).
      - Customer REVIEWS / ratings / user opinions ("장점/단점" pros/cons, "사용 용도",
        "너무 짧아요").
      - Customer-service / contact / support / FAQ / footer link text ("쇼핑하러 가기", "문의하기",
        "자주 묻는 질문", phone numbers like "+49 …", "주문 상태", newsletter/social links).
      - Raw spec table rows (dimensions, weight, country of origin, wattage, energy rating),
        shipping/delivery info, warranty, packaging.
    Output at most ~8 features. If fewer than 2 REAL product selling points can be found among
    all this noise, output "features": [] (empty) — it is FAR better to return empty than to
    fill features with navigation/contact/category text. If in doubt between a "spec" and a
    "selling point", put the spec into "description" or "sizeTable", NOT "features".
4. "sizeTable" is the size chart as plain text, one row per line with " | " between cells,
   taken from TABLES if a size chart exists; otherwise null.
5. "name" is nearly always present in META or JSON-LD — only output null for it
   if the text clearly is not a product page at all.

STRICT RULES:
- Output ONLY facts that appear in the provided text. NEVER invent, guess, or embellish.
- For any field NOT found in the text, output null (or [] for array fields). Do not write "unknown" or "N/A".
- Return all human-readable values TRANSLATED into the requested language (${language}).
  Output name/brand/color/colors/material/fit/careInstructions/description/features/sizeTable/availability/sizes
  in ${language}. Do NOT keep the original source language. Translate their MEANING faithfully.
- "sizesOutOfStock" lists any size that is sold out / crossed out / unavailable.
- "price" is a plain number WITHOUT currency symbol (e.g. 167.95). Put the ISO currency code in "currency"
  (infer from symbol: $→USD, €→EUR, £→GBP, ₩→KRW, ¥→JPY unless stated otherwise).
- "description" is the full product description paragraph(s), concatenated if split across sections.
- Output ONLY valid JSON matching the schema below, no markdown fences, no commentary.

Page text:
${text}

Output JSON schema exactly:
{
  "name": string | null,
  "brand": string | null,
  "sku": string | null,
  "colors": string[],
  "selectedColor": string | null,
  "sizes": string[],
  "sizesOutOfStock": string[],
  "price": number | null,
  "currency": string | null,
  "availability": string | null,
  "material": string | null,
  "fit": string | null,
  "careInstructions": string | null,
  "description": string | null,
  "features": string[],
  "sizeTable": string | null,
  "rating": number | null,
  "reviewCount": number | null
}
`.trim();
}

function parseResult(text) {
  let json;
  try {
    json = parseModelJson(text);
  } catch {
    throwHttp(502, "PARSE_FAILED", "Model returned unparseable extraction JSON");
  }

  const str = (v) => (v == null || v === "") ? null : String(v).trim();
  const strArray = (v) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
  const num = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    name: str(json.name),
    brand: str(json.brand),
    sku: str(json.sku),
    colors: strArray(json.colors),
    selectedColor: str(json.selectedColor),
    sizes: strArray(json.sizes),
    sizesOutOfStock: strArray(json.sizesOutOfStock),
    price: num(json.price),
    currency: str(json.currency),
    availability: str(json.availability),
    material: str(json.material),
    fit: str(json.fit),
    careInstructions: str(json.careInstructions),
    description: str(json.description),
    features: sanitizeFeatures(json.features),
    sizeTable: str(json.sizeTable),
    rating: num(json.rating),
    reviewCount: num(json.reviewCount)
  };
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

/**
 * 代码级硬过滤 features：AI 即使把导航/客服/分类/推荐词误判成卖点，也在最后一道关卡被确定性删除。
 * 不依赖 prompt 软约束，用关键词 + 正则确定性匹配。
 */
function sanitizeFeatures(features) {
  if (!Array.isArray(features)) return [];

  // 特征：导航/分类目录行结尾（모두 보기 / View all / See all 等）
  const NAV_TAIL = /(모두 보기|查看全部|查看全部|全部|see\s*all|view\s*all|alle\s*ansehen|zur\s*Übersicht|anzeigen)\s*$/i;

  // 客服/联系/FAQ/页脚链接特征（쇼핑하러 가기 / 문의하기 / 자주 묻는 질문 / 전화 / 주문 상태 …）
  const CONTACT = /(쇼핑하러 가기|문의하기|문의 양식|자주 묻는 질문|도움말|주문 상태|전화하세요|문의\s*양식|고객\s*서비스|블로그로 가기|기본 창고로 가기|kontakt|hilfe|faq|fragen|bestellstatus|newsletter|anmelden|service)/i;

  // 纯品类词/分类名词堆砌（재킷/언더웨어/바지/셔츠/수영복 + » 等），以及带导航箭头的行
  const CATEGORY = /(재킷|언더웨어|바지|셔츠|수영복|조끼|후디|드레스|스커트|오버롤|장갑|모자|안경|양말|액세서리|신발|헬멧|백팩|가방|클라이밍|슬랙라인|캠핑|트레킹|등산)/i;
  const ARROW = /»|≫|>|»|›/;
  const PHONE = /\+\d{1,3}[\s\-]?\d{2,4}/;
  const URLISH = /(https?:\/\/|www\.|\.de\b|\.com\b)/i;

  return features
    .map((f) => String(f || "").trim())
    .filter(Boolean)
    .filter((f) => {
      if (f.length > 140) return false; // 过长基本是正文段落，不是卖点短语
      if (NAV_TAIL.test(f)) return false; // 目录行结尾
      if (CONTACT.test(f)) return false; // 客服/联系/FAQ
      if (PHONE.test(f)) return false; // 含电话号码
      if (URLISH.test(f)) return false; // 含 URL/域名
      if (ARROW.test(f)) return false; // 含导航箭头
      if (CATEGORY.test(f)) return false; // 纯品类词
      return true;
    });
}
