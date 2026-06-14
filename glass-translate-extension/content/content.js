(() => {
  if (window.__glassTranslateInjected) {
    const existingRoot = document.getElementById("glass-translate-root");
    if (existingRoot) existingRoot.classList.toggle("is-hidden");
    return;
  }

  window.__glassTranslateInjected = true;

  const API_URL = "https://glass-translate-api.onrender.com/api/translate-image";
  const MIN_WIDTH = 520;
  const MIN_HEIGHT = 320;
  const EDGE_MARGIN = 8;

  const text = {
    language: "\u8bed\u8a00",
    model: "\u6a21\u578b",
    chinese: "\u4e2d\u6587",
    japanese: "\u65e5\u672c\u8bed",
    korean: "\u97e9\u8bed",
    translate: "\u7ffb\u8bd1",
    clear: "\u6e05\u9664",
    translating: "\u7ffb\u8bd1\u4e2d...",
    translateFailed: "\u7ffb\u8bd1\u5931\u8d25",
    noText: "\u672a\u8bc6\u522b\u5230\u53ef\u7ffb\u8bd1\u6587\u5b57",
    screenshotFailed: "\u622a\u56fe\u5931\u8d25",
    canvasFailed: "\u65e0\u6cd5\u521b\u5efa\u622a\u56fe\u753b\u5e03",
    imageLoadFailed: "\u622a\u56fe\u56fe\u7247\u52a0\u8f7d\u5931\u8d25",
    requestFailed: "\u670d\u52a1\u8bf7\u6c42\u5931\u8d25",
    close: "\u5173\u95ed"
  };

  const root = document.createElement("div");
  root.id = "glass-translate-root";
  root.innerHTML = `
    <div class="glass-window" role="dialog" aria-label="Glass Translate">
      <button class="close-button" type="button" title="${text.close}" aria-label="${text.close}">x</button>

      <div class="glass-area" data-glass-area>
        <div class="translation-layer" data-translation-layer></div>
      </div>

      <div class="glass-panel">
        <div class="field">
          <label for="glass-target-language">${text.language}</label>
          <select id="glass-target-language" class="target-language">
            <option value="${text.chinese}" selected>${text.chinese}</option>
            <option value="English">English</option>
            <option value="${text.japanese}">${text.japanese}</option>
            <option value="${text.korean}">${text.korean}</option>
            <option value="Francais">Francais</option>
            <option value="Deutsch">Deutsch</option>
            <option value="Espanol">Espanol</option>
          </select>
        </div>

        <div class="field">
          <label for="glass-model">${text.model}</label>
          <select id="glass-model" class="model-select">
            <option value="gpt" selected>GPT</option>
            <option value="gemini">Gemini</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>

        <button class="translate-button" title="${text.translate}" aria-label="${text.translate}"></button>
        <button class="clear-button" type="button">${text.clear}</button>
        <div class="status" aria-live="polite"></div>
      </div>

      <div class="resize-handle resize-n" data-resize="n"></div>
      <div class="resize-handle resize-e" data-resize="e"></div>
      <div class="resize-handle resize-s" data-resize="s"></div>
      <div class="resize-handle resize-w" data-resize="w"></div>
      <div class="resize-handle resize-ne" data-resize="ne"></div>
      <div class="resize-handle resize-nw" data-resize="nw"></div>
      <div class="resize-handle resize-se" data-resize="se"></div>
      <div class="resize-handle resize-sw" data-resize="sw"></div>
    </div>
  `;

  document.documentElement.appendChild(root);

  const glassWindow = root.querySelector(".glass-window");
  const glassArea = root.querySelector("[data-glass-area]");
  const translateButton = root.querySelector(".translate-button");
  const clearButton = root.querySelector(".clear-button");
  const closeButton = root.querySelector(".close-button");
  const translationLayer = root.querySelector("[data-translation-layer]");
  const status = root.querySelector(".status");
  const targetLanguageInput = root.querySelector(".target-language");
  const modelInput = root.querySelector(".model-select");

  let dragging = false;
  let resizing = null;
  let offsetX = 0;
  let offsetY = 0;

  glassWindow.addEventListener("mousedown", (event) => {
    const resizeHandle = event.target.closest("[data-resize]");
    if (resizeHandle) {
      beginResize(event, resizeHandle.dataset.resize);
      return;
    }

    if (event.target.closest("select") || event.target.closest("button")) return;

    dragging = true;
    const rect = glassWindow.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    glassWindow.classList.add("is-dragging");
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (resizing) {
      updateResize(event);
      return;
    }

    if (!dragging) return;

    const nextLeft = clamp(event.clientX - offsetX, EDGE_MARGIN, window.innerWidth - 120);
    const nextTop = clamp(event.clientY - offsetY, EDGE_MARGIN, window.innerHeight - 80);

    glassWindow.style.left = `${nextLeft}px`;
    glassWindow.style.top = `${nextTop}px`;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
    resizing = null;
    glassWindow.classList.remove("is-dragging", "is-resizing");
  });

  closeButton.addEventListener("click", () => {
    root.remove();
    window.__glassTranslateInjected = false;
  });

  clearButton.addEventListener("click", () => {
    translationLayer.innerHTML = "";
    glassArea.classList.remove("has-translation");
    status.textContent = "";
  });

  translateButton.addEventListener("click", async () => {
    try {
      setBusy(true, text.translating);
      translationLayer.innerHTML = "";
      glassArea.classList.remove("has-translation");

      const screenshot = await captureVisibleTab();
      const croppedImage = await cropGlassArea(screenshot);
      const rect = glassArea.getBoundingClientRect();

      const result = await requestTranslation({
        image: croppedImage,
        targetLanguage: targetLanguageInput.value,
        model: modelInput.value,
        viewport: {
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });

      if (!result.success) {
        throw new Error(result.message || text.translateFailed);
      }

      renderTranslationBlocks(result.blocks || []);
      glassArea.classList.toggle("has-translation", Boolean(result.blocks?.length));
      status.textContent = result.blocks?.length ? "" : text.noText;
    } catch (error) {
      console.error(error);
      status.textContent = error.message || text.translateFailed;
    } finally {
      setBusy(false);
    }
  });

  function beginResize(event, direction) {
    const rect = glassWindow.getBoundingClientRect();

    resizing = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };

    glassWindow.classList.add("is-resizing");
    event.preventDefault();
    event.stopPropagation();
  }

  function updateResize(event) {
    const dx = event.clientX - resizing.startX;
    const dy = event.clientY - resizing.startY;
    const direction = resizing.direction;

    let left = resizing.left;
    let top = resizing.top;
    let width = resizing.width;
    let height = resizing.height;

    if (direction.includes("e")) width = resizing.width + dx;
    if (direction.includes("s")) height = resizing.height + dy;

    if (direction.includes("w")) {
      width = resizing.width - dx;
      left = resizing.left + dx;
    }

    if (direction.includes("n")) {
      height = resizing.height - dy;
      top = resizing.top + dy;
    }

    if (width < MIN_WIDTH) {
      if (direction.includes("w")) left -= MIN_WIDTH - width;
      width = MIN_WIDTH;
    }

    if (height < MIN_HEIGHT) {
      if (direction.includes("n")) top -= MIN_HEIGHT - height;
      height = MIN_HEIGHT;
    }

    const maxWidth = window.innerWidth - EDGE_MARGIN - left;
    const maxHeight = window.innerHeight - EDGE_MARGIN - top;

    width = clamp(width, MIN_WIDTH, Math.max(MIN_WIDTH, maxWidth));
    height = clamp(height, MIN_HEIGHT, Math.max(MIN_HEIGHT, maxHeight));
    left = clamp(left, EDGE_MARGIN, window.innerWidth - MIN_WIDTH - EDGE_MARGIN);
    top = clamp(top, EDGE_MARGIN, window.innerHeight - MIN_HEIGHT - EDGE_MARGIN);

    glassWindow.style.left = `${left}px`;
    glassWindow.style.top = `${top}px`;
    glassWindow.style.width = `${width}px`;
    glassWindow.style.height = `${height}px`;
  }

  function captureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || text.screenshotFailed));
          return;
        }

        resolve(response.dataUrl);
      });
    });
  }

  function cropGlassArea(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        const rect = glassArea.getBoundingClientRect();
        const scale = window.devicePixelRatio || 1;

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error(text.canvasFailed));
          return;
        }

        ctx.drawImage(
          image,
          Math.round(rect.left * scale),
          Math.round(rect.top * scale),
          Math.round(rect.width * scale),
          Math.round(rect.height * scale),
          0,
          0,
          canvas.width,
          canvas.height
        );

        resolve(canvas.toDataURL("image/png"));
      };

      image.onerror = () => reject(new Error(text.imageLoadFailed));
      image.src = dataUrl;
    });
  }

  async function requestTranslation(payload) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || `${text.requestFailed}: ${response.status}`);
    }

    return data;
  }

  function renderTranslationBlocks(blocks) {
    translationLayer.innerHTML = "";

    for (const block of blocks) {
      const el = document.createElement("div");
      el.className = "translation-block";
      el.textContent = block.translatedText || "";

      Object.assign(el.style, {
        left: `${toNumber(block.x, 0)}px`,
        top: `${toNumber(block.y, 0)}px`,
        width: `${Math.max(toNumber(block.width, 120), 24)}px`,
        minHeight: `${Math.max(toNumber(block.height, 24), 18)}px`,
        fontSize: `${clamp(toNumber(block.fontSize, 16), 10, 48)}px`,
        lineHeight: `${clamp(toNumber(block.lineHeight, 22), 12, 64)}px`,
        textAlign: normalizeAlign(block.align)
      });

      translationLayer.appendChild(el);
    }
  }

  function setBusy(isBusy, message = "") {
    translateButton.disabled = isBusy;
    translateButton.classList.toggle("is-loading", isBusy);
    if (message) status.textContent = message;
  }

  function normalizeAlign(align) {
    if (["left", "center", "right", "justify"].includes(align)) return align;
    return "left";
  }

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
