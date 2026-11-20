import express from "express";
import OpenAI from "openai";
import { parseModelJson } from "../utils/json.js";

export const generateDetailRouter = express.Router();

const ALLOWED_MODELS = new Set(["gpt", "gemini", "deepseek"]);

/**
 * 生成商品详情页文案（标题 + 3 卖点 + 规格短文案）。
 * 只依据传入的结构化字段生成，缺失字段一律标记，绝不编造事实。
 */
generateDetailRouter.post("/", async (req, res) => {
  try {
    const input = validatePayload(req.body);

    if (req.body.dryRun) {
      // 不调模型，仅返回字段完整性审计（用于前端预览/草稿判定）
      res.json({
        success: true,
        dryRun: true,
        audit: auditFields(input.product)
      });
      return;
    }

    const result = await generate(input);
    res.json({ success: true, result });
  } catch (error) {
    console.error("[generateDetail]", error);
    res.status(error.status || 500).json({
      success: false,
      errorCode: error.code || "SERVER_ERROR",
      message: error.message || "Detail generation failed"
    });
  }
});

function validatePayload(body) {
  if (!body || typeof body !== "object") {
    throwHttp(400, "INVALID_BODY", "Request body must be an object");
  }
  if (!body.product || typeof body.product !== "object") {
    throwHttp(400, "INVALID_PRODUCT", "product field is required");
  }

  const model = normalizeModel(body.model);
  const language = normalizeLanguage(body.language || body.targetLanguage);

  return {
    model,
    language,
    product: body.product
  };
}

function normalizeModel(value) {
  const model = String(value || process.env.DEFAULT_MODEL || "deepseek").trim();
  if (!ALLOWED_MODELS.has(model)) {
    throwHttp(400, "INVALID_MODEL", "Unsupported model");
  }
  return model;
}

function normalizeLanguage(value) {
  // 跟随扩展工具栏语言，映射到生成文案的目标语言名字
  const map = {
    en: "English",
    English: "English",
    zh: "Chinese",
    中文: "Chinese",
    ja: "Japanese",
    日本語: "Japanese",
    ko: "Korean",
    한국어: "Korean",
    fr: "French",
    Français: "French",
    de: "German",
    Deutsch: "German",
    es: "Spanish",
    Español: "Spanish",
    ru: "Russian",
    Русский: "Russian",
    ar: "Arabic",
    العربية: "Arabic",
    hi: "Hindi",
    हिन्दी: "Hindi"
  };
  const raw = String(value || "English").trim();
  return map[raw] || "English";
}

async function generate(input) {
  switch (input.model) {
    case "gpt":
      return generateWithOpenAI(input, true);
    case "gemini":
      return generateWithGemini(input);
    case "deepseek":
    default:
      return generateWithDeepSeek(input);
  }
}

async function generateWithDeepSeek(input) {
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
    temperature: 0.2
  });
  return parseResult(response.choices?.[0]?.message?.content || "");
}

async function generateWithOpenAI(input, _useResponses) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano",
    input: buildPrompt(input),
    temperature: 0.2
  });
  return parseResult(response.output_text || "");
}

async function generateWithGemini(input) {
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
      generationConfig: { temperature: 0.2 }
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throwHttp(response.status, "MODEL_REQUEST_FAILED", data?.error?.message || "Gemini request failed");
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return parseResult(text);
}

function buildPrompt({ language, product }) {
  return `
You are the product detail page copywriter for a cross-border e-commerce shop.

Write a ${language} product detail page for this product. You MUST generate ONLY:
1. "title" — one product name line
2. "sellingPoints" — exactly 3 short selling points (one image = one sentence style)
3. "specSummary" — a short spec/description paragraph

STRICT RULES:
- Facts MUST come only from the provided fields. Do NOT invent, guess, or embellish.
- For any fact not present in the fields, do NOT make it up. Instead mark it with the exact literal marker "(확인 필요)" if the target is Korean, otherwise "(TBD)".
- Do not add marketing superlatives that are not supported by the fields.
- Output ONLY valid JSON, no markdown fences, no commentary.

Product fields:
${JSON.stringify(product, null, 2)}

Output JSON schema exactly:
{
  "title": "...",
  "sellingPoints": ["...", "...", "..."],
  "specSummary": "..."
}
`.trim();
}

function parseResult(text) {
  try {
    const json = parseModelJson(text);
    const title = String(json?.title || "").trim();
    const sellingPoints = Array.isArray(json?.sellingPoints)
      ? json.sellingPoints.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 3)
      : [];
    const specSummary = String(json?.specSummary || "").trim();
    return { title, sellingPoints, specSummary };
  } catch {
    throwHttp(502, "PARSE_FAILED", "Model returned unparseable detail copy");
  }
}

function auditFields(product) {
  const required = [
    "name", "color", "fit", "material", "careInstructions",
    "features", "sizeTable", "brandSku"
  ];
  return {
    missing: required.filter((k) => !product[k]),
    present: required.filter((k) => !!product[k])
  };
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
