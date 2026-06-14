const ALIGN_VALUES = new Set(["left", "center", "right", "justify"]);

export function normalizeBlocks(blocks, viewport) {
  if (!Array.isArray(blocks)) return [];

  return blocks
    .map((block, index) => normalizeBlock(block, index, viewport))
    .filter(Boolean);
}

function normalizeBlock(block, index, viewport) {
  if (!block || typeof block !== "object") return null;

  const translatedText = String(block.translatedText || "").trim();
  if (!translatedText) return null;

  const maxWidth = Number(viewport?.width || 2000);
  const maxHeight = Number(viewport?.height || 2000);

  const x = clamp(toNumber(block.x, 0), 0, maxWidth);
  const y = clamp(toNumber(block.y, 0), 0, maxHeight);
  const width = clamp(toNumber(block.width, 160), 16, Math.max(16, maxWidth - x));
  const height = clamp(toNumber(block.height, 24), 12, Math.max(12, maxHeight - y));
  const fontSize = clamp(toNumber(block.fontSize, 16), 8, 48);
  const lineHeight = clamp(toNumber(block.lineHeight, Math.round(fontSize * 1.35)), 10, 72);
  const align = ALIGN_VALUES.has(block.align) ? block.align : "left";

  return {
    id: String(block.id || `block_${index + 1}`),
    sourceText: String(block.sourceText || ""),
    translatedText,
    x,
    y,
    width,
    height,
    fontSize,
    lineHeight,
    align
  };
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
