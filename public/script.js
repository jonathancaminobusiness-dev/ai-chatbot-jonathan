(() => {
  const chatToggle = document.getElementById('chat-toggle');
  const chatWindow = document.getElementById('chat-window');
  const chatClose = document.getElementById('chat-close');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
  const chatSend = document.getElementById('chat-send');

  // Generate unique session ID per visitor
  let sessionId = localStorage.getItem('juma_session');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('juma_session', sessionId);
  }

  let isOpen = false;
  let greeted = false;

  // Toggle chat
  chatToggle.addEventListener('click', () => {
    isOpen = !isOpen;
    chatWindow.classList.toggle('hidden', !isOpen);
    if (isOpen && !greeted) {
      greeted = true;
      fetchGreeting();
    }
    if (isOpen) chatInput.focus();
  });

  chatClose.addEventListener('click', () => {
    isOpen = false;
    chatWindow.classList.add('hidden');
  });

  // Send message
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage('user', text);
    chatInput.value = '';
    chatSend.disabled = true;

    const typingEl = showTyping();

    try {
      const res = await fetch('/webhook/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });

      const data = await res.json();
      removeTyping(typingEl);

      if (data.messages && data.messages.length > 0) {
        await showMessagesSequentially(data.messages);
      } else {
        addMessage('bot', 'Desculpa, tive um probleminha aqui. Tenta de novo?');
      }
    } catch {
      removeTyping(typingEl);
      addMessage('bot', 'Ops, algo deu errado. Tenta de novo daqui a pouco?');
    }

    chatSend.disabled = false;
    chatInput.focus();
  });

  async function showMessagesSequentially(messages) {
    for (let i = 0; i < messages.length; i++) {
      if (i > 0) {
        const typingEl = showTyping();
        await delay(700);
        removeTyping(typingEl);
      }
      addMessage('bot', messages[i]);
    }
  }

  async function fetchGreeting() {
    const typingEl = showTyping();
    try {
      const res = await fetch('/webhook/greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      removeTyping(typingEl);
      if (data.messages) {
        await showMessagesSequentially(data.messages);
      }
    } catch {
      removeTyping(typingEl);
      addMessage('bot', 'Oi \u{1F60A} eu sou a Juma, assistente do Jonathan.');
      addMessage('bot', 'Me conta rapidinho, voc\u00EA trabalha com o qu\u00EA?');
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function addMessage(type, text) {
    const div = document.createElement('div');
    div.className = `message ${type}`;

    // Check if text contains the WhatsApp button HTML
    if (text.includes('wa.me/')) {
      const parts = text.split(/(<a\s[^>]*wa\.me[^>]*>.*?<\/a>)/i);
      parts.forEach((part) => {
        if (part.match(/<a\s/)) {
          const wrapper = document.createElement('span');
          wrapper.innerHTML = part;
          div.appendChild(wrapper);
        } else if (part.trim()) {
          div.appendChild(document.createTextNode(part));
        }
      });
    } else {
      div.textContent = text;
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'message typing';
    div.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function removeTyping(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
})();
