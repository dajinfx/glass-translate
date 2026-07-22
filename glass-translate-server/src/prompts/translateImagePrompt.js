export function buildTranslateImagePrompt({ targetLanguage, viewport }) {
  const sizeText = viewport
    ? `width=${Math.round(viewport.width)}, height=${Math.round(viewport.height)}`
    : "unknown";

  return `
You are a screenshot OCR, translation, and layout reconstruction assistant.

Task:
1. Read every visible text segment in the screenshot.
2. Translate the recognized text into ${targetLanguage}.
3. Preserve layout values (x, y, width, height, fontSize, lineHeight, align) for each block.
4. Output each block on its own line using the marker format below.
5. Do not return JSON. Do not return Markdown. Do not explain.

Screenshot size:
${sizeText}

Output each block using this exact format (one block per line):
[[GT_BLOCK:block_id]]x:0,y:0,w:100,h:30,fs:16,lh:20,align:left|translated text[[/GT_BLOCK]]

Example:
[[GT_BLOCK:block_1]]x:12,y:8,w:200,h:24,fs:16,lh:22,align:left|Hello, world[[/GT_BLOCK]]
[[GT_BLOCK:block_2]]x:12,y:40,w:180,h:20,fs:14,lh:20,align:left|This is a translated sentence[[/GT_BLOCK]]

Rules:
- Coordinates are pixels relative to the top-left corner of the screenshot.
- If exact font size is unclear, estimate it visually.
- Keep meaningful line breaks in translated text.
- Use align as one of: left, center, right, justify.
- If no readable text exists, do not output anything.
`.trim();
}
