require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const { SYSTEM_PROMPT } = require('./system-prompt');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- Conversation Memory (equivalent to n8n Memory node) ---
const conversationMemory = new Map();
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

function getSession(sessionId) {
  const session = conversationMemory.get(sessionId);
  if (session) {
    session.lastAccess = Date.now();
    return session.messages;
  }
  const messages = [];
  conversationMemory.set(sessionId, { messages, lastAccess: Date.now() });
  return messages;
}

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of conversationMemory) {
    if (now - session.lastAccess > SESSION_TTL) {
      conversationMemory.delete(id);
    }
  }
}, 10 * 60 * 1000);

// --- Webhook endpoint (equivalent to n8n Webhook node) ---
app.post('/webhook/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    // Load conversation memory
    const messages = getSession(sessionId);

    // Add user message to memory
    messages.push({ role: 'user', content: message });

    // Call AI Agent (Claude Haiku)
    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    let assistantMessage = completion.content[0].text;

    // Store original in memory (without HTML)
    messages.push({ role: 'assistant', content: assistantMessage });

    // Split into multiple messages and replace WhatsApp placeholder
    const whatsappButton = '<a href="https://wa.me/5521974749532" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:4px;">💬 Falar no WhatsApp</a>';
    const parts = assistantMessage
      .split('[BREAK]')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => p.replace(/\[WHATSAPP_BUTTON\]/g, whatsappButton));

    // Return array of messages
    res.json({ messages: parts });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Juma chatbot running at http://localhost:${PORT}`);
});
