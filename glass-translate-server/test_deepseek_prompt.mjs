import OpenAI from "openai";

function formatTextBlocks(blocks) {
  return blocks
    .map((block) => `[[GT_BLOCK:${block.id}]]\n${block.sourceText}\n[[/GT_BLOCK]]`)
    .join("\n\n");
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

const payload = {
  blocks: [
    { id: "text_1", sourceText: "안녕하세요, 오늘 날씨가 좋네요." },
    { id: "text_2", sourceText: "이건 정말 재미있는 영화네요." },
    { id: "text_3", sourceText: "내일 뭐 할 거예요?" }
  ],
  targetLanguage: "Chinese"
};

// Print the actual prompt DeepSeek sees
const prompt = buildTextPrompt(payload);
console.log("=== PROMPT ===");
console.log(prompt);
console.log("\n=== END PROMPT ===");

// Send it
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
});

const response = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: prompt }],
  temperature: 0.1
});

console.log("\n=== RESPONSE ===");
console.log(response.choices[0].message.content);
console.log("\n=== END ===");
