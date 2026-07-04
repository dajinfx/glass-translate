(() => {
  if (window.__glassTranslateInjected) {
    const existingRoot = document.getElementById("glass-translate-root");
    if (existingRoot) existingRoot.classList.toggle("is-hidden");
    return;
  }

  window.__glassTranslateInjected = true;

  const API_URL = "https://glass-translate-api.onrender.com/api/translate-image";
  const TEXT_API_URL = "https://glass-translate-api.onrender.com/api/translate-text";
  const API_HEALTH_URL = "https://glass-translate-api.onrender.com/health";
  const MIN_WIDTH = 360;
  const MIN_HEIGHT = 120;
  const EDGE_MARGIN = 8;
  const RIGHT_EDGE_MARGIN = 0;
  const TOOLBAR_CLEARANCE = 80;
  const TRANSLATION_PADDING = 14;
  const TRANSLATE_BUTTON_SAFE_WIDTH = 0;
  const TRANSLATE_BUTTON_SAFE_HEIGHT = 0;
  const FLOW_OVERLAP_LIMIT = 0.18;
  const TEXT_LINE_Y_TOLERANCE = 10;
  const TEXT_COLUMN_GAP_LIMIT = 260;
  const TEXT_TRANSLATION_CHUNK_CHAR_LIMIT = 1800;
  const TEXT_TRANSLATION_TOTAL_CHAR_LIMIT = 5200;
  const DEFAULT_LANGUAGE_STORAGE_KEY = "glassTranslateDefaultLanguage";
  const DEFAULT_MODEL_STORAGE_KEY = "glassTranslateDefaultModel";
  const CAPTURE_MODE_STORAGE_KEY = "glassTranslateCaptureMode";
  const DEFAULT_LANGUAGE = "English";
  const DEFAULT_MODEL = "deepseek";
  const DEFAULT_CAPTURE_MODE = "text";
  const APP_VERSION = getExtensionVersion();

  const LANGUAGE_OPTIONS = [
    { key: "en", value: "English", label: "English" },
    { key: "zh", value: "\u4e2d\u6587", label: "\u4e2d\u6587" },
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
      defaultModel: "\u9ed8\u8ba4\u6a21\u578b",
      captureMode: "\u622a\u5c4f\u6a21\u5f0f",
      save: "\u4fdd\u5b58",
      saved: "\u5df2\u4fdd\u5b58",
      translating: "\u7ffb\u8bd1\u4e2d...",
      preparing: "\u51c6\u5907\u7ffb\u8bd1...",
      readingText: "\u6b63\u5728\u8bfb\u53d6\u6846\u5185\u6587\u672c...",
      textReady: "\u5df2\u8bfb\u53d6 {count} \u6bb5\u6587\u672c\uff0c\u6b63\u5728\u53d1\u9001\u540e\u53f0...",
      capturingImage: "\u6b63\u5728\u622a\u53d6\u6846\u5185\u753b\u9762...",
      imageReady: "\u5df2\u622a\u53d6\u753b\u9762\uff0c\u6b63\u5728\u53d1\u9001\u540e\u53f0...",
      waitingTranslation: "\u5df2\u53d1\u9001\u540e\u53f0\uff0c\u7b49\u5f85\u7ffb\u8bd1\u8fd4\u56de...",
      renderingTranslation: "\u5df2\u6536\u5230\u7ffb\u8bd1\uff0c\u6b63\u5728\u663e\u793a...",
      translateFailed: "\u7ffb\u8bd1\u5931\u8d25",
      noText: "\u672a\u8bc6\u522b\u5230\u53ef\u7ffb\u8bd1\u6587\u5b57",
      noPageText: "\u672a\u627e\u5230\u7f51\u9875\u6587\u672c\uff0c\u8bf7\u5728\u8bbe\u7f6e\u4e2d\u5207\u6362\u5230 OCR",
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
      defaultModel: "Default model",
      captureMode: "Capture mode",
      save: "Save",
      saved: "Saved",
      translating: "Translating...",
      preparing: "Preparing translation...",
      readingText: "Reading text inside the window...",
      textReady: "Read {count} text blocks. Sending to server...",
      capturingImage: "Capturing the window...",
      imageReady: "Captured image. Sending to server...",
      waitingTranslation: "Sent to server. Waiting for translation...",
      renderingTranslation: "Translation received. Rendering...",
      translateFailed: "Translation failed",
      noText: "No translatable text found",
      noPageText: "No page text found. Switch to OCR in Settings.",
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
      defaultModel: "\u65e2\u5b9a\u306e\u30e2\u30c7\u30eb",
      captureMode: "\u30ad\u30e3\u30d7\u30c1\u30e3\u30e2\u30fc\u30c9",
      save: "\u4fdd\u5b58",
      saved: "\u4fdd\u5b58\u3057\u307e\u3057\u305f",
      translating: "\u7ffb\u8a33\u4e2d...",
      translateFailed: "\u7ffb\u8a33\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
      noText: "\u7ffb\u8a33\u53ef\u80fd\u306a\u30c6\u30ad\u30b9\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093",
      noPageText: "\u30da\u30fc\u30b8\u30c6\u30ad\u30b9\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002\u8a2d\u5b9a\u3067 OCR \u306b\u5207\u308a\u66ff\u3048\u3066\u304f\u3060\u3055\u3044\u3002",
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
      defaultModel: "\uae30\ubcf8 \ubaa8\ub378",
      captureMode: "\ucea1\ucc98 \ubaa8\ub4dc",
      save: "\uc800\uc7a5",
      saved: "\uc800\uc7a5\ub428",
      translating: "\ubc88\uc5ed \uc911...",
      translateFailed: "\ubc88\uc5ed \uc2e4\ud328",
      noText: "\ubc88\uc5ed\ud560 \ud14d\uc2a4\ud2b8\ub97c \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4",
      noPageText: "\ud398\uc774\uc9c0 \ud14d\uc2a4\ud2b8\ub97c \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \uc124\uc815\uc5d0\uc11c OCR\ub85c \ubc14\uafb8\uc138\uc694.",
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
      defaultModel: "Modele par defaut",
      captureMode: "Mode de capture",
      save: "Enregistrer",
      saved: "Enregistre",
      translating: "Traduction...",
      translateFailed: "Echec de la traduction",
      noText: "Aucun texte traduisible trouve",
      noPageText: "Aucun texte de page trouve. Passez en OCR dans Parametres.",
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
      defaultModel: "Standardmodell",
      captureMode: "Erfassungsmodus",
      save: "Speichern",
      saved: "Gespeichert",
      translating: "Ubersetzen...",
      translateFailed: "Ubersetzung fehlgeschlagen",
      noText: "Kein ubersetzbarer Text gefunden",
      noPageText: "Kein Seitentext gefunden. In den Einstellungen auf OCR wechseln.",
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
      defaultModel: "Modelo predeterminado",
      captureMode: "Modo de captura",
      save: "Guardar",
      saved: "Guardado",
      translating: "Traduciendo...",
      translateFailed: "Error de traduccion",
      noText: "No se encontro texto traducible",
      noPageText: "No se encontro texto en la pagina. Cambie a OCR en Configuracion.",
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
      <div class="glass-panel">
        <button class="translate-button" type="button" title="" aria-label="" data-i18n="translate"></button>
        <button class="clear-button" type="button" data-i18n="clear"></button>
        <select id="glass-target-language" class="target-language" aria-label="Language">
          ${buildLanguageOptions(DEFAULT_LANGUAGE)}
        </select>
        <button class="settings-button" type="button" data-i18n="settings"></button>
        <button class="close-button" type="button" title="" aria-label="">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"></path>
          </svg>
        </button>
        <div class="toolbar-drag-space" aria-hidden="true"></div>

        <div class="settings-panel" data-settings-panel hidden>
          <div class="settings-version">Glass Translate v${APP_VERSION}</div>
          <div class="settings-field">
            <label for="glass-default-language" data-i18n="defaultLanguage"></label>
            <select id="glass-default-language" class="default-language">
              ${buildLanguageOptions(DEFAULT_LANGUAGE)}
            </select>
          </div>
          <div class="settings-field">
            <label for="glass-model" data-i18n="defaultModel"></label>
            <select id="glass-model" class="model-select">
              ${buildModelOptions(DEFAULT_MODEL)}
            </select>
          </div>
          <div class="settings-field">
            <label for="glass-capture-mode" data-i18n="captureMode"></label>
            <select id="glass-capture-mode" class="capture-mode-select">
              ${buildCaptureModeOptions(DEFAULT_CAPTURE_MODE)}
            </select>
          </div>
          <button class="save-settings-button" type="button" data-i18n="save"></button>
        </div>

        <div class="status" aria-live="polite"></div>
      </div>

      <div class="glass-area" data-glass-area>
        <div class="translation-layer" data-translation-layer></div>
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
  const captureModeInput = root.querySelector(".capture-mode-select");

  let dragging = false;
  let resizing = null;
  let activePointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  applyToolLanguage(DEFAULT_LANGUAGE);
  applyDefaultModel(DEFAULT_MODEL);
  loadDefaults();
  warmApi();

  glassWindow.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    const resizeHandle = event.target.closest("[data-resize]");
    if (resizeHandle) {
      beginResize(event, resizeHandle.dataset.resize);
      return;
    }

    if (event.target.closest(".translation-block") || event.target.closest(".translation-layer")) {
      return;
    }

    if (event.target.closest(".settings-panel")) return;
    if (event.target.closest("select") || event.target.closest("button")) return;

    beginDrag(event);
  });

  window.addEventListener("pointermove", (event) => {
    if (activePointerId !== null && event.pointerId !== activePointerId) return;

    if (resizing) {
      updateResize(event);
      return;
    }

    if (!dragging) return;

    const rect = glassWindow.getBoundingClientRect();
    const maxLeft = Math.max(EDGE_MARGIN, getViewportWidth() - rect.width - RIGHT_EDGE_MARGIN);
    const maxTop = Math.max(TOOLBAR_CLEARANCE, getViewportHeight() - 80);
    const nextLeft = clamp(event.clientX - offsetX, EDGE_MARGIN, maxLeft);
    const nextTop = clamp(event.clientY - offsetY, TOOLBAR_CLEARANCE, maxTop);

    glassWindow.style.left = `${nextLeft}px`;
    glassWindow.style.top = `${nextTop}px`;
    event.preventDefault();
  }, true);

  window.addEventListener("pointerup", endInteraction, true);
  window.addEventListener("pointercancel", endInteraction, true);

  function endInteraction(event) {
    if (activePointerId !== null && event?.pointerId !== activePointerId) return;

    dragging = false;
    resizing = null;
    activePointerId = null;
    glassWindow.classList.remove("is-dragging", "is-resizing");

    try {
      if (event?.pointerId !== undefined && glassWindow.hasPointerCapture?.(event.pointerId)) {
        glassWindow.releasePointerCapture(event.pointerId);
      }
    } catch (error) {
      console.debug("Glass Translate pointer release skipped", error);
    }
  }

  closeButton.addEventListener("click", () => {
    root.remove();
    window.__glassTranslateInjected = false;
  });

  clearButton.addEventListener("click", () => {
    translationLayer.innerHTML = "";
    translationLayer.classList.remove("is-flow");
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
    const defaultModel = modelInput.value;
    const captureMode = captureModeInput.value;

    await setStoredValue(DEFAULT_LANGUAGE_STORAGE_KEY, defaultLanguage);
    await setStoredValue(DEFAULT_MODEL_STORAGE_KEY, defaultModel);
    await setStoredValue(CAPTURE_MODE_STORAGE_KEY, captureMode);
    targetLanguageInput.value = defaultLanguage;
    applyDefaultModel(defaultModel);
    applyCaptureMode(captureMode);
    applyToolLanguage(defaultLanguage);
    settingsPanel.hidden = true;
    status.textContent = activeText().saved;
  });

  translateButton.addEventListener("click", async () => {
    try {
      setBusy(true, statusText("preparing"));
      translationLayer.innerHTML = "";
      glassArea.classList.remove("has-translation");

      const rect = glassArea.getBoundingClientRect();
      const captureMode = captureModeInput.value;
      const viewport = {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
      let result;

      if (captureMode === "ocr") {
        status.textContent = statusText("capturingImage");
        const image = await cropGlassArea(await captureVisibleTab());
        status.textContent = statusText("imageReady");
        result = await requestOcrTranslation({
          image,
          targetLanguage: targetLanguageInput.value,
          model: modelInput.value,
          viewport
        });
      } else {
        status.textContent = statusText("readingText");
        const blocks = collectTextBlocksFromGlassArea();
        if (!blocks.length) {
          throw new Error(activeText().noPageText);
        }
        status.textContent = statusText("textReady", { count: blocks.length });
        result = await requestTextTranslation({
          blocks,
          targetLanguage: targetLanguageInput.value,
          model: modelInput.value,
          viewport
        });
      }

      if (!result.success) {
        throw new Error(result.message || activeText().translateFailed);
      }

      status.textContent = statusText("renderingTranslation");
      renderTranslationBlocks(result.blocks || [], captureMode);
      glassArea.classList.toggle("has-translation", Boolean(result.blocks?.length));
      status.textContent = result.blocks?.length ? "" : activeText().noText;
    } catch (error) {
      console.error(error);
      status.textContent = error.message || activeText().translateFailed;
    } finally {
      setBusy(false);
    }
  });

  function beginDrag(event) {
    activePointerId = event.pointerId;
    dragging = true;

    const rect = glassWindow.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;

    glassWindow.classList.add("is-dragging");
    capturePointer(event);
    event.preventDefault();
    event.stopPropagation();
  }

  function beginResize(event, direction) {
    const rect = glassWindow.getBoundingClientRect();

    activePointerId = event.pointerId;
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
    capturePointer(event);
    event.preventDefault();
    event.stopPropagation();
  }

  function updateResize(event) {
    const dx = event.clientX - resizing.startX;
    const dy = event.clientY - resizing.startY;
    const direction = resizing.direction;
    const viewportWidth = getViewportWidth();
    const viewportHeight = getViewportHeight();

    let left = direction.includes("w") ? resizing.left + dx : resizing.left;
    let top = direction.includes("n") ? resizing.top + dy : resizing.top;
    let right = direction.includes("e")
      ? resizing.left + resizing.width + dx
      : resizing.left + resizing.width;
    let bottom = direction.includes("s")
      ? resizing.top + resizing.height + dy
      : resizing.top + resizing.height;

    left = clamp(left, EDGE_MARGIN, viewportWidth - MIN_WIDTH - RIGHT_EDGE_MARGIN);
    top = clamp(top, TOOLBAR_CLEARANCE, viewportHeight - MIN_HEIGHT - EDGE_MARGIN);
    right = clamp(right, left + MIN_WIDTH, viewportWidth - RIGHT_EDGE_MARGIN);
    bottom = clamp(bottom, top + MIN_HEIGHT, viewportHeight - EDGE_MARGIN);

    if (direction.includes("w") && right - left < MIN_WIDTH) left = right - MIN_WIDTH;
    if (direction.includes("n") && bottom - top < MIN_HEIGHT) top = bottom - MIN_HEIGHT;

    const width = Math.max(MIN_WIDTH, right - left);
    const height = Math.max(MIN_HEIGHT, bottom - top);

    glassWindow.style.left = `${left}px`;
    glassWindow.style.top = `${top}px`;
    glassWindow.style.width = `${width}px`;
    glassWindow.style.height = `${height}px`;
    event.preventDefault();
  }

  function capturePointer(event) {
    try {
      glassWindow.setPointerCapture?.(event.pointerId);
    } catch (error) {
      console.debug("Glass Translate pointer capture skipped", error);
    }
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

  async function requestOcrTranslation(payload) {
    const responsePromise = fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    status.textContent = statusText("waitingTranslation");
    const response = await responsePromise;

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || `${activeText().requestFailed}: ${response.status}`);
    }

    return data;
  }

  async function requestTextTranslation(payload) {
    if (!payload.blocks.length) {
      throw new Error(activeText().noPageText);
    }

    const responsePromise = fetch(TEXT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    status.textContent = statusText("waitingTranslation");
    const response = await responsePromise;

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || `${activeText().requestFailed}: ${response.status}`);
    }

    return data;
  }

  function warmApi() {
    fetch(API_HEALTH_URL, {
      method: "GET",
      cache: "no-store"
    }).catch(() => {});
  }

  function collectTextBlocksFromGlassArea() {
    const glassRect = glassArea.getBoundingClientRect();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = normalizeText(node.nodeValue);
          if (!text) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || root.contains(parent)) return NodeFilter.FILTER_REJECT;
          if (shouldSkipElement(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          const style = window.getComputedStyle(parent);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const rawBlocks = [];
    let index = 1;
    let node = walker.nextNode();

    while (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      range.detach();

      if (rect.width > 0 && rect.height > 0 && intersects(rect, glassRect)) {
        const parent = node.parentElement;
        const style = window.getComputedStyle(parent);
        const sourceText = normalizeText(node.nodeValue);
        if (!isMeaningfulText(sourceText)) {
          node = walker.nextNode();
          continue;
        }

        const fontSize = parseFloat(style.fontSize) || 16;
        const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.35;

        rawBlocks.push({
          id: `text_${index}`,
          sourceText,
          x: Math.round(rect.left - glassRect.left),
          y: Math.round(rect.top - glassRect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          fontSize: Math.round(fontSize),
          lineHeight: Math.round(lineHeight),
          align: normalizeAlign(style.textAlign)
        });
        index += 1;
      }

      node = walker.nextNode();
    }

    return compactTextRowsForFastTranslation(mergeTextBlocksIntoRows(rawBlocks));
  }

  function compactTextRowsForFastTranslation(rows) {
    const chunks = [];
    let current = null;
    let previousRow = null;
    let totalChars = 0;

    for (const row of rows) {
      const text = normalizeText(row.sourceText);
      if (!text) continue;

      const separator = current && previousRow ? buildTextRowSeparator(previousRow, row) : "";
      const nextLength = separator.length + text.length;
      if (totalChars + nextLength > TEXT_TRANSLATION_TOTAL_CHAR_LIMIT) break;

      if (!current || current.sourceText.length + nextLength > TEXT_TRANSLATION_CHUNK_CHAR_LIMIT) {
        current = { ...row, sourceText: text };
        chunks.push(current);
      } else {
        current.sourceText = `${current.sourceText}${separator}${text}`;
        const right = Math.max(current.x + current.width, row.x + row.width);
        current.width = right - current.x;
        current.height = Math.max(current.height, row.y + row.height - current.y);
        current.fontSize = Math.max(current.fontSize, row.fontSize);
        current.lineHeight = Math.max(current.lineHeight, row.lineHeight);
      }

      totalChars += nextLength;
      previousRow = row;
    }

    return chunks.map((chunk, index) => ({
      ...chunk,
      id: `text_${index + 1}`
    }));
  }

  function buildTextRowSeparator(previousRow, row) {
    const previousBottom = previousRow.y + previousRow.height;
    const verticalGap = Math.max(0, row.y - previousBottom);
    const lineHeight = Math.max(previousRow.lineHeight || 0, row.lineHeight || 0, 18);

    if (verticalGap >= lineHeight * 1.2) return "\n\n";
    return "\n";
  }

  function renderTranslationBlocks(blocks, mode = "ocr") {
    translationLayer.innerHTML = "";

    if (mode === "text") {
      renderFlowTranslationBlocks(blocks);
      return;
    }

    translationLayer.classList.remove("is-flow");
    const layerWidth = Math.max(0, glassArea.clientWidth - TRANSLATION_PADDING * 2);
    const layerHeight = Math.max(0, glassArea.clientHeight - TRANSLATION_PADDING * 2);
    const visibleBlocks = normalizeRenderedBlockPositions(blocks, layerWidth, layerHeight);

    if (shouldRenderAsFlow(visibleBlocks)) {
      renderFlowTranslationBlocks(visibleBlocks);
      return;
    }

    for (const block of visibleBlocks) {
      const el = document.createElement("div");
      el.className = "translation-block";
      el.textContent = block.translatedText || "";
      const left = clamp(toNumber(block.x, 0), 0, layerWidth);
      const top = clamp(toNumber(block.y, 0), 0, layerHeight);
      const maxWidth = top < TRANSLATE_BUTTON_SAFE_HEIGHT
        ? Math.max(24, layerWidth - left - TRANSLATE_BUTTON_SAFE_WIDTH)
        : Math.max(24, layerWidth - left);
      const width = clamp(
        toNumber(block.width, 120),
        24,
        maxWidth
      );

      Object.assign(el.style, {
        left: `${TRANSLATION_PADDING + left}px`,
        top: `${TRANSLATION_PADDING + top}px`,
        width: `${width}px`,
        minHeight: `${Math.max(toNumber(block.height, 24), 18)}px`,
        fontSize: `${clamp(toNumber(block.fontSize, 16), 10, 48)}px`,
        lineHeight: `${clamp(toNumber(block.lineHeight, 22), 12, 64)}px`,
        textAlign: normalizeAlign(block.align)
      });

      translationLayer.appendChild(el);
    }
  }

  function renderFlowTranslationBlocks(blocks) {
    translationLayer.classList.add("is-flow");
    const visibleBlocks = (Array.isArray(blocks) ? blocks : [])
      .filter((block) => isMeaningfulText(block?.translatedText || block?.sourceText))
      .sort((a, b) => toNumber(a.y, 0) - toNumber(b.y, 0) || toNumber(a.x, 0) - toNumber(b.x, 0));

    for (const block of visibleBlocks) {
      const el = document.createElement("div");
      el.className = "translation-block translation-block-flow";
      el.textContent = block.translatedText || "";
      el.style.fontSize = `${clamp(toNumber(block.fontSize, 16), 13, 22)}px`;
      el.style.lineHeight = "1.55";
      translationLayer.appendChild(el);
    }
  }

  function mergeTextBlocksIntoRows(blocks) {
    const meaningfulBlocks = blocks
      .filter((block) => isMeaningfulText(block.sourceText))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];

    for (const block of meaningfulBlocks) {
      const last = rows[rows.length - 1];
      const sameRow = last && Math.abs(block.y - last.y) <= Math.max(TEXT_LINE_Y_TOLERANCE, last.lineHeight * 0.5);

      if (!sameRow) {
        rows.push({ ...block });
        continue;
      }

      const gap = block.x - (last.x + last.width);
      if (gap > TEXT_COLUMN_GAP_LIMIT) {
        rows.push({ ...block });
        continue;
      }

      last.sourceText = `${last.sourceText}${buildColumnSeparator(gap)}${block.sourceText}`.trim();
      const right = Math.max(last.x + last.width, block.x + block.width);
      last.width = right - last.x;
      last.height = Math.max(last.height, block.height);
      last.fontSize = Math.max(last.fontSize, block.fontSize);
      last.lineHeight = Math.max(last.lineHeight, block.lineHeight);
    }

    return rows.map((row, index) => ({
      ...row,
      id: `text_${index + 1}`
    }));
  }

  function buildColumnSeparator(gap) {
    if (gap > 160) return "    ";
    if (gap > 72) return "   ";
    return " ";
  }

  function shouldRenderAsFlow(blocks) {
    if (!Array.isArray(blocks) || blocks.length <= 1) return false;

    let overlapCount = 0;
    let checkedPairs = 0;

    for (let i = 0; i < blocks.length; i += 1) {
      const a = blockRect(blocks[i]);
      for (let j = i + 1; j < blocks.length; j += 1) {
        const b = blockRect(blocks[j]);
        const nearVertically = Math.abs(a.top - b.top) < Math.max(a.height, b.height) * 0.72;
        const overlapsHorizontally = a.left < b.right && b.left < a.right;

        if (nearVertically || overlapsHorizontally) {
          checkedPairs += 1;
          if (rectOverlapArea(a, b) > 0) overlapCount += 1;
        }
      }
    }

    if (!checkedPairs) return false;
    return overlapCount / checkedPairs > FLOW_OVERLAP_LIMIT;
  }

  function blockRect(block) {
    const left = toNumber(block.x, 0);
    const top = toNumber(block.y, 0);
    const width = Math.max(1, toNumber(block.width, 1));
    const height = Math.max(1, toNumber(block.height, toNumber(block.lineHeight, 20)));

    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height
    };
  }

  function rectOverlapArea(a, b) {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  }

  function normalizeRenderedBlockPositions(blocks, layerWidth, layerHeight) {
    const visibleBlocks = (Array.isArray(blocks) ? blocks : []).filter((block) => {
      return normalizeText(block?.translatedText || block?.sourceText);
    });

    if (!visibleBlocks.length) return [];

    const minX = Math.min(...visibleBlocks.map((block) => clamp(toNumber(block.x, 0), 0, layerWidth)));
    const minY = Math.min(...visibleBlocks.map((block) => clamp(toNumber(block.y, 0), 0, layerHeight)));

    return visibleBlocks.map((block) => ({
      ...block,
      x: Math.max(0, toNumber(block.x, 0) - minX),
      y: Math.max(0, toNumber(block.y, 0) - minY)
    }));
  }

  function setBusy(isBusy, message = "") {
    translateButton.disabled = isBusy;
    translateButton.classList.toggle("is-loading", isBusy);
    if (message) status.textContent = message;
  }

  async function loadDefaults() {
    const defaultLanguage = await getStoredValue(DEFAULT_LANGUAGE_STORAGE_KEY);
    const defaultModel = await getStoredValue(DEFAULT_MODEL_STORAGE_KEY);
    const captureMode = await getStoredValue(CAPTURE_MODE_STORAGE_KEY);

    if (defaultLanguage) {
      targetLanguageInput.value = defaultLanguage;
      defaultLanguageInput.value = defaultLanguage;
      applyToolLanguage(defaultLanguage);
    }

    applyDefaultModel(defaultModel || DEFAULT_MODEL);
    applyCaptureMode(captureMode || DEFAULT_CAPTURE_MODE);
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

  function statusText(key, values = {}) {
    const template = activeText()[key] || I18N.en[key] || activeText().translating;
    return Object.entries(values).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      template
    );
  }

  function buildLanguageOptions(selectedValue) {
    const normalizedSelected = normalizeLanguageValue(selectedValue);

    return LANGUAGE_OPTIONS.map((language) => {
      const selected = language.value === normalizedSelected ? " selected" : "";
      return `<option value="${language.value}"${selected}>${language.label}</option>`;
    }).join("");
  }

  function buildModelOptions(selectedValue) {
    const models = [
      { value: "deepseek", label: "DeepSeek" },
      { value: "gpt", label: "GPT" },
      { value: "gemini", label: "Gemini" }
    ];

    return models.map((model) => {
      const selected = model.value === selectedValue ? " selected" : "";
      return `<option value="${model.value}"${selected}>${model.label}</option>`;
    }).join("");
  }

  function buildCaptureModeOptions(selectedValue) {
    const modes = [
      { value: "text", label: "Text" },
      { value: "ocr", label: "Image text" }
    ];

    return modes.map((mode) => {
      const selected = mode.value === selectedValue ? " selected" : "";
      return `<option value="${mode.value}"${selected}>${mode.label}</option>`;
    }).join("");
  }

  function applyDefaultModel(model) {
    const allowedModels = new Set(["deepseek", "gpt", "gemini"]);
    modelInput.value = allowedModels.has(model) ? model : DEFAULT_MODEL;
  }

  function applyCaptureMode(mode) {
    const allowedModes = new Set(["text", "ocr"]);
    captureModeInput.value = allowedModes.has(mode) ? mode : DEFAULT_CAPTURE_MODE;
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

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function shouldSkipElement(element) {
    const tagName = element.tagName?.toLowerCase();
    if (["script", "style", "noscript", "textarea", "input", "select", "option", "button", "svg", "path"].includes(tagName)) {
      return true;
    }

    if (element.closest("button,[role='button'],[aria-hidden='true'],nav,header,footer")) {
      return true;
    }

    const ariaLabel = normalizeText(element.getAttribute("aria-label"));
    if (ariaLabel && !isMeaningfulText(ariaLabel)) return true;

    return false;
  }

  function isMeaningfulText(text) {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    if (/^[\d.,\s]+$/.test(normalized)) return false;
    if (/^@\S{2,}$/.test(normalized)) return false;
    if (/^\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i.test(normalized)) return false;
    if (/^(edited|translated|translate to .+|show more|show less)$/i.test(normalized)) return false;
    if (normalized.length <= 1) return false;

    const lower = normalized.toLowerCase();
    const uiTexts = new Set([
      "reply",
      "replies",
      "like",
      "likes",
      "dislike",
      "share",
      "save",
      "more",
      "read more",
      "show more",
      "show less",
      "translated to chinese",
      "translate to chinese",
      "\ub2f5\uae00",
      "\ub2f5",
      "\uae00",
      "\uc77c \uc804",
      "\uc88b\uc544\uc694",
      "\uacf5\uc720",
      "\uc800\uc7a5",
      "\ub354\ubcf4\uae30"
    ]);

    return !uiTexts.has(lower);
  }

  function intersects(a, b) {
    return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
  }

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getViewportWidth() {
    return Math.round(window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1024);
  }

  function getViewportHeight() {
    return Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 768);
  }

  function getExtensionVersion() {
    if (typeof chrome === "undefined" || !chrome.runtime?.getManifest) {
      return "0.1.6";
    }

    return chrome.runtime.getManifest().version || "0.1.6";
  }
})();
