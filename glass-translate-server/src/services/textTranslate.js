import OpenAI from "openai";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

export async function translateTextBlocks(input) {
  switch (input.model) {
    case "gpt":
      return translateWithGpt(input);
    case "gemini":
      return translateWithGemini(input);
    case "deepseek":
    default:
      return translateWithDeepSeek(input);
  }
}

async function translateWithDeepSeek(input) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "DEEPSEEK_API_KEY is not configured");
  }

  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });

  const response = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    messages: [
      {
        role: "user",
        content: buildTextPrompt(input)
      }
    ],
    temperature: 0.1
  });

  return normalizeResult(parseModelJson(response.choices?.[0]?.message?.content || ""), input);
}

async function translateWithGpt(input) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano",
    input: buildTextPrompt(input),
    temperature: 0.1
  });

  return normalizeResult(parseModelJson(response.output_text || ""), input);
}

async function translateWithGemini(input) {
  if (!process.env.GEMINI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "GEMINI_API_KEY is not configured");
  }

  const model = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VISION_MODEL || "gemini-1.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildTextPrompt(input) }]
        }
      ],
      generationConfig: {
        temperature: 0.1
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throwHttp(response.status, "MODEL_REQUEST_FAILED", data?.error?.message || "Gemini request failed");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return normalizeResult(parseModelJson(text), input);
}

function normalizeResult(parsed, input) {
  const returnedBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const returnedTranslations = Array.isArray(parsed.translations) ? parsed.translations : returnedBlocks;
  const translatedById = new Map(
    returnedTranslations
      .map((block) => [String(block?.id || ""), String(block?.translatedText || "").trim()])
      .filter(([id, translatedText]) => id && translatedText)
  );

  return {
    sourceLanguage: parsed.sourceLanguage || "unknown",
    targetLanguage: input.targetLanguage,
    blocks: normalizeBlocks(
      input.blocks.map((block) => ({
        ...block,
        translatedText: translatedById.get(block.id) || ""
      })),
      input.viewport
    )
  };
}

function buildTextPrompt({ targetLanguage, blocks }) {
  const compactBlocks = blocks.map((block) => ({
    id: block.id,
    text: block.sourceText
  }));

  return `
You are the translation engine for Glass Translate.

Translate the text blocks into ${targetLanguage}.
Preserve each block id exactly.
Preserve meaningful line breaks inside each translatedText.
Do not add usernames, counters, buttons, explanations, or UI labels that are not present in the input.
Return strict JSON only. Do not return Markdown. Do not explain.

Input blocks:
${JSON.stringify(compactBlocks)}

Return this exact JSON shape:
{
  "sourceLanguage": "detected source language",
  "targetLanguage": "${targetLanguage}",
  "translations": [
    {
      "id": "block_1",
      "translatedText": "translated text"
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
