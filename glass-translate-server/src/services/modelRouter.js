import { translateWithDeepSeek } from "./deepseekVision.js";
import { translateWithGeminiVision } from "./geminiVision.js";
import { translateWithGptVision } from "./gptVision.js";

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
