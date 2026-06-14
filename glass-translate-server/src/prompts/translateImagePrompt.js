export function buildTranslateImagePrompt({ targetLanguage, viewport }) {
  const sizeText = viewport
    ? `width=${Math.round(viewport.width)}, height=${Math.round(viewport.height)}`
    : "unknown";

  return `
You are a screenshot OCR, translation, and layout reconstruction assistant.

Task:
1. Read every visible text segment in the screenshot.
2. Translate the recognized text into ${targetLanguage}.
3. Preserve the original layout as much as possible, including position, line breaks, paragraph grouping, table-like placement, and approximate font size.
4. Return strict JSON only. Do not return Markdown. Do not explain.

Screenshot size:
${sizeText}

Return this exact JSON shape:
{
  "sourceLanguage": "detected source language",
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

Rules:
- Coordinates are pixels relative to the top-left corner of the screenshot.
- If exact font size is unclear, estimate it visually.
- Keep meaningful line breaks in translatedText.
- Use align as one of: left, center, right, justify.
- If no readable text exists, return "blocks": [].
`.trim();
}
