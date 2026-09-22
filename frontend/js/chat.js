requireAuth();

const user = getUser();
document.getElementById('user-name').textContent = user?.name || '';
document.getElementById('user-role').textContent = user?.role || '';

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  window.location.href = '/login.html';
});

const clientItemsEl = document.getElementById('chat-client-items');
const generalModeBtn = document.querySelector('.chat-mode-btn[data-mode="general"]');
const panelHead = document.getElementById('chat-panel-head');
const messagesEl = document.getElementById('chat-messages');
const chatEmpty = document.getElementById('chat-empty');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const toast = document.getElementById('toast');

let selected = { type: 'general' };

const conversations = {};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function conversationKey() {
  return selected.type === 'general' ? 'general' : selected.id;
}

function emptyStateText() {
  if (selected.type === 'general') {
    return 'Pergunte, por exemplo: "chegou uma decoração de praia, quais clientes teriam interesse?" — a IA olha o histórico de compras de todos os clientes para responder.';
  }
  return `Pergunte algo como "quais produtos você recomenda para ${selected.name}?" com base no histórico de compras dele.`;
}

async function loadClients() {
  try {
    const { data } = await apiRequest('/clients?limit=100');
    renderClientItems(data);
  } catch (err) {
    showToast(err.message);
  }
}

function renderClientItems(clients) {
  if (!clients.length) {
    clientItemsEl.innerHTML = '<div class="chat-client-item">Nenhum cliente cadastrado ainda.</div>';
    return;
  }
  clientItemsEl.innerHTML = clients
    .map((c) => `<div class="chat-client-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)}</div>`)
    .join('');
}

function selectGeneral() {
  selected = { type: 'general' };
  generalModeBtn.classList.add('active');
  document.querySelectorAll('.chat-client-item').forEach((el) => el.classList.remove('active'));
  panelHead.textContent = 'Modo geral — pergunte sobre qualquer cliente ou produto';
  renderMessages();
  chatInput.focus();
}

function selectClient(id, name) {
  selected = { type: 'client', id, name };
  generalModeBtn.classList.remove('active');
  document.querySelectorAll('.chat-client-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  panelHead.textContent = `Conversando sobre: ${name}`;
  renderMessages();
  chatInput.focus();
}

generalModeBtn.addEventListener('click', selectGeneral);

clientItemsEl.addEventListener('click', (e) => {
  const item = e.target.closest('.chat-client-item[data-id]');
  if (!item) return;
  selectClient(item.dataset.id, item.dataset.name);
});

function renderMessages() {
  const history = conversations[conversationKey()] || [];

  if (history.length === 0) {
    messagesEl.innerHTML = '';
    messagesEl.appendChild(chatEmpty);
    chatEmpty.style.display = 'flex';
    chatEmpty.textContent = emptyStateText();
    return;
  }

  chatEmpty.style.display = 'none';
  messagesEl.innerHTML = history
    .map((m) => `<div class="chat-bubble ${m.role === 'user' ? 'user' : 'model'}">${escapeHtml(m.text)}</div>`)
    .join('');
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  const key = conversationKey();
  if (!conversations[key]) conversations[key] = [];
  const history = conversations[key];

  history.push({ role: 'user', text });
  chatInput.value = '';
  renderMessages();

  const pendingBubble = document.createElement('div');
  pendingBubble.className = 'chat-bubble model pending';
  pendingBubble.textContent =
    selected.type === 'general' ? 'Analisando todos os clientes...' : 'Analisando o histórico de compras...';
  messagesEl.appendChild(pendingBubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  chatSendBtn.disabled = true;
  chatInput.disabled = true;

  try {
    const body = {
      message: text,
      history: history.slice(0, -1),
    };
    if (selected.type === 'client') body.clientId = selected.id;

    const { reply } = await apiRequest('/chat', { method: 'POST', body });

    history.push({ role: 'model', text: reply });
    renderMessages();
  } catch (err) {
    pendingBubble.remove();
    showToast(err.message);
  } finally {
    chatSendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

renderMessages();
loadClients();
