import OpenAI from "openai";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

export async function translateWithDeepSeek(input) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "DEEPSEEK_API_KEY is not configured");
  }

  if (!process.env.OPENAI_API_KEY) {
    throwHttp(
      500,
      "OCR_MODEL_NOT_CONFIGURED",
      "OPENAI_API_KEY is required for image OCR before DeepSeek text translation"
    );
  }

  const layout = await extractLayoutWithVision(input);
  if (!layout.blocks.length) {
    return {
      sourceLanguage: layout.sourceLanguage || "unknown",
      targetLanguage: input.targetLanguage,
      blocks: []
    };
  }

  const translated = await translateLayoutWithDeepSeek({
    ...input,
    sourceLanguage: layout.sourceLanguage,
    blocks: layout.blocks
  });

  return {
    sourceLanguage: layout.sourceLanguage || translated.sourceLanguage || "unknown",
    targetLanguage: input.targetLanguage,
    blocks: normalizeBlocks(translated.blocks, input.viewport)
  };
}

async function extractLayoutWithVision(input) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const response = await openai.responses.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildOcrLayoutPrompt(input)
          },
          {
            type: "input_image",
            image_url: input.image
          }
        ]
      }
    ],
    temperature: 0.1
  });

  const parsed = parseModelJson(response.output_text || "");
  const blocks = normalizeBlocks(
    (parsed.blocks || []).map((block) => ({
      ...block,
      translatedText: block.sourceText || block.translatedText || ""
    })),
    input.viewport
  );

  return {
    sourceLanguage: parsed.sourceLanguage || "unknown",
    blocks
  };
}

async function translateLayoutWithDeepSeek(input) {
  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });

  const response = await deepseek.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    messages: [
      {
        role: "user",
        content: buildDeepSeekTranslatePrompt(input)
      }
    ],
    temperature: 0.1
  });

  return parseModelJson(response.choices?.[0]?.message?.content || "");
}

function buildOcrLayoutPrompt({ viewport }) {
  const sizeText = viewport
    ? `width=${Math.round(viewport.width)}, height=${Math.round(viewport.height)}`
    : "unknown";

  return `
You are an OCR and layout extraction engine.

Read every visible text segment in the screenshot. Do not translate.
Return strict JSON only. Do not return Markdown. Do not explain.

Screenshot size:
${sizeText}

Return this exact JSON shape:
{
  "sourceLanguage": "detected source language",
  "blocks": [
    {
      "id": "block_1",
      "sourceText": "recognized text",
      "translatedText": "recognized text",
      "x": 0,
      "y": 0,
      "width": 100,
      "height": 30,
      "fontSize": 16,
      "lineHeight": 20,
      "align": "left"
    }
  ]
}

Rules:
- Coordinates are pixels relative to the top-left corner of the screenshot.
- Preserve paragraph grouping, line breaks, table-like placement, and approximate font size.
- Use align as one of: left, center, right, justify.
- If no readable text exists, return "blocks": [].
`.trim();
}

function buildDeepSeekTranslatePrompt({ sourceLanguage, targetLanguage, blocks }) {
  const compactBlocks = blocks.map((block) => ({
    id: block.id,
    sourceText: block.sourceText,
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    fontSize: block.fontSize,
    lineHeight: block.lineHeight,
    align: block.align
  }));

  return `
You are the primary translation model for Glass Translate.

Translate the OCR text blocks into ${targetLanguage}.
Preserve each block id and layout values exactly.
Return strict JSON only. Do not return Markdown. Do not explain.

Source language:
${sourceLanguage || "unknown"}

Input blocks:
${JSON.stringify(compactBlocks)}

Return this exact JSON shape:
{
  "sourceLanguage": "${sourceLanguage || "unknown"}",
  "targetLanguage": "${targetLanguage}",
  "blocks": [
    {
      "id": "block_1",
      "sourceText": "original text",
      "translatedText": "translated text",
      "x": 0,
      "y": 0,
      "width": 100,
      "height": 30,
      "fontSize": 16,
      "lineHeight": 20,
      "align": "left"
    }
  ]
}
`.trim();
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
