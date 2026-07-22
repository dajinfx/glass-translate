import OpenAI from "openai";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

const BLOCK_START_RE = /\[\[GT_BLOCK:([^\]]+)\]\]\s*/g;
const BLOCK_END_TAG = "[[/GT_BLOCK]]";

const BLOCK_END_RE = /\s*\[\[\/GT_BLOCK\]\]\s*$/;

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

  return normalizeResult(parseTranslatedText(response.choices?.[0]?.message?.content || "", input), input);
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

  return normalizeResult(parseTranslatedText(response.output_text || "", input), input);
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
  return normalizeResult(parseTranslatedText(text, input), input);
}

function normalizeResult(parsedTranslations, input) {
  const translatedById = new Map(
    parsedTranslations
      .map((block) => [String(block?.id || ""), String(block?.translatedText || "").trim()])
      .filter(([id, translatedText]) => id && translatedText)
  );

  return {
    sourceLanguage: "unknown",
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
  return `
You are the translation engine for Glass Translate.

Translate only the text inside each block into ${targetLanguage}.
Keep each block marker exactly as written.
Preserve meaningful line breaks inside each translatedText.
Do not add usernames, counters, buttons, explanations, or UI labels that are not present in the input.
Return only the translated blocks. Do not return JSON. Do not return Markdown. Do not explain.

Input blocks:
${formatTextBlocks(blocks)}

Return this exact shape:
[[GT_BLOCK:text_1]]
translated text
[[/GT_BLOCK]]
`.trim();
}

function formatTextBlocks(blocks) {
  return blocks
    .map((block) => `[[GT_BLOCK:${block.id}]]\n${block.sourceText}\n[[/GT_BLOCK]]`)
    .join("\n\n");
}

function parseTranslatedText(text, input) {
  const parsed = parseMarkerBlocks(text);
  if (parsed.length) return parsed;

  if (input.blocks.length === 1 && String(text || "").trim()) {
    return [{ id: input.blocks[0].id, translatedText: stripCodeFences(text).trim() }];
  }

  try {
    const json = parseModelJson(text);
    const returnedBlocks = Array.isArray(json.blocks) ? json.blocks : [];
    return Array.isArray(json.translations) ? json.translations : returnedBlocks;
  } catch {
    throwHttp(502, "TEXT_PARSE_FAILED", "Model returned unparseable text translation");
  }
}

function parseMarkerBlocks(text) {
  const cleaned = stripCodeFences(text);
  const results = [];
  const matches = [...cleaned.matchAll(BLOCK_START_RE)];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const next = matches[i + 1];
    const id = String(match[1] || "").trim();
    const start = match.index + match[0].length;
    const end = next ? next.index : cleaned.length;
    const translatedText = cleaned.slice(start, end).replace(BLOCK_END_RE, "").trim();

    if (id && translatedText) {
      results.push({ id, translatedText });
    }
  }

  return results;
}

function stripCodeFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:text|json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function streamTranslateTextBlocks(input, onBlock) {
  switch (input.model) {
    case "gpt":
      return streamWithGpt(input, onBlock);
    case "deepseek":
    default:
      return streamWithDeepSeek(input, onBlock);
  }
}

async function streamWithDeepSeek(input, onBlock) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "DEEPSEEK_API_KEY is not configured");
  }

  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });

  const stream = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    messages: [
      {
        role: "user",
        content: buildTextPrompt(input)
      }
    ],
    temperature: 0.1,
    stream: true
  });

  await parseStreamBlocks(stream, onBlock, input);
}

async function streamWithGpt(input, onBlock) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const stream = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano",
    input: buildTextPrompt(input),
    temperature: 0.1,
    stream: true
  });

  await parseStreamBlocks(stream, onBlock, input);
}

async function parseStreamBlocks(stream, onBlock, input) {
  let buffer = "";
  const knownBlocks = new Map(); // id -> translatedText (partial)
  let currentId = null;

  for await (const chunk of stream) {
    // OpenAI chat completion streaming
    const delta = chunk?.choices?.[0]?.delta?.content ||
                  // OpenAI response API streaming
                  chunk?.type === "response.output_text.delta" ? chunk?.delta : "" ||
                  // Fallback
                  "";

    if (!delta) continue;

    buffer += delta;

    // Check for complete blocks in buffer
    checkBufferForBlocks(buffer, onBlock, knownBlocks, input);
  }

  // Final flush: send any remaining complete blocks
  checkBufferForBlocks(buffer, onBlock, knownBlocks, input);

  // Send all remaining incomplete blocks (force flush last content)
  for (const [id, text] of knownBlocks) {
    if (text.trim()) {
      onBlock({
        id,
        translatedText: text.trim()
      });
    }
  }
}

function checkBufferForBlocks(buffer, onBlock, knownBlocks, input) {
  // Find all GT_BLOCK markers and extract their content
  const markerRegex = /\[\[GT_BLOCK:([^\]]+)\]\]([\s\S]*?)(?=\[\[GT_BLOCK:|\[\[\/GT_BLOCK\]\]|$)/g;
  let match;

  while ((match = markerRegex.exec(buffer)) !== null) {
    const id = String(match[1]).trim();
    const partialText = String(match[2] || "").trim();

    if (!id) continue;

    const prevText = knownBlocks.get(id) || "";
    if (partialText.length > prevText.length) {
      knownBlocks.set(id, partialText);
    }
  }

  // Find completed blocks (contain closing tag)
  const completedRegex = /\[\[GT_BLOCK:([^\]]+)\]\]([\s\S]*?)\[\[\/GT_BLOCK\]\]/g;
  let completedMatch;

  while ((completedMatch = completedRegex.exec(buffer)) !== null) {
    const id = String(completedMatch[1]).trim();
    const text = String(completedMatch[2]).trim();

    if (id && text && !knownBlocks.has("completed_" + id)) {
      knownBlocks.set("completed_" + id, true);
      onBlock({
        id,
        translatedText: text
      });
    }
  }
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
