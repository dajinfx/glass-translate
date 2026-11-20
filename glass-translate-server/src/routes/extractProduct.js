import express from "express";
import OpenAI from "openai";
import { parseModelJson } from "../utils/json.js";

export const extractProductRouter = express.Router();

const ALLOWED_MODELS = new Set(["gpt", "gemini", "deepseek"]);
const MAX_PAGE_TEXT = 9000; // 截断，防超 token

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
  const model = String(value || process.env.DEFAULT_MODEL || "deepseek").trim();
  if (!ALLOWED_MODELS.has(model)) {
    throwHttp(400, "INVALID_MODEL", "Unsupported model");
  }
  return model;
}

async function extract(input) {
  switch (input.model) {
    case "gpt":
      return extractWithOpenAI(input);
    case "gemini":
      return extractWithGemini(input);
    case "deepseek":
    default:
      return extractWithDeepSeek(input);
  }
}

async function extractWithDeepSeek(input) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "DEEPSEEK_API_KEY is not configured");
  }
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });
  const response = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    messages: [{ role: "user", content: buildPrompt(input) }],
    temperature: 0.1
  });
  return parseResult(response.choices?.[0]?.message?.content || "");
}

async function extractWithOpenAI(input) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano",
    input: buildPrompt(input),
    temperature: 0.1
  });
  return parseResult(response.output_text || "");
}

async function extractWithGemini(input) {
  if (!process.env.GEMINI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "GEMINI_API_KEY is not configured");
  }
  const model = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VISION_MODEL || "gemini-1.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
      generationConfig: { temperature: 0.1 }
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

Below is the cleaned text of a product detail page (source language context: ${language || "unknown"}).
Extract the product's factual information INTO structured JSON.

STRICT RULES:
- Output ONLY facts that appear in the provided text. NEVER invent, guess, or embellish.
- For any field NOT found in the text, output null. Do not write "unknown" or "N/A".
- Return all values in the ORIGINAL language as they appear in the text. Do NOT translate.
- "colors" must list ALL colors mentioned (array). "sizes" must list ALL sizes (array), and
  "sizesOutOfStock" lists any size that is sold out / crossed out / unavailable.
- "price" is a plain number WITHOUT currency symbol (e.g. 167.95). Put currency code in "currency".
- "description" is the full product description paragraph(s).
- Output ONLY valid JSON, no markdown fences, no commentary.

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
    features: strArray(json.features),
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
