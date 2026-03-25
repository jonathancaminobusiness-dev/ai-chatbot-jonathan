require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const Database = require('better-sqlite3');
const path = require('path');
const { SYSTEM_PROMPT } = require('./system-prompt');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('WARNING: ANTHROPIC_API_KEY not found in environment variables!');
}
const anthropic = new Anthropic({ apiKey });

// --- SQLite Database for persistent memory ---
const dbPath = process.env.DB_PATH || path.join(__dirname, 'juma.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_client_id ON conversations(client_id);

  CREATE TABLE IF NOT EXISTS client_memory (
    client_id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const stmtInsertMsg = db.prepare(
  'INSERT INTO conversations (client_id, role, content) VALUES (?, ?, ?)'
);
const stmtGetHistory = db.prepare(
  'SELECT role, content FROM conversations WHERE client_id = ? ORDER BY created_at ASC'
);
const stmtGetRecent = db.prepare(
  'SELECT role, content FROM conversations WHERE client_id = ? ORDER BY created_at DESC LIMIT 20'
);
const stmtGetMemory = db.prepare(
  'SELECT summary FROM client_memory WHERE client_id = ?'
);
const stmtUpsertMemory = db.prepare(`
  INSERT INTO client_memory (client_id, summary, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(client_id) DO UPDATE SET summary = ?, updated_at = CURRENT_TIMESTAMP
`);
const stmtCountMsgs = db.prepare(
  'SELECT COUNT(*) as count FROM conversations WHERE client_id = ?'
);

// Load conversation history for a client
function getClientMessages(clientId) {
  return stmtGetHistory.all(clientId).map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

// Save a message to the database
function saveMessage(clientId, role, content) {
  stmtInsertMsg.run(clientId, role, content);
}

// Generate a summary of the conversation (runs every 10 messages)
async function updateClientMemory(clientId) {
  const msgCount = stmtCountMsgs.get(clientId).count;
  if (msgCount > 0 && msgCount % 10 === 0) {
    const recent = stmtGetRecent.all(clientId).reverse();
    const convo = recent
      .map((m) => `${m.role === 'user' ? 'Cliente' : 'Juma'}: ${m.content}`)
      .join('\n');

    try {
      const result = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: 'Resuma em 2-3 frases os pontos principais sobre este cliente: o que ele faz, quais problemas tem, e em que etapa da conversa está. Apenas fatos, sem opinião.',
        messages: [{ role: 'user', content: convo }],
      });
      const summary = result.content[0].text;
      stmtUpsertMemory.run(clientId, summary, summary);
    } catch (err) {
      console.error('Error updating memory:', err.message);
    }
  }
}

// Build system prompt with client memory
function buildSystemPrompt(clientId) {
  const memory = stmtGetMemory.get(clientId);
  if (memory) {
    return `${SYSTEM_PROMPT}\n\nMEMÓRIA SOBRE ESTE CLIENTE (de conversas anteriores):\n${memory.summary}\nUse essa informação para continuar a conversa de forma natural, sem repetir perguntas que já foram respondidas.`;
  }
  return SYSTEM_PROMPT;
}

// --- Webhook endpoint ---
app.post('/webhook/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    // Save user message
    saveMessage(sessionId, 'user', message);

    // Load full conversation history
    const messages = getClientMessages(sessionId);

    // Build prompt with memory context
    const systemPrompt = buildSystemPrompt(sessionId);

    // Call Claude
    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: messages,
    });

    let assistantMessage = completion.content[0].text;

    // Save assistant response
    saveMessage(sessionId, 'assistant', assistantMessage);

    // Update memory summary in background
    updateClientMemory(sessionId);

    // Split into multiple messages and replace WhatsApp placeholder
    const whatsappButton = '<a href="https://wa.me/5521974749532" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:4px;">💬 Falar no WhatsApp</a>';
    const parts = assistantMessage
      .split('[BREAK]')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => p.replace(/\[WHATSAPP_BUTTON\]/g, whatsappButton));

    res.json({ messages: parts });
  } catch (error) {
    console.error('Error:', error.message, error.status, error.error);
    res.status(500).json({ error: 'Erro interno do servidor', detail: error.message });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Juma chatbot running at http://localhost:${PORT}`);
});
