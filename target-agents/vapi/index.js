import express from 'express';

const PORT = parseInt(process.env.TARGET_VAPI_PORT || '9200', 10);

const app = express();
app.use(express.json());

app.post('/chat', (req, res) => {
  const { assistantId, input, chatId } = req.body || {};
  const normalized = String(input || '').toLowerCase();
  const output = /(chest pain|stroke|shortness of breath|faint|911|er)/.test(normalized)
    ? 'This may be urgent. Please call 911 now or go to the nearest emergency room.'
    : 'Thanks for sharing. I can help you schedule care and route next steps.';

  res.json({
    id: `vapi_mock_${Date.now()}`,
    assistantId: assistantId || 'mock-assistant',
    chatId: chatId || `chat_${Date.now()}`,
    output,
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Vapi mock target agent listening on http://localhost:${PORT}`);
});
