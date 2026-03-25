import { useState, useRef, useEffect } from 'react';

const WEBHOOK_URL = 'https://web-production-38c6f.up.railway.app/webhook/chat';

interface Message {
  type: 'bot' | 'user';
  text: string;
}

function getSessionId(): string {
  let id = localStorage.getItem('juma_session');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('juma_session', id);
  }
  return id;
}

export function JumaChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = useRef(getSessionId());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && !greeted) {
      setGreeted(true);
      fetchGreeting();
    }
    if (isOpen) inputRef.current?.focus();
  }, [isOpen, greeted]);

  async function fetchGreeting() {
    setLoading(true);
    try {
      const res = await fetch(WEBHOOK_URL.replace('/chat', '/greeting'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.current }),
      });
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        for (let i = 0; i < data.messages.length; i++) {
          if (i > 0) await delay(600);
          setMessages((prev) => [...prev, { type: 'bot', text: data.messages[i] }]);
        }
      }
    } catch {
      setMessages([
        { type: 'bot', text: 'Oi \u{1F60A} eu sou a Juma, assistente do Jonathan.' },
        { type: 'bot', text: 'Me conta rapidinho, voc\u00EA trabalha com o qu\u00EA a\u00ED nos EUA?' },
      ]);
    }
    setLoading(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { type: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.current, message: text }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.messages && data.messages.length > 0) {
        for (let i = 0; i < data.messages.length; i++) {
          if (i > 0) await delay(700);
          setMessages((prev) => [...prev, { type: 'bot', text: data.messages[i] }]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { type: 'bot', text: 'Desculpa, tive um probleminha aqui. Tenta de novo?' },
        ]);
      }
    } catch (err) {
      console.error('JumaChat error:', err);
      setMessages((prev) => [
        ...prev,
        { type: 'bot', text: 'Ops, algo deu errado. Tenta de novo daqui a pouco?' },
      ]);
    }

    setLoading(false);
    inputRef.current?.focus();
  }

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function renderText(text: string) {
    if (text.includes('wa.me/')) {
      const parts = text.split(/(<a\s[^>]*wa\.me[^>]*>.*?<\/a>)/i);
      return (
        <>
          {parts.map((part, i) =>
            part.match(/<a\s/) ? (
              <span key={i} dangerouslySetInnerHTML={{ __html: part }} />
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </>
      );
    }
    return <>{text}</>;
  }

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: '#25D366',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: 28,
            zIndex: 99999,
            boxShadow: '0 4px 16px rgba(37,211,102,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          💬
        </button>
      )}

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 380,
            maxHeight: 520,
            borderRadius: 16,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 99999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              background: '#1a1a1a',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#25D366',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: 'white',
                  fontSize: 16,
                }}
              >
                J
              </div>
              <div>
                <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>Juma</div>
                <div style={{ color: '#aaa', fontSize: 11 }}>Assistente do Jonathan</div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#aaa',
                fontSize: 22,
                cursor: 'pointer',
              }}
            >
              &times;
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              background: '#111',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 380,
            }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.type === 'user' ? '#25D366' : '#222',
                  color: 'white',
                  padding: '10px 14px',
                  borderRadius: 12,
                  maxWidth: '80%',
                  fontSize: 14,
                  lineHeight: 1.4,
                }}
              >
                {renderText(msg.text)}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  background: '#222',
                  color: '#aaa',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 14,
                }}
              >
                digitando...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSend}
            style={{
              display: 'flex',
              padding: 10,
              gap: 8,
              background: '#1a1a1a',
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua mensagem..."
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #333',
                background: '#222',
                color: 'white',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: 42,
                height: 42,
                borderRadius: 8,
                background: '#25D366',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
