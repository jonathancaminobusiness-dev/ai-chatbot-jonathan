import React, { useState, useRef, useEffect } from 'react';
import { BotMessageSquare, Send, X, Bot } from 'lucide-react';
import { motion } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';

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
  const { language, t } = useLanguage();
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
    if (isOpen && window.innerWidth > 768) {
      inputRef.current?.focus();
    }
  }, [isOpen, greeted]);

  useEffect(() => {
    if (isOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  async function fetchGreeting() {
    setLoading(true);
    try {
      const res = await fetch(WEBHOOK_URL.replace('/chat', '/greeting'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.current, language }),
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
        { type: 'bot', text: t.chat.greeting1 },
        { type: 'bot', text: t.chat.greeting2 },
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
        body: JSON.stringify({ sessionId: sessionId.current, message: text, language }),
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
          { type: 'bot', text: t.chat.error1 },
        ]);
      }
    } catch (err) {
      console.error('JumaChat error:', err);
      setMessages((prev) => [
        ...prev,
        { type: 'bot', text: t.chat.error2 },
      ]);
    }

    setLoading(false);
    if (window.innerWidth > 768) {
      inputRef.current?.focus();
    }
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
          className="fixed bottom-6 right-6 w-14 h-14 md:w-16 md:h-16 rounded-full bg-primary-container text-white flex items-center justify-center z-[99999] shadow-lg shadow-primary-container/40 hover:scale-105 active:scale-95 transition-all"
          aria-label="Abrir chat"
        >
          <BotMessageSquare size={28} />
        </button>
      )}

      {isOpen && (
        <div className="fixed top-0 left-0 w-full h-[100dvh] md:top-auto md:left-auto md:bottom-6 md:right-6 md:w-[380px] md:h-[600px] md:max-h-[80vh] bg-surface-container-lowest md:rounded-2xl shadow-2xl z-[99999] flex flex-col overflow-hidden border border-outline-variant/20 animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-8 duration-300">
          {/* Header */}
          <div className="bg-surface-container-high p-4 flex items-center justify-between border-b border-outline-variant/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-white shadow-sm">
                <Bot size={20} />
              </div>
              <div>
                <div className="text-on-surface font-bold text-sm">Juma</div>
                <div className="text-on-surface-variant text-xs">{t.chat.assistant}</div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low rounded-full transition-colors"
              aria-label="Fechar chat"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages Area with Futuristic Background */}
          <div className="flex-1 relative overflow-hidden bg-surface flex flex-col">
            {/* Animated Background */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden flex items-center justify-center">
              {/* Grid */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]"></div>

              {/* Glowing Orbs */}
              <motion.div
                animate={{ y: [0, -30, 0], x: [0, 20, 0], scale: [1, 1.1, 1], rotate: [0, 90, 0] }}
                transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-[10%] -left-[20%] w-[70%] h-[50%] bg-primary/10 rounded-full blur-[60px]"
              />
              <motion.div
                animate={{ y: [0, 30, 0], x: [0, -20, 0], scale: [1, 1.2, 1], rotate: [0, -90, 0] }}
                transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                className="absolute bottom-[10%] -right-[20%] w-[60%] h-[60%] bg-primary-container/10 rounded-full blur-[60px]"
              />

              {/* Scanning Line */}
              <motion.div
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent shadow-[0_0_10px_rgba(var(--color-primary),0.3)]"
              />
            </div>

            {/* Messages Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 z-10 relative">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`px-4 py-2.5 max-w-[85%] text-sm leading-relaxed shadow-sm relative ${
                    msg.type === 'user'
                      ? 'self-end bg-primary-container text-white rounded-2xl rounded-tr-sm'
                      : 'self-start bg-surface-container-high/90 backdrop-blur-sm text-on-surface rounded-2xl rounded-tl-sm border border-outline-variant/10'
                  }`}
                >
                  {renderText(msg.text)}
                </div>
              ))}
              {loading && (
                <div className="self-start bg-surface-container-high/90 backdrop-blur-sm text-on-surface-variant px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm flex items-center gap-1.5 border border-outline-variant/10 relative">
                  <span className="w-1.5 h-1.5 bg-on-surface-variant/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-on-surface-variant/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-on-surface-variant/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-surface-container-lowest border-t border-outline-variant/20 flex gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.chat.placeholder}
              className="flex-1 bg-surface-container-high text-on-surface px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-container/50 transition-all placeholder:text-on-surface-variant/50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-12 h-12 rounded-xl bg-primary-container text-white flex items-center justify-center hover:bg-primary transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Enviar mensagem"
            >
              <Send size={20} className="ml-0.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
