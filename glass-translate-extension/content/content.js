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
  const DEFAULT_LANGUAGE_STORAGE_KEY = "glassTranslateDefaultLanguage";
  const DEFAULT_LANGUAGE = "\u4e2d\u6587";

  const LANGUAGE_OPTIONS = [
    { key: "zh", value: "\u4e2d\u6587", label: "\u4e2d\u6587" },
    { key: "en", value: "English", label: "English" },
    { key: "ja", value: "\u65e5\u672c\u8a9e", label: "\u65e5\u672c\u8a9e" },
    { key: "ko", value: "\ud55c\uad6d\uc5b4", label: "\ud55c\uad6d\uc5b4" },
    { key: "fr", value: "Fran\u00e7ais", label: "Fran\u00e7ais" },
    { key: "de", value: "Deutsch", label: "Deutsch" },
    { key: "es", value: "Espa\u00f1ol", label: "Espa\u00f1ol" }
  ];

  const I18N = {
    zh: {
      language: "\u8bed\u8a00",
      model: "\u6a21\u578b",
      translate: "\u7ffb\u8bd1",
      clear: "\u6e05\u9664",
      settings: "\u8bbe\u7f6e",
      defaultLanguage: "\u9ed8\u8ba4\u8bed\u8a00",
      save: "\u4fdd\u5b58",
      saved: "\u5df2\u4fdd\u5b58",
      translating: "\u7ffb\u8bd1\u4e2d...",
      translateFailed: "\u7ffb\u8bd1\u5931\u8d25",
      noText: "\u672a\u8bc6\u522b\u5230\u53ef\u7ffb\u8bd1\u6587\u5b57",
      screenshotFailed: "\u622a\u56fe\u5931\u8d25",
      canvasFailed: "\u65e0\u6cd5\u521b\u5efa\u622a\u56fe\u753b\u5e03",
      imageLoadFailed: "\u622a\u56fe\u56fe\u7247\u52a0\u8f7d\u5931\u8d25",
      requestFailed: "\u670d\u52a1\u8bf7\u6c42\u5931\u8d25",
      close: "\u5173\u95ed"
    },
    en: {
      language: "Language",
      model: "Model",
      translate: "Translate",
      clear: "Clear",
      settings: "Settings",
      defaultLanguage: "Default language",
      save: "Save",
      saved: "Saved",
      translating: "Translating...",
      translateFailed: "Translation failed",
      noText: "No translatable text found",
      screenshotFailed: "Screenshot failed",
      canvasFailed: "Could not create screenshot canvas",
      imageLoadFailed: "Screenshot image failed to load",
      requestFailed: "Service request failed",
      close: "Close"
    },
    ja: {
      language: "\u8a00\u8a9e",
      model: "\u30e2\u30c7\u30eb",
      translate: "\u7ffb\u8a33",
      clear: "\u30af\u30ea\u30a2",
      settings: "\u8a2d\u5b9a",
      defaultLanguage: "\u65e2\u5b9a\u306e\u8a00\u8a9e",
      save: "\u4fdd\u5b58",
      saved: "\u4fdd\u5b58\u3057\u307e\u3057\u305f",
      translating: "\u7ffb\u8a33\u4e2d...",
      translateFailed: "\u7ffb\u8a33\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
      noText: "\u7ffb\u8a33\u53ef\u80fd\u306a\u30c6\u30ad\u30b9\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093",
      screenshotFailed: "\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
      canvasFailed: "\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u7528\u30ad\u30e3\u30f3\u30d0\u30b9\u3092\u4f5c\u6210\u3067\u304d\u307e\u305b\u3093",
      imageLoadFailed: "\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u753b\u50cf\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
      requestFailed: "\u30b5\u30fc\u30d3\u30b9\u30ea\u30af\u30a8\u30b9\u30c8\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
      close: "\u9589\u3058\u308b"
    },
    ko: {
      language: "\uc5b8\uc5b4",
      model: "\ubaa8\ub378",
      translate: "\ubc88\uc5ed",
      clear: "\uc9c0\uc6b0\uae30",
      settings: "\uc124\uc815",
      defaultLanguage: "\uae30\ubcf8 \uc5b8\uc5b4",
      save: "\uc800\uc7a5",
      saved: "\uc800\uc7a5\ub428",
      translating: "\ubc88\uc5ed \uc911...",
      translateFailed: "\ubc88\uc5ed \uc2e4\ud328",
      noText: "\ubc88\uc5ed\ud560 \ud14d\uc2a4\ud2b8\ub97c \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4",
      screenshotFailed: "\uc2a4\ud06c\ub9b0\uc0f7 \uc2e4\ud328",
      canvasFailed: "\uc2a4\ud06c\ub9b0\uc0f7 \uce94\ubc84\uc2a4\ub97c \ub9cc\ub4e4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4",
      imageLoadFailed: "\uc2a4\ud06c\ub9b0\uc0f7 \uc774\ubbf8\uc9c0\ub97c \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4",
      requestFailed: "\uc11c\ube44\uc2a4 \uc694\uccad \uc2e4\ud328",
      close: "\ub2eb\uae30"
    },
    fr: {
      language: "Langue",
      model: "Modele",
      translate: "Traduire",
      clear: "Effacer",
      settings: "Parametres",
      defaultLanguage: "Langue par defaut",
      save: "Enregistrer",
      saved: "Enregistre",
      translating: "Traduction...",
      translateFailed: "Echec de la traduction",
      noText: "Aucun texte traduisible trouve",
      screenshotFailed: "Echec de la capture",
      canvasFailed: "Impossible de creer le canevas",
      imageLoadFailed: "Echec du chargement de l'image",
      requestFailed: "Echec de la requete",
      close: "Fermer"
    },
    de: {
      language: "Sprache",
      model: "Modell",
      translate: "Ubersetzen",
      clear: "Loschen",
      settings: "Einstellungen",
      defaultLanguage: "Standardsprache",
      save: "Speichern",
      saved: "Gespeichert",
      translating: "Ubersetzen...",
      translateFailed: "Ubersetzung fehlgeschlagen",
      noText: "Kein ubersetzbarer Text gefunden",
      screenshotFailed: "Screenshot fehlgeschlagen",
      canvasFailed: "Screenshot-Canvas konnte nicht erstellt werden",
      imageLoadFailed: "Screenshot-Bild konnte nicht geladen werden",
      requestFailed: "Serviceanfrage fehlgeschlagen",
      close: "Schliessen"
    },
    es: {
      language: "Idioma",
      model: "Modelo",
      translate: "Traducir",
      clear: "Limpiar",
      settings: "Configuracion",
      defaultLanguage: "Idioma predeterminado",
      save: "Guardar",
      saved: "Guardado",
      translating: "Traduciendo...",
      translateFailed: "Error de traduccion",
      noText: "No se encontro texto traducible",
      screenshotFailed: "Error de captura",
      canvasFailed: "No se pudo crear el lienzo",
      imageLoadFailed: "No se pudo cargar la imagen",
      requestFailed: "Error de solicitud",
      close: "Cerrar"
    }
  };

  let currentLanguage = DEFAULT_LANGUAGE;

  const root = document.createElement("div");
  root.id = "glass-translate-root";
  root.innerHTML = `
    <div class="glass-window" role="dialog" aria-label="Glass Translate">
      <button class="close-button" type="button" title="" aria-label="">x</button>

      <div class="glass-area" data-glass-area>
        <div class="translation-layer" data-translation-layer></div>
      </div>

      <div class="glass-panel">
        <div class="field">
          <label for="glass-target-language" data-i18n="language"></label>
          <select id="glass-target-language" class="target-language">
            ${buildLanguageOptions(DEFAULT_LANGUAGE)}
          </select>
        </div>

        <div class="field">
          <label for="glass-model" data-i18n="model"></label>
          <select id="glass-model" class="model-select">
            <option value="gpt" selected>GPT</option>
            <option value="gemini">Gemini</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>

        <button class="translate-button" title="" aria-label=""></button>
        <button class="clear-button" type="button" data-i18n="clear"></button>
        <button class="settings-button" type="button" data-i18n="settings"></button>

        <div class="settings-panel" data-settings-panel hidden>
          <label for="glass-default-language" data-i18n="defaultLanguage"></label>
          <select id="glass-default-language" class="default-language">
            ${buildLanguageOptions(DEFAULT_LANGUAGE)}
          </select>
          <button class="save-settings-button" type="button" data-i18n="save"></button>
        </div>

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
  const settingsButton = root.querySelector(".settings-button");
  const saveSettingsButton = root.querySelector(".save-settings-button");
  const settingsPanel = root.querySelector("[data-settings-panel]");
  const translationLayer = root.querySelector("[data-translation-layer]");
  const status = root.querySelector(".status");
  const targetLanguageInput = root.querySelector(".target-language");
  const defaultLanguageInput = root.querySelector(".default-language");
  const modelInput = root.querySelector(".model-select");

  let dragging = false;
  let resizing = null;
  let offsetX = 0;
  let offsetY = 0;

  applyToolLanguage(DEFAULT_LANGUAGE);
  loadDefaultLanguage();

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

  targetLanguageInput.addEventListener("change", () => {
    applyToolLanguage(targetLanguageInput.value);
  });

  settingsButton.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });

  saveSettingsButton.addEventListener("click", async () => {
    const defaultLanguage = defaultLanguageInput.value;

    await setStoredValue(DEFAULT_LANGUAGE_STORAGE_KEY, defaultLanguage);
    targetLanguageInput.value = defaultLanguage;
    applyToolLanguage(defaultLanguage);
    status.textContent = activeText().saved;
  });

  translateButton.addEventListener("click", async () => {
    try {
      setBusy(true, activeText().translating);
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
        throw new Error(result.message || activeText().translateFailed);
      }

      renderTranslationBlocks(result.blocks || []);
      glassArea.classList.toggle("has-translation", Boolean(result.blocks?.length));
      status.textContent = result.blocks?.length ? "" : activeText().noText;
    } catch (error) {
      console.error(error);
      status.textContent = error.message || activeText().translateFailed;
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
          reject(new Error(response?.error || activeText().screenshotFailed));
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
          reject(new Error(activeText().canvasFailed));
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

      image.onerror = () => reject(new Error(activeText().imageLoadFailed));
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
      throw new Error(data?.message || `${activeText().requestFailed}: ${response.status}`);
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

  async function loadDefaultLanguage() {
    const defaultLanguage = await getStoredValue(DEFAULT_LANGUAGE_STORAGE_KEY);
    if (!defaultLanguage) return;

    targetLanguageInput.value = defaultLanguage;
    defaultLanguageInput.value = defaultLanguage;
    applyToolLanguage(defaultLanguage);
  }

  function applyToolLanguage(language) {
    currentLanguage = normalizeLanguageValue(language);
    const copy = activeText();

    targetLanguageInput.value = currentLanguage;
    defaultLanguageInput.value = currentLanguage;

    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = copy[element.dataset.i18n] || "";
    });

    translateButton.title = copy.translate;
    translateButton.setAttribute("aria-label", copy.translate);
    closeButton.title = copy.close;
    closeButton.setAttribute("aria-label", copy.close);
  }

  function activeText() {
    return I18N[languageKey(currentLanguage)] || I18N.zh;
  }

  function buildLanguageOptions(selectedValue) {
    const normalizedSelected = normalizeLanguageValue(selectedValue);

    return LANGUAGE_OPTIONS.map((language) => {
      const selected = language.value === normalizedSelected ? " selected" : "";
      return `<option value="${language.value}"${selected}>${language.label}</option>`;
    }).join("");
  }

  function normalizeLanguageValue(value) {
    const matchingLanguage = LANGUAGE_OPTIONS.find((language) => language.value === value);
    return matchingLanguage?.value || DEFAULT_LANGUAGE;
  }

  function languageKey(value) {
    return LANGUAGE_OPTIONS.find((language) => language.value === value)?.key || "zh";
  }

  function getStoredValue(key) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve(window.localStorage.getItem(key));
        return;
      }

      chrome.storage.local.get(key, (items) => {
        resolve(items?.[key] || null);
      });
    });
  }

  function setStoredValue(key, value) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        window.localStorage.setItem(key, value);
        resolve();
        return;
      }

      chrome.storage.local.set({ [key]: value }, resolve);
    });
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
