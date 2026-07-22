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

Translate each text block below into ${targetLanguage}.

For each input block, output its translated version between the SAME markers.
You MUST output the same number of blocks as the input. One block for each input.
Keep each block's text together. Preserve meaningful line breaks inside the text.
Do not add usernames, counters, buttons, explanations, or UI labels.
Return ONLY the translated blocks with markers. No extra text. No JSON. No Markdown.

Input blocks:
${formatTextBlocks(blocks)}

Output format (one block per input, keep markers):
[[GT_BLOCK:text_1]]
translated text for block 1
[[/GT_BLOCK]]
[[GT_BLOCK:text_2]]
translated text for block 2
[[/GT_BLOCK]]`.trim();
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
  const sentBlockIds = new Set();
  // Build id map from input blocks so we can fix DeepSeek's block ids
  const inputBlocks = (input.blocks || []);
  const inputIdMap = new Map();
  inputBlocks.forEach((b, i) => {
    // Store both the original id and positional index
    inputIdMap.set(b.id, b.id);
    inputIdMap.set(`text_${i + 1}`, b.id);
    inputIdMap.set(`block_${i + 1}`, b.id);
    inputIdMap.set(`ext_${i + 1}`, b.id);
  });

  for await (const chunk of stream) {
    let delta = "";

    // DeepSeek / OpenAI chat completions
    if (chunk?.choices?.[0]?.delta?.content) {
      delta = chunk.choices[0].delta.content;
    } else if (chunk?.type === "response.output_text.delta" && chunk.delta) {
      // OpenAI responses API
      delta = chunk.delta;
    }

    if (!delta) continue;

    buffer += delta;

    // Scan buffer for completed GT_BLOCKs
    scanCompletedBlocks(buffer, onBlock, sentBlockIds, inputIdMap);
  }
}

function scanCompletedBlocks(buffer, onBlock, sentBlockIds, inputIdMap) {
  let pos = 0;
  while (pos < buffer.length) {
    const startIdx = buffer.indexOf("[[GT_BLOCK:", pos);
    if (startIdx === -1) break;

    const idStart = startIdx + 12;
    const idEnd = buffer.indexOf("]]", idStart);
    if (idEnd === -1) break;

    const rawId = buffer.slice(idStart, idEnd).trim();
    if (!rawId) { pos = idEnd + 2; continue; }

    const contentStart = idEnd + 2;
    const endTag = "[[/GT_BLOCK]]";
    const tagIdx = buffer.indexOf(endTag, contentStart);
    if (tagIdx === -1) break;

    const text = buffer.slice(contentStart, tagIdx).trim();

    // Map DeepSeek's id back to the original input block id
    const id = inputIdMap.get(rawId) || rawId;

    if (text && !sentBlockIds.has(id)) {
      sentBlockIds.add(id);
      onBlock({ id, translatedText: text });
    }

    pos = tagIdx + endTag.length;
  }
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
