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
  const MIN_WIDTH = 300;
  const MIN_HEIGHT = 40;
  const EDGE_MARGIN = 8;
  const RIGHT_EDGE_MARGIN = 0;
  const TOOLBAR_CLEARANCE = 16;
  const TRANSLATION_PADDING = 14;
  const TRANSLATE_BUTTON_SAFE_WIDTH = 0;
  const TRANSLATE_BUTTON_SAFE_HEIGHT = 0;
  const FLOW_OVERLAP_LIMIT = 0.18;
  const TEXT_LINE_Y_TOLERANCE = 10;
  const TEXT_COLUMN_GAP_LIMIT = 260;
  const TEXT_TRANSLATION_CHUNK_CHAR_LIMIT = 1800;
  const TEXT_TRANSLATION_TOTAL_CHAR_LIMIT = 5200;
  const TEXT_PARAGRAPH_GAP_RATIO = 0.42;
  const TEXT_FLOW_MAX_INDENT = 140;
  const DEFAULT_LANGUAGE_STORAGE_KEY = "glassTranslateDefaultLanguage";
  const DEFAULT_MODEL_STORAGE_KEY = "glassTranslateDefaultModel";
  const DEFAULT_MODE_STORAGE_KEY = "glassTranslateDefaultMode";
  const CAPTURE_MODE_STORAGE_KEY = "glassTranslateCaptureMode";
  const DEFAULT_LANGUAGE = "English";
  const DEFAULT_MODEL = "deepseek";
  const DEFAULT_CAPTURE_MODE = "ocr";
  let streamAbortController = null;
  const APP_VERSION = getExtensionVersion();
  const MEANINGFUL_UI_SET = new Set([
    "reply", "replies", "like", "likes", "dislike", "share", "save",
    "more", "read more", "show more", "show less",
    "translated to chinese", "translate to chinese",
    "\ub2f5\uae00", "\ub2f5", "\uae00", "\uc77c \uc804",
    "\uc88b\uc544\uc694", "\uacf5\uc720", "\uc800\uc7a5", "\ub354\ubcf4\uae30"
  ]);

  const SKIPPABLE_TAGS = new Set([
    "script", "style", "noscript", "textarea", "input", "select",
    "option", "button", "svg", "path", "iframe", "canvas", "video",
    "audio", "img", "br", "hr", "link", "meta", "title"
  ]);

  const MEANINGFUL_TEXT_RE = /^[\d.,\s]+$/;
  const USERNAME_RE = /^@\S{2,}$/;
  const TIME_AGO_RE = /^\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i;
  const UI_FILTER_RE = /^(edited|translated|translate to .+|show more|show less)$/i;

  const LANGUAGE_OPTIONS = [
    { key: "en", value: "English", label: "English" },
    { key: "zh", value: "\u4e2d\u6587", label: "\u4e2d\u6587" },
    { key: "ja", value: "\u65e5\u672c\u8a9e", label: "\u65e5\u672c\u8a9e" },
    { key: "ko", value: "\ud55c\uad6d\uc5b4", label: "\ud55c\uad6d\uc5b4" },
    { key: "fr", value: "Fran\u00e7ais", label: "Fran\u00e7ais" },
    { key: "de", value: "Deutsch", label: "Deutsch" },
    { key: "es", value: "Espa\u00f1ol", label: "Espa\u00f1ol" },
    { key: "ru", value: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439" },
    { key: "ar", value: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" },
    { key: "hi", value: "\u0939\u093f\u0928\u094d\u0926\u0940", label: "\u0939\u093f\u0928\u094d\u0926\u0940" }
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
      stepPreparing: "\u5f00\u59cb",
      stepReadingText: "\u8bfb\u53d6\u6587\u672c",
      stepCapturingImage: "\u622a\u53d6\u753b\u9762",
      stepSending: "\u53d1\u9001\u540e\u53f0",
      stepWaiting: "\u7b49\u5f85\u8fd4\u56de",
      stepRendering: "\u663e\u793a\u7ed3\u679c",
      translateFailed: "\u7ffb\u8bd1\u5931\u8d25",
      noText: "\u672a\u8bc6\u522b\u5230\u53ef\u7ffb\u8bd1\u6587\u5b57",
      noPageText: "\u672a\u627e\u5230\u7f51\u9875\u6587\u672c\uff0c\u8bf7\u5728\u8bbe\u7f6e\u4e2d\u5207\u6362\u5230 OCR",
      screenshotFailed: "\u622a\u56fe\u5931\u8d25",
      canvasFailed: "\u65e0\u6cd5\u521b\u5efa\u622a\u56fe\u753b\u5e03",
      imageLoadFailed: "\u622a\u56fe\u56fe\u7247\u52a0\u8f7d\u5931\u8d25",
      requestFailed: "\u670d\u52a1\u8bf7\u6c42\u5931\u8d25",
      close: "\u5173\u95ed", stop: "\u505c\u6b62", minimize: "\u6700\u5c0f\u5316", maximize: "\u6700\u5927\u5316"
    },
    en: {
      language: "Language",
      model: "Model",
      translate: "Translate",
      clear: "Clear",
      settings: "Settings",
      defaultLanguage: "Default language",
      defaultModel: "Default model",
      defaultMode: "Default mode",
      modeText: "Page text",
      modeOcr: "Image capture",
      modeText: "Page text",
      modeOcr: "Image capture",
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
      stepPreparing: "Start",
      stepReadingText: "Read text",
      stepCapturingImage: "Capture",
      stepSending: "Send",
      stepWaiting: "Wait",
      stepRendering: "Render",
      translateFailed: "Translation failed",
      noText: "No translatable text found",
      noPageText: "No page text found. Switch to OCR in Settings.",
      screenshotFailed: "Screenshot failed",
      canvasFailed: "Could not create screenshot canvas",
      imageLoadFailed: "Screenshot image failed to load",
      requestFailed: "Service request failed",
      close: "Close", stop: "Stop", minimize: "Minimize", maximize: "Maximize"
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
      close: "\u9589\u3058\u308b", stop: "\u505c\u6b62", minimize: "\u6700\u5c0f\u5316", maximize: "\u6700\u5927\u5316"
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
      close: "\ub2eb\uae30", stop: "\uc911\uc9c0", minimize: "\ucd5c\uc18c\ud654", maximize: "\ucd5c\ub300\ud654"
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
      close: "Fermer", stop: "Arr\u00eater", minimize: "R\u00e9duire", maximize: "Agrandir"
    },
    de: {
      language: "Sprache",
      model: "Modell",
      translate: "Ubersetzen",
      clear: "Loschen",
      settings: "Einstellungen",
      defaultLanguage: "Standardsprache",
      defaultModel: "Standardmodell",
      defaultMode: "Standardmodus",
      modeText: "Seitentext",
      modeOcr: "Bildaufnahme",
      modeText: "Seitentext",
      modeOcr: "Bildaufnahme",
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
      close: "Schliessen", stop: "Stopp", minimize: "Minimieren", maximize: "Maximieren"
    },
    es: {
      language: "Idioma",
      model: "Modelo",
      translate: "Traducir",
      clear: "Limpiar",
      settings: "Configuracion",
      defaultLanguage: "Idioma predeterminado",
      defaultModel: "Modelo predeterminado",
      defaultMode: "Modo predeterminado",
      modeText: "Texto de página",
      modeOcr: "Captura de imagen",
      modeText: "Texto de página",
      modeOcr: "Captura de imagen",
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
      close: "Cerrar", stop: "Detener", minimize: "Minimizar", maximize: "Maximizar"
    },
    ru: {
      language: "\u042f\u0437\u044b\u043a",
      model: "\u041c\u043e\u0434\u0435\u043b\u044c",
      translate: "\u041f\u0435\u0440\u0435\u0432\u0435\u0441\u0442\u0438",
      clear: "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c",
      settings: "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438",
      defaultLanguage: "\u042f\u0437\u044b\u043a \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e",
      defaultModel: "\u041c\u043e\u0434\u0435\u043b\u044c \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e",
      captureMode: "\u0420\u0435\u0436\u0438\u043c \u0437\u0430\u0445\u0432\u0430\u0442\u0430",
      save: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c",
      saved: "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e",
      translating: "\u041f\u0435\u0440\u0435\u0432\u043e\u0434...",
      translateFailed: "\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0435\u0440\u0435\u0432\u043e\u0434\u0430",
      noText: "\u041f\u0435\u0440\u0435\u0432\u043e\u0434\u0438\u043c\u044b\u0439 \u0442\u0435\u043a\u0441\u0442 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d",
      noPageText: "\u0422\u0435\u043a\u0441\u0442 \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d. \u041f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0438\u0442\u0435\u0441\u044c \u043d\u0430 OCR \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445.",
      screenshotFailed: "\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043d\u0438\u043c\u043a\u0430 \u044d\u043a\u0440\u0430\u043d\u0430",
      canvasFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0445\u043e\u043b\u0441\u0442",
      imageLoadFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435",
      requestFailed: "\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0440\u043e\u0441\u0430",
      close: "\u0417\u0430\u043a\u0440\u044b\u0442\u044c", stop: "\u0421\u0442\u043e\u043f", minimize: "\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c", maximize: "\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c"
    },
    ar: {
      language: "\u0627\u0644\u0644\u063a\u0629",
      model: "\u0627\u0644\u0646\u0645\u0648\u0630\u062c",
      translate: "\u062a\u0631\u062c\u0645\u0629",
      clear: "\u0645\u0633\u062d",
      settings: "\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a",
      defaultLanguage: "\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629",
      defaultModel: "\u0627\u0644\u0646\u0645\u0648\u0630\u062c \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a",
      captureMode: "\u0648\u0636\u0639 \u0627\u0644\u0627\u0644\u062a\u0642\u0627\u0637",
      save: "\u062d\u0641\u0638",
      saved: "\u062a\u0645 \u0627\u0644\u062d\u0641\u0638",
      translating: "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u0631\u062c\u0645\u0629...",
      translateFailed: "\u0641\u0634\u0644\u062a \u0627\u0644\u062a\u0631\u062c\u0645\u0629",
      noText: "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0646\u0635 \u0642\u0627\u0628\u0644 \u0644\u0644\u062a\u0631\u062c\u0645\u0629",
      noPageText: "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0646\u0635 \u0641\u064a \u0627\u0644\u0635\u0641\u062d\u0629. \u0627\u0646\u062a\u0642\u0644 \u0625\u0644\u0649 OCR \u0641\u064a \u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a.",
      screenshotFailed: "\u0641\u0634\u0644 \u0627\u0644\u062a\u0642\u0627\u0637 \u0627\u0644\u0634\u0627\u0634\u0629",
      canvasFailed: "\u062a\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0644\u0648\u062d\u0629 \u0627\u0644\u0631\u0633\u0645",
      imageLoadFailed: "\u0641\u0634\u0644 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0635\u0648\u0631\u0629",
      requestFailed: "\u0641\u0634\u0644 \u0637\u0644\u0628 \u0627\u0644\u062e\u062f\u0645\u0629",
      close: "\u0625\u063a\u0644\u0627\u0642", stop: "\u0625\u064a\u0642\u0627\u0641", minimize: "\u062a\u0635\u063a\u064a\u0631", maximize: "\u062a\u0643\u0628\u064a\u0631"
    },
    hi: {
      language: "\u092d\u093e\u0937\u093e",
      model: "\u092e\u0949\u0921\u0932",
      translate: "\u0905\u0928\u0941\u0935\u093e\u0926",
      clear: "\u0938\u093e\u092b\u093c \u0915\u0930\u0947\u0902",
      settings: "\u0938\u0947\u091f\u093f\u0902\u0917\u094d\u0938",
      defaultLanguage: "\u0921\u093f\u092b\u093c\u0949\u0932\u094d\u091f \u092d\u093e\u0937\u093e",
      defaultModel: "\u0921\u093f\u092b\u093c\u0949\u0932\u094d\u091f \u092e\u0949\u0921\u0932",
      captureMode: "\u0915\u0948\u092a\u094d\u091a\u0930 \u092e\u094b\u0921",
      save: "\u0938\u0939\u0947\u091c\u0947\u0902",
      saved: "\u0938\u0939\u0947\u091c\u093e \u0917\u092f\u093e",
      translating: "\u0905\u0928\u0941\u0935\u093e\u0926 \u0939\u094b \u0930\u0939\u093e \u0939\u0948...",
      translateFailed: "\u0905\u0928\u0941\u0935\u093e\u0926 \u0935\u093f\u092b\u0932",
      noText: "\u0905\u0928\u0941\u0935\u093e\u0926 \u092f\u094b\u0917\u094d\u092f \u091f\u0947\u0915\u094d\u0938\u094d\u091f \u0928\u0939\u0940\u0902 \u092e\u093f\u0932\u093e",
      noPageText: "\u092a\u0947\u091c \u091f\u0947\u0915\u094d\u0938\u094d\u091f \u0928\u0939\u0940\u0902 \u092e\u093f\u0932\u093e\u0964 \u0938\u0947\u091f\u093f\u0902\u0917\u094d\u0938 \u092e\u0947\u0902 OCR \u092a\u0930 \u0938\u094d\u0935\u093f\u091a \u0915\u0930\u0947\u0902\u0964",
      screenshotFailed: "\u0938\u094d\u0915\u094d\u0930\u0940\u0928\u0936\u0949\u091f \u0935\u093f\u092b\u0932",
      canvasFailed: "\u0915\u0948\u0928\u0935\u093e\u0938 \u0928\u0939\u0940\u0902 \u092c\u0928\u093e \u0938\u0915\u0947",
      imageLoadFailed: "\u0907\u092e\u0947\u091c \u0932\u094b\u0921 \u0928\u0939\u0940\u0902 \u0939\u094b \u0938\u0915\u0940",
      requestFailed: "\u0938\u0947\u0935\u093e \u0905\u0928\u0941\u0930\u094b\u0927 \u0935\u093f\u092b\u0932",
      close: "\u092c\u0902\u0926 \u0915\u0930\u0947\u0902", stop: "\u0930\u094b\u0915\u0947\u0902", minimize: "\u091b\u094b\u091f\u093e \u0915\u0930\u0947\u0902", maximize: "\u092c\u0921\u093c\u093e \u0915\u0930\u0947\u0902"
    },
  };

  let currentLanguage = DEFAULT_LANGUAGE;

  const root = document.createElement("div");
  root.id = "glass-translate-root";
  root.innerHTML = `
    <div class="glass-window" role="dialog" aria-label="Glass Translate">
      <div class="glass-panel">
        <div class="glass-panel-row">
          <button class="settings-button" type="button" data-i18n="settings"></button>
          <select id="glass-target-language" class="target-language" aria-label="Language">
            ${buildLanguageOptions(DEFAULT_LANGUAGE)}
          </select>
          <select id="glass-capture-mode" class="capture-mode-inline" aria-label="">
            ${buildCaptureModeOptions(DEFAULT_CAPTURE_MODE)}
          </select>
          <button class="translate-button" type="button" title="" aria-label="" data-i18n="translate"></button>
          <button class="clear-button" type="button" data-i18n="clear"></button>
          <span class="window-controls">
          <button class="minimize-button" type="button" title="" aria-label="">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14"></path>
            </svg>
          </button>
          <button class="close-button" type="button" title="" aria-label="">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12"></path>
            </svg>
          </button>
          </span>
          <div class="toolbar-drag-space" aria-hidden="true"></div>
        </div>

        <div class="settings-panel" data-settings-panel hidden>
          <div class="settings-version">Glass Translate v${APP_VERSION}</div>
          <div class="settings-field">
            <label for="glass-default-language" data-i18n="defaultLanguage"></label>
            <select id="glass-default-language" class="default-language">
              ${buildLanguageOptions(DEFAULT_LANGUAGE)}
            </select>
          </div>
          <div class="settings-field" hidden>
            <label for="glass-model" data-i18n="defaultModel"></label>
            <select id="glass-model" class="model-select">
              ${buildModelOptions(DEFAULT_MODEL)}
            </select>
          </div>
          <div class="settings-field">
            <label for="glass-default-mode" data-i18n="defaultMode"></label>
            <select id="glass-default-mode" class="default-mode-select">
              <option value="text" data-i18n="modeText">网页文本</option>
              <option value="ocr" data-i18n="modeOcr">截图翻译</option>
            </select>
          </div>
          <div class="settings-field" hidden>
            <label for="glass-capture-mode" data-i18n="captureMode"></label>
            <select id="glass-capture-mode" class="capture-mode-select">
              ${buildCaptureModeOptions(DEFAULT_CAPTURE_MODE)}
            </select>
          </div>
          <button class="save-settings-button" type="button" data-i18n="save"></button>
        </div>
      </div>

      <div class="status" aria-live="polite"></div>

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

    <div class="status" aria-live="polite"></div>
  `;

  document.documentElement.appendChild(root);

  const glassWindow = root.querySelector(".glass-window");
  const glassArea = root.querySelector("[data-glass-area]");
  const translateButton = root.querySelector(".translate-button");
  const clearButton = root.querySelector(".clear-button");
  const minimizeButton = root.querySelector(".minimize-button");
  let preMinimizeHeight = null;
  const closeButton = root.querySelector(".close-button");
  const settingsButton = root.querySelector(".settings-button");
  const saveSettingsButton = root.querySelector(".save-settings-button");
  const settingsPanel = root.querySelector("[data-settings-panel]");
  const translationLayer = root.querySelector("[data-translation-layer]");
  const status = root.querySelector(".status");
  const targetLanguageInput = root.querySelector(".target-language");
  const defaultLanguageInput = root.querySelector(".default-language");
  const modelInput = root.querySelector(".model-select");
  const defaultModeInput = root.querySelector(".default-mode-select");
  const captureModeInput = root.querySelector(".capture-mode-inline")

  let dragging = false;
  let resizing = null;
  let activePointerId = null;
  let offsetX = 0;
  let offsetY = 0;
  let statusSteps = [];

  applyToolLanguage(DEFAULT_LANGUAGE);
  applyDefaultModel(DEFAULT_MODEL);
  applyCaptureMode(DEFAULT_CAPTURE_MODE);

    // Sync defaultMode select on startup
    if (defaultModeInput) {
      defaultModeInput.value = captureModeInput.value;
    }
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
      if (error.name === "AbortError") {
        streamAbortController = null;
        resetStatusSteps();
        translationLayer.innerHTML = "";
        translationLayer.classList.remove("is-flow");
        glassArea.classList.remove("has-translation");
        status.textContent = "";
        setBusy(false);
        return;
      }
      console.debug("Glass Translate pointer release skipped", error);
    }
  }

  minimizeButton.addEventListener("click", () => {
    if (glassWindow.classList.contains("is-minimized")) {
      glassWindow.classList.remove("is-minimized");
      if (preMinimizeHeight) {
        glassWindow.style.height = `${preMinimizeHeight}px`;
      }
      minimizeButton.querySelector("svg").innerHTML = '<path d="M5 12h14"></path>';
      minimizeButton.title = activeText().minimize || "";
      minimizeButton.setAttribute("aria-label", minimizeButton.title);
    } else {
      preMinimizeHeight = glassWindow.offsetHeight;
      glassWindow.classList.add("is-minimized");
      minimizeButton.querySelector("svg").innerHTML = '<rect x="5" y="5" width="14" height="14" rx="2"></rect>';
      minimizeButton.title = activeText().maximize || "";
      minimizeButton.setAttribute("aria-label", minimizeButton.title);
    }
  });

  closeButton.addEventListener("click", () => {
    root.remove();
    window.__glassTranslateInjected = false;
  });

  clearButton.addEventListener("click", () => {
    // If translation is in progress, abort and reset everything
    if (streamAbortController) {
      streamAbortController.abort();
      streamAbortController = null;
      resetStatusSteps();
      translationLayer.innerHTML = "";
      translationLayer.classList.remove("is-flow");
      glassArea.classList.remove("has-translation");
      status.textContent = "";
      setBusy(false);
      return;
    }
    // Normal clear
    resetStatusSteps();
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

  captureModeInput.addEventListener("change", () => {
    if (defaultModeInput) defaultModeInput.value = captureModeInput.value;
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
      resetStatusSteps();
      setBusy(true);
      showStatusStep("stepPreparing", "preparing");
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
        showStatusStep("stepCapturingImage", "capturingImage");
        const image = await cropGlassArea(await captureVisibleTab());
        showStatusStep("stepSending", "imageReady");
        await requestOcrTranslationStream({
          image,
          targetLanguage: targetLanguageInput.value,
          model: "gpt",
          viewport
        });
        result = null;
      } else {
        showStatusStep("stepReadingText", "readingText");
        const blocks = collectTextBlocksFromGlassArea();
        if (!blocks.length) {
          throw new Error(activeText().noPageText);
        }
        showStatusStep("stepSending", "textReady", { count: blocks.length });
        await requestTextTranslationStream({
          blocks,
          targetLanguage: targetLanguageInput.value,
          model: "deepseek",
          viewport
        });
        result = null; // stream handles rendering
      }

      // Stream completed successfully, clear abort controller
      streamAbortController = null;

      // Stream modes (text and ocr) handle rendering themselves.
      // Only non-streamed results go through the old batch rendering path.
      if (result) {
        showStatusStep("stepRendering", "renderingTranslation");
        if (!result.success) {
          throw new Error(result.message || activeText().translateFailed);
        }
        renderTranslationBlocks(result.blocks || [], captureMode);
        glassArea.classList.toggle("has-translation", Boolean(result.blocks?.length));
        status.textContent = result.blocks?.length ? "" : activeText().noText;
      }
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
    showStatusStep("stepWaiting", "waitingTranslation");
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
    showStatusStep("stepWaiting", "waitingTranslation");
    const response = await responsePromise;

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || `${activeText().requestFailed}: ${response.status}`);
    }

    return data;
  }

  async function requestTextTranslationStream(payload) {
    if (!payload.blocks.length) {
      throw new Error(activeText().noPageText);
    }

    // Clear translation layer BEFORE fetch
    translationLayer.innerHTML = "";
    glassArea.classList.remove("has-translation");

    // Warm up Render.com with 10s timeout
    const warmup = Promise.race([
      fetch(API_HEALTH_URL),
      new Promise((_, reject) => setTimeout(() => reject(new Error("warmup timeout")), 10000))
    ]).catch(() => {});
    await warmup;

    streamAbortController = new AbortController();

    // True chunked: split blocks into small groups, send one at a time
    // Each group translates independently, first results appear in 1-3s
    const GROUP_SIZE = 2;
    const groups = [];
    for (let i = 0; i < payload.blocks.length; i += GROUP_SIZE) {
      groups.push(payload.blocks.slice(i, i + GROUP_SIZE));
    }

    let renderedCount = 0;
    const totalBlocks = payload.blocks.length;

    for (let gi = 0; gi < groups.length; gi++) {
      if (streamAbortController?.signal.aborted) break;

      const groupPayload = {
        blocks: groups[gi],
        targetLanguage: payload.targetLanguage,
        model: payload.model,
        viewport: payload.viewport
      };

      const TIMEOUT_MS = 20000;
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(TEXT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(groupPayload),
          signal: ctrl.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.message || `${activeText().requestFailed}: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data?.blocks)) {
          for (const block of data.blocks) {
            if (streamAbortController?.signal.aborted) break;
            if (block && block.id && block.translatedText) {
              renderTranslationBlock(block, captureModeInput.value);
              glassArea.classList.add("has-translation");
              renderedCount++;
              showStatusStep("stepRendering", "streamProgress", {
                current: renderedCount,
                total: totalBlocks
              });
            }
          }
        }
      } catch (e) {
        clearTimeout(timeoutId);
        if (gi === 0) throw e; // Fail on first group, skip later groups
        console.warn(`Chunk ${gi} failed, continuing:`, e.message);
      }
    }

    status.textContent = renderedCount > 0 ? "" : activeText().noText;
  }

  async function requestOcrTranslationStream(payload) {
    // Clear translation layer BEFORE fetch
    translationLayer.innerHTML = "";
    glassArea.classList.remove("has-translation");

    streamAbortController = new AbortController();
    const response = await fetch(`${API_URL}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: streamAbortController.signal
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || `${activeText().requestFailed}: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let receivedCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (streamAbortController?.signal.aborted) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        const lines = eventBlock.split("\n");
        let eventType = "";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
        }

        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr);

          if (eventType === "start") {
            showStatusStep("stepSending", "streamStarted", { count: parsed.count });
          } else if (eventType === "block") {
            receivedCount++;
            const block = parsed.block;
            if (block && block.id && block.translatedText) {
              renderTranslationBlock(block, "ocr");
              glassArea.classList.add("has-translation");
              showStatusStep("stepRendering", "streamProgress", {
                current: receivedCount,
                total: parsed.totalBlocks
              });
            }
          } else if (eventType === "complete") {
            showStatusStep("stepComplete", "complete");
            status.textContent = receivedCount > 0 ? "" : activeText().noText;
          } else if (eventType === "error") {
            throw new Error(parsed.message || activeText().translateFailed);
          }
        } catch (e) {
          if (e.message !== activeText().translateFailed) {
            console.warn("SSE parse error:", e);
          }
        }
      }
    }
  }

  function warmApi() {
    fetch(API_HEALTH_URL, {
      method: "GET",
      cache: "no-store"
    }).catch(() => {});
  }

  function collectTextBlocksFromGlassArea() {
    const glassRect = glassArea.getBoundingClientRect();
    const searchRect = {
      left: glassRect.left - 40,
      top: glassRect.top - 40,
      right: glassRect.right + 40,
      bottom: glassRect.bottom + 40
    };

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Fast path: quick text/content check first
          const text = node.nodeValue;
          if (!text || text.trim().length <= 1) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || root.contains(parent)) return NodeFilter.FILTER_REJECT;
          if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const rawBlocks = [];
    let index = 1;
    let node = walker.nextNode();

    while (node) {
      const parent = node.parentElement;
      // Moved getComputedStyle here from acceptNode - only called for accepted nodes
      const style = window.getComputedStyle(parent);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) {
        node = walker.nextNode();
        continue;
      }

      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      range.detach();

      if (rect.width > 0 && rect.height > 0 && intersects(rect, searchRect)) {
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

    if (verticalGap >= Math.max(8, lineHeight * TEXT_PARAGRAPH_GAP_RATIO)) return "\n\n";
    return "\n";
  }

  function renderTranslationBlock(block, mode = "ocr") {
    if (!block || !block.id) return;

    // Map upstream ids (ext_N, block_N, etc.) to local text_N format
    const idMatch = block.id.match(/^(?:ext|block|text)_(\d+)$/);
    if (idMatch) {
      block.id = `text_${idMatch[1]}`;
    }

    // Reuse existing element or create new
    let el = translationLayer.querySelector(`[data-block-id="${block.id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.dataset.blockId = block.id;
      translationLayer.appendChild(el);

      if (mode === "text") {
        el.className = "translation-block translation-block-flow";
        translationLayer.classList.add("is-flow");
        translationLayer.style.padding = "22px 26px";
      } else {
        el.className = "translation-block";
        translationLayer.classList.remove("is-flow");
        translationLayer.style.padding = "";
      }
    }

    el.textContent = block.translatedText || "";

    // Only apply positioning for OCR mode (text mode uses flow layout)
    if (mode !== "text") {
      const layerWidth = Math.max(0, glassArea.clientWidth - TRANSLATION_PADDING * 2);
      const layerHeight = Math.max(0, glassArea.clientHeight - TRANSLATION_PADDING * 2);
      const left = clamp(toNumber(block.x, 0), 0, layerWidth);
      const top = clamp(toNumber(block.y, 0), 0, layerHeight);
      const maxWidth = top < TRANSLATE_BUTTON_SAFE_HEIGHT
        ? Math.max(24, layerWidth - left - TRANSLATE_BUTTON_SAFE_WIDTH)
        : Math.max(24, layerWidth - left);
      const width = clamp(toNumber(block.width, 120), 24, maxWidth);

      Object.assign(el.style, {
        left: `${TRANSLATION_PADDING + left}px`,
        top: `${TRANSLATION_PADDING + top}px`,
        width: `${width}px`,
        minHeight: `${Math.max(toNumber(block.height, 24), 18)}px`,
        fontSize: `${clamp(toNumber(block.fontSize, 16), 8, 24)}px`,
        lineHeight: `${clamp(toNumber(block.lineHeight, 22), 12, 64)}px`,
        textAlign: normalizeAlign(block.align)
      });
    } else {
      // Flow mode: position by order
      const indent = clamp(toNumber(block.x, 0), 0, Math.min(TEXT_FLOW_MAX_INDENT, glassArea.clientWidth * 0.22));
      el.style.fontSize = `${clamp(toNumber(block.fontSize, 16), 8, 15)}px`;
      el.style.lineHeight = "1.55";
      el.style.marginLeft = `${indent}px`;
      el.style.maxWidth = `calc(100% - ${indent}px)`;
    }
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
        fontSize: `${clamp(toNumber(block.fontSize, 16), 8, 24)}px`,
        lineHeight: `${clamp(toNumber(block.lineHeight, 22), 12, 64)}px`,
        textAlign: normalizeAlign(block.align)
      });

      translationLayer.appendChild(el);
    }
  }

  function renderFlowTranslationBlocks(blocks) {
    translationLayer.classList.add("is-flow");
    translationLayer.style.padding = "22px 26px";
    const visibleBlocks = (Array.isArray(blocks) ? blocks : [])
      .filter((block) => isMeaningfulText(block?.translatedText || block?.sourceText))
      .sort((a, b) => toNumber(a.y, 0) - toNumber(b.y, 0) || toNumber(a.x, 0) - toNumber(b.x, 0));

    for (const block of visibleBlocks) {
      const el = document.createElement("div");
      el.className = "translation-block translation-block-flow";
      el.textContent = block.translatedText || "";
      const indent = clamp(toNumber(block.x, 0), 0, Math.min(TEXT_FLOW_MAX_INDENT, glassArea.clientWidth * 0.22));
      el.style.fontSize = `${clamp(toNumber(block.fontSize, 16), 8, 15)}px`;
      el.style.lineHeight = "1.55";
      el.style.marginLeft = `${indent}px`;
      el.style.maxWidth = `calc(100% - ${indent}px)`;
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
    // Toggle clear button to "stop" during translation, "clear" otherwise
    if (isBusy) {
      clearButton.setAttribute("data-i18n", "stop");
      clearButton.classList.add("is-stop");
    } else {
      clearButton.setAttribute("data-i18n", "clear");
      clearButton.classList.remove("is-stop");
    }
    clearButton.textContent = activeText()[clearButton.dataset.i18n] || clearButton.textContent;
  }

  async function loadDefaults() {
    const defaultLanguage = await getStoredValue(DEFAULT_LANGUAGE_STORAGE_KEY);
    const defaultModel = await getStoredValue(DEFAULT_MODEL_STORAGE_KEY);
    const defaultMode = await getStoredValue(DEFAULT_MODE_STORAGE_KEY);
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
      element.textContent = copy[element.dataset.i18n] || element.textContent || "";
    });

    translateButton.title = copy.translate;
    translateButton.setAttribute("aria-label", copy.translate);
    closeButton.title = copy.close;
    closeButton.setAttribute("aria-label", copy.close);
    if (minimizeButton) { let key = glassWindow.classList.contains("is-minimized") ? "maximize" : "minimize"; minimizeButton.title = copy[key] || ""; minimizeButton.setAttribute("aria-label", copy[key] || ""); }
    
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

  function resetStatusSteps() {
    statusSteps = [];
  }

  function showStatusStep(stepKey, detailKey, values = {}) {
    const label = statusText(stepKey);
    if (!statusSteps.includes(label)) {
      statusSteps.push(label);
    }

    const trail = statusSteps
      .map((step, index) => index === statusSteps.length - 1 ? `> ${step}` : step)
      .join(" / ");
    status.textContent = `${trail} - ${statusText(detailKey, values)}`;
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
    const m = allowedModes.has(mode) ? mode : DEFAULT_CAPTURE_MODE;
    captureModeInput.value = m;
    if (defaultModeInput) defaultModeInput.value = m;
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
    if (SKIPPABLE_TAGS.has(tagName)) return true;
    if (element.hasAttribute("aria-hidden") && element.getAttribute("aria-hidden") === "true") return true;
    // Only walk up to 6 ancestors for structural skip (nav/header/footer)
    let p = element;
    for (let i = 0; i < 6 && p; i++) {
      const t = p.tagName?.toLowerCase();
      if (t === "nav" || t === "header" || t === "footer") return true;
      if (p.hasAttribute?.("role") && p.getAttribute("role") === "button") return true;
      p = p.parentElement;
    }
    return false;
  }

  function isMeaningfulText(text) {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    if (normalized.length <= 1) return false;
    if (MEANINGFUL_TEXT_RE.test(normalized)) return false;
    if (USERNAME_RE.test(normalized)) return false;
    if (TIME_AGO_RE.test(normalized)) return false;
    if (UI_FILTER_RE.test(normalized)) return false;
    return !MEANINGFUL_UI_SET.has(normalized.toLowerCase());
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
