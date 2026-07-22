// Simulate frontend SSE parsing with actual network response
const response = await fetch("https://glass-translate-api.onrender.com/api/translate-text/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    blocks: [
      { id: "text_1", sourceText: "안녕하세요, 오늘 날씨가 좋네요." },
      { id: "text_2", sourceText: "이건 정말 재미있는 영화네요." }
    ],
    targetLanguage: "Chinese",
    model: "deepseek",
    viewport: { width: 800, height: 600 }
  })
});

console.log("Status:", response.status);
console.log("Headers:", [...response.headers.entries()]);

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let eventCount = 0;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  
  // Same parsing as frontend
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
    eventCount++;
    const parsed = JSON.parse(dataStr);
    
    if (eventType === "start") {
      console.log(`-> START: count=${parsed.count}`);
    } else if (eventType === "block") {
      console.log(`-> BLOCK: id=${parsed.block.id} text="${parsed.block.translatedText?.substring(0, 50)}"`);
    } else if (eventType === "complete") {
      console.log(`-> COMPLETE: ${parsed.blocksCount} blocks`);
    } else if (eventType === "error") {
      console.log(`-> ERROR: ${parsed.message}`);
    }
  }
}

console.log(`\nTotal events received: ${eventCount}`);
