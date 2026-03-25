require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@libsql/client');
const path = require('path');
const { SYSTEM_PROMPT } = require('./system-prompt');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) console.error('WARNING: ANTHROPIC_API_KEY not set!');
const anthropic = new Anthropic({ apiKey });

// --- Turso Database ---
const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDb() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_client_id ON conversations(client_id)`,
    `CREATE TABLE IF NOT EXISTS client_memory (
      client_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS learnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      insight TEXT NOT NULL,
      source_client TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ]);
  await seedLearnings();
  console.log('Database initialized');
}

// --- Seed initial learnings ---
async function seedLearnings() {
  const { rows } = await db.execute('SELECT COUNT(*) as count FROM learnings');
  if (rows[0].count === 0) {
    const seeds = [
      { type: 'EFICAZ', insight: 'Perguntar "como você consegue seus clientes hoje?" no início abriu espaço para identificar a limitação (só indicação) e criar urgência natural' },
      { type: 'EFICAZ', insight: 'Usar a palavra "grana na mesa" ressoou com o cliente e o fez reconhecer o problema sem parecer confrontação' },
      { type: 'EFICAZ', insight: 'Validar a fonte atual de clientes ("Indicação é sempre ouro") antes de questionar a limitação gera abertura ao invés de resistência' },
      { type: 'MELHORAR', insight: 'Quando o cliente disse "ainda não" pensou em alcançar MCs, Juma poderia ter perguntado "por que nunca tentou?" antes de assumir que era falta de conhecimento sobre a solução' },
      { type: 'MELHORAR', insight: 'Evitar fazer duas perguntas na mesma mensagem - "você tá deixando grana na mesa?" + "como você faz?" dispersa a atenção do cliente' },
      { type: 'OBJEÇÃO', insight: 'Quando o cliente diz "só recebo indicação, não busco", não insistir na mesma pergunta de forma diferente - o cliente já foi claro e repetir cria frustração' },
    ];
    for (const s of seeds) {
      await db.execute({
        sql: 'INSERT INTO learnings (type, insight, source_client) VALUES (?, ?, ?)',
        args: [s.type, s.insight, 'seed'],
      });
    }
    console.log('Seeded 6 initial learnings');
  }
}

// --- DB helpers ---
async function saveMessage(clientId, role, content) {
  await db.execute({
    sql: 'INSERT INTO conversations (client_id, role, content) VALUES (?, ?, ?)',
    args: [clientId, role, content],
  });
}

async function getClientMessages(clientId) {
  const { rows } = await db.execute({
    sql: 'SELECT role, content FROM conversations WHERE client_id = ? ORDER BY created_at ASC',
    args: [clientId],
  });
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

async function getClientMemory(clientId) {
  const { rows } = await db.execute({
    sql: 'SELECT summary FROM client_memory WHERE client_id = ?',
    args: [clientId],
  });
  return rows.length > 0 ? rows[0].summary : null;
}

async function countUserMsgs(clientId) {
  const { rows } = await db.execute({
    sql: "SELECT COUNT(*) as count FROM conversations WHERE client_id = ? AND role = 'user'",
    args: [clientId],
  });
  return Number(rows[0].count);
}

// --- Client Memory ---
async function updateClientMemory(clientId) {
  const count = await countUserMsgs(clientId);
  if (count < 1) return;

  const { rows } = await db.execute({
    sql: 'SELECT role, content FROM conversations WHERE client_id = ? ORDER BY created_at DESC LIMIT 20',
    args: [clientId],
  });
  const convo = rows
    .reverse()
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'Juma'}: ${m.content}`)
    .join('\n');

  try {
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'Resuma em 2-3 frases curtas os pontos principais sobre este cliente: nome (se disse), o que ele faz, como consegue clientes, quais problemas tem, e em que etapa da conversa está. Apenas fatos, sem opinião.',
      messages: [{ role: 'user', content: convo }],
    });
    const summary = result.content[0].text;
    await db.execute({
      sql: `INSERT INTO client_memory (client_id, summary, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(client_id) DO UPDATE SET summary = ?, updated_at = CURRENT_TIMESTAMP`,
      args: [clientId, summary, summary],
    });
  } catch (err) {
    console.error('Error updating memory:', err.message);
  }
}

// --- Self-Learning ---
async function analyzeConversation(clientId) {
  const count = await countUserMsgs(clientId);
  if (count < 4 || count % 4 !== 0) return;

  const { rows } = await db.execute({
    sql: 'SELECT role, content FROM conversations WHERE client_id = ? ORDER BY created_at DESC LIMIT 20',
    args: [clientId],
  });
  const convo = rows
    .reverse()
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'Juma'}: ${m.content}`)
    .join('\n');

  try {
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `Você é um analista de conversas de vendas. Analise esta conversa entre Juma (assistente de vendas) e um cliente.

Identifique de 1 a 3 aprendizados práticos. Foque em:
- Perguntas que funcionaram bem ou mal
- Objeções do cliente e como foram tratadas
- Momentos onde a conversa travou ou fluiu
- O que poderia ser melhorado na próxima vez

Responda APENAS com os aprendizados, um por linha, no formato:
TIPO: aprendizado

Tipos possíveis: EFICAZ (algo que funcionou), MELHORAR (algo que pode melhorar), OBJEÇÃO (objeção comum e como lidar)`,
      messages: [{ role: 'user', content: convo }],
    });

    const lines = result.content[0].text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) {
      const match = line.match(/^(EFICAZ|MELHORAR|OBJEÇÃO):\s*(.+)/i);
      if (match) {
        await db.execute({
          sql: 'INSERT INTO learnings (type, insight, source_client) VALUES (?, ?, ?)',
          args: [match[1].toUpperCase(), match[2], clientId],
        });
      }
    }
    console.log(`Learned ${lines.length} insights from client ${clientId}`);
  } catch (err) {
    console.error('Error analyzing conversation:', err.message);
  }
}

