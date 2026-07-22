import { translateWithDeepSeek } from "./deepseekVision.js";
import { translateWithGeminiVision } from "./geminiVision.js";
import { translateWithGptVision } from "./gptVision.js";
import { translateTextBlocks, streamTranslateTextBlocks } from "./textTranslate.js";
import { streamGptVision } from "./gptVision.js";

export async function translateWithModel(input) {
  switch (input.model) {
    case "gpt":
      return translateWithGptVision(input);
    case "gemini":
      return translateWithGeminiVision(input);
    case "deepseek":
      return translateWithDeepSeek(input);
    default:
      return translateWithGptVision(input);
  }
}

export async function translateTextWithModel(input) {
  return translateTextBlocks(input);
}

export async function streamTranslateImage(input, onBlock) {
  return streamGptVision(input, onBlock);
}

export { streamTranslateTextBlocks };
