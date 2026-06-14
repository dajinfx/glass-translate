# Glass Translate

Chrome extension plus local backend for a glass-like translation window.

## Folders

- `glass-translate-extension`: Chrome Manifest V3 extension.
- `glass-translate-server`: Express API server that calls AI vision models.

## Quick Start

1. Start the backend:

```bash
cd glass-translate-server
npm install
copy .env.example .env
npm run dev
```

2. Add your system model key to `glass-translate-server/.env`.

3. Load the extension:

- Open `chrome://extensions/`
- Enable Developer mode
- Click Load unpacked
- Select `glass-translate-extension`

4. Open a webpage, image, or PDF in Chrome, click the extension icon, move the glass window over text, then click the red translate button.