// --- Build System Prompt ---
async function buildSystemPrompt(clientId) {
  let prompt = SYSTEM_PROMPT;

  const memory = await getClientMemory(clientId);
  if (memory) {
    prompt += `\n\nMEMÓRIA SOBRE ESTE CLIENTE (de conversas anteriores):\n${memory}\nUse essa informação para continuar de forma natural, sem repetir perguntas já respondidas.`;
  }

  const { rows } = await db.execute('SELECT DISTINCT insight FROM learnings ORDER BY created_at DESC LIMIT 15');
  if (rows.length > 0) {
    const learningText = rows.map((l) => `- ${l.insight}`).join('\n');
    prompt += `\n\nAPRENDIZADOS DE CONVERSAS ANTERIORES (aplique esses aprendizados):\n${learningText}`;
  }

  return prompt;
}

// --- Greeting endpoint ---
app.post('/webhook/greeting', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const memory = await getClientMemory(sessionId);
    const userMsgCount = await countUserMsgs(sessionId);

    if (memory && userMsgCount > 0) {
      const result = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: 'Você é Juma, assistente do Jonathan. Um cliente que já conversou com você antes está voltando. Gere uma saudação curta e calorosa mostrando que você lembra dele. Use [BREAK] para separar mensagens curtas. Texto puro, sem markdown.',
        messages: [{ role: 'user', content: `Informações sobre este cliente: ${memory}. Gere a saudação.` }],
      });

      const parts = result.content[0].text.split('[BREAK]').map((p) => p.trim()).filter((p) => p.length > 0);
      res.json({ returning: true, messages: parts });
    } else {
      res.json({
        returning: false,
        messages: ['Oi 😊 eu sou a Juma, assistente do Jonathan.', 'Me conta rapidinho, você trabalha com o quê?'],
      });
    }
  } catch (error) {
    console.error('Greeting error:', error.message);
    res.json({
      returning: false,
      messages: ['Oi 😊 eu sou a Juma, assistente do Jonathan.', 'Me conta rapidinho, você trabalha com o quê?'],
    });
  }
});

// --- Chat endpoint ---
app.post('/webhook/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) return res.status(400).json({ error: 'sessionId and message are required' });

    await saveMessage(sessionId, 'user', message);
    const messages = await getClientMessages(sessionId);
    const systemPrompt = await buildSystemPrompt(sessionId);

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: messages,
    });

    let assistantMessage = completion.content[0].text;
    await saveMessage(sessionId, 'assistant', assistantMessage);
    await updateClientMemory(sessionId);

    // Analyze in background
    analyzeConversation(sessionId);

    const whatsappButton = '<a href="https://wa.me/5521974749532" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:4px;">💬 Falar no WhatsApp</a>';
    const parts = assistantMessage
      .split('[BREAK]')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => p.replace(/\[WHATSAPP_BUTTON\]/g, whatsappButton));

    res.json({ messages: parts });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor', detail: error.message });
  }
});

// --- Admin ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/learnings', async (req, res) => {
  const { rows } = await db.execute('SELECT * FROM learnings ORDER BY created_at DESC');
  res.json({ total: rows.length, learnings: rows });
});

// --- Start ---
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Juma chatbot running at http://localhost:${PORT}`);
  });
});
