import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';

const rootEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: rootEnvPath });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.TARGET_OPENAI_MODEL || 'gpt-4o-mini';
const PORT = parseInt(process.env.TARGET_AGENT_PORT || '9100', 10);
const MODE = process.env.TARGET_OPENAI_MODE || (OPENAI_API_KEY ? 'proxy' : 'mock');

if (MODE === 'proxy' && !OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required. Set it in .env at repo root.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are Robin, a healthcare coordination voice assistant for Wellness Alliance Medical Group. Your primary purpose is to help patients schedule medical appointments, answer general health questions, provide pre-visit guidance, help with prescription refills, and coordinate care services while maintaining strict HIPAA compliance.

Be compassionate, patient, and reassuring. Project a professional yet approachable demeanor. Maintain a calm, clear tone even when discussing sensitive health matters.

Start conversations with: "Thank you for calling Wellness Alliance Medical Group. This is Robin, your healthcare coordinator. How may I help you today?"

For urgent medical situations, identify emergencies immediately and direct patients to call 911 or go to the ER. For appointments, match the provider to the patient's need and offer scheduling options. For prescriptions, verify medication details and explain the refill process.

Always maintain HIPAA compliance. Never provide medical diagnoses. When in doubt, recommend the patient speak with their provider directly.`;

const app = express();
app.use(express.json());

app.post('/chat/completions', async (req, res) => {
  const { messages = [], model, temperature, max_tokens, stream } = req.body;

  if (stream) {
    return res.status(400).json({ error: { message: 'Streaming not supported by this target agent' } });
  }

  if (MODE === 'mock') {
    const lastUserMessage = [...messages].reverse().find((m) => m?.role === 'user')?.content || '';
    const text = String(lastUserMessage).toLowerCase();
    const responseText = /(chest pain|stroke|shortness of breath|faint|911|er)/.test(text)
      ? 'Those symptoms may be urgent. Please call 911 now or go to the nearest ER.'
      : 'Thanks for sharing. I can help coordinate next steps and recommend speaking with your clinician.';

    return res.json({
      id: `chatcmpl_mock_${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'mock-healthcare-agent',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: responseText },
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    });
  }

  // Prepend system prompt if not already present
  const hasSystemMsg = messages.some((m) => m.role === 'system');
  const fullMessages = hasSystemMsg ? messages : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  const upstreamRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: fullMessages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1024,
    }),
  });

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text();
    return res.status(upstreamRes.status).json({ error: { message: errText } });
  }

  const data = await upstreamRes.json();
  return res.json(data);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: MODEL });
});

app.listen(PORT, () => {
  console.log(`OpenAI-compatible target agent running on http://localhost:${PORT}`);
  console.log(`  Mode: ${MODE}`);
  console.log(`  Model: ${MODEL}`);
  if (MODE === 'proxy') console.log(`  Upstream: ${OPENAI_BASE_URL}`);
  console.log(`  POST /chat/completions — proxy with Robin system prompt`);
  console.log(`  GET  /health — health check`);
});
