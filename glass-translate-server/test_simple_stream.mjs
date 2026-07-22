import http from 'http';

const payload = JSON.stringify({
  blocks: [{
    id: "text_1",
    sourceText: "여보세요",
    x: 0, y: 0, width: 100, height: 20,
    fontSize: 14, lineHeight: 20, align: "left"
  }],
  targetLanguage: "Chinese",
  model: "deepseek",
  viewport: { width: 800, height: 600 }
});

const opts = {
  hostname: 'glass-translate-api.onrender.com',
  path: '/api/translate-text/stream',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(opts, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk.toString();
    // Show each SSE event as it arrives
    const lines = data.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.block) {
            console.log('BLOCK id:', parsed.block.id, 'text:', parsed.block.translatedText);
          }
        } catch(e) {}
      }
    }
  });
  res.on('end', () => console.log('=== DONE ==='));
});

req.write(payload);
req.end();
