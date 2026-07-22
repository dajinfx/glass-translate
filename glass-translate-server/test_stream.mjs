// Test DeepSeek GT_BLOCK streaming
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
});

const inputText = [
  '[[GT_BLOCK:text_1]]',
  '안녕하세요, 오늘 날씨가 좋네요.',
  '[[/GT_BLOCK]]',
  '',
  '[[GT_BLOCK:text_2]]',
  '이건 정말 재미있는 영화네요.',
  '[[/GT_BLOCK]]',
  '',
  '[[GT_BLOCK:text_3]]',
  '내일 뭐 할 거예요?',
  '[[/GT_BLOCK]]'
].join('\n');

const prompt = [
  "Translate each block below into Chinese.",
  "Output the same number of blocks as input, each with its original [[GT_BLOCK:id]] marker.",
  "Return ONLY the translated blocks with markers. No explanations.",
  "",
  "Input blocks:",
  inputText,
  "",
  "Output:"
].join('\n');

console.log("=== SENDING ===");
const stream = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: prompt }],
  temperature: 0.1,
  stream: true
});

let full = "";
let blockCount = 0;
for await (const chunk of stream) {
  const delta = chunk.choices?.[0]?.delta?.content || "";
  if (delta) {
    full += delta;
    // Count GT_BLOCK starts in cumulative output
    const starts = (full.match(/\[\[GT_BLOCK:/g) || []).length;
    if (starts > blockCount) {
      blockCount = starts;
      process.stdout.write(`\n[BLOCK ${blockCount} STARTING]\n`);
    }
    process.stdout.write(delta);
  }
}
console.log("\n\n=== FULL OUTPUT ===");
console.log(JSON.stringify(full));
console.log("=== END ===");
