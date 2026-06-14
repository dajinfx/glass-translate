(() => {
  if (window.__glassTranslateInjected) {
    const existingRoot = document.getElementById("glass-translate-root");
    if (existingRoot) existingRoot.classList.toggle("is-hidden");
    return;
  }

  window.__glassTranslateInjected = true;

  const API_URL = "http://localhost:3000/api/translate-image";

  const root = document.createElement("div");
  root.id = "glass-translate-root";
  root.innerHTML = `
    <div class="glass-window" role="dialog" aria-label="Glass Translate">
      <div class="glass-area" data-glass-area>
        <div class="glass-empty-state"> </div>
        <div class="translation-layer" data-translation-layer></div>
      </div>
      <div class="glass-panel">
        <div class="field">
          <label for="glass-target-language">语言</label>
          <select id="glass-target-language" class="target-language">
            <option value="中文" selected>中文</option>
            <option value="English">English</option>
            <option value="日本語">日本語</option>
            <option value="한국어">한국어</option>
            <option value="Français">Français</option>
            <option value="Deutsch">Deutsch</option>
            <option value="Español">Español</option>
          </select>
        </div>

        <div class="field">
          <label for="glass-model">模型</label>
          <select id="glass-model" class="model-select">
            <option value="gpt" selected>GPT</option>
            <option value="gemini">Gemini</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>

        <button class="translate-button" title="翻译" aria-label="翻译"></button>
        <button class="clear-button" type="button">清除</button>
        <div class="status" aria-live="polite"></div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(root);

  const glassWindow = root.querySelector(".glass-window");
  const glassArea = root.querySelector("[data-glass-area]");
  const translateButton = root.querySelector(".translate-button");
  const clearButton = root.querySelector(".clear-button");
  const translationLayer = root.querySelector("[data-translation-layer]");
  const status = root.querySelector(".status");
  const targetLanguageInput = root.querySelector(".target-language");
  const modelInput = root.querySelector(".model-select");

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  glassWindow.addEventListener("mousedown", (event) => {
    if (event.target.closest("select") || event.target.closest("button")) return;

    dragging = true;
    const rect = glassWindow.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    glassWindow.classList.add("is-dragging");
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;

    const nextLeft = clamp(event.clientX - offsetX, 8, window.innerWidth - 120);
    const nextTop = clamp(event.clientY - offsetY, 8, window.innerHeight - 80);

    glassWindow.style.left = `${nextLeft}px`;
    glassWindow.style.top = `${nextTop}px`;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
    glassWindow.classList.remove("is-dragging");
  });

  clearButton.addEventListener("click", () => {
    translationLayer.innerHTML = "";
    status.textContent = "";
  });

  translateButton.addEventListener("click", async () => {
    try {
      setBusy(true, "翻译中...");
      translationLayer.innerHTML = "";

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
        throw new Error(result.message || "翻译失败");
      }

      renderTranslationBlocks(result.blocks || []);
      status.textContent = result.blocks?.length ? "" : "未识别到可翻译文字";
    } catch (error) {
      console.error(error);
      status.textContent = error.message || "翻译失败";
    } finally {
      setBusy(false);
    }
  });

  function captureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "截图失败"));
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
          reject(new Error("无法创建截图画布"));
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

      image.onerror = () => reject(new Error("截图图片加载失败"));
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
      throw new Error(data?.message || `服务请求失败：${response.status}`);
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
