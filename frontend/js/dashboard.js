requireAuth();

const user = getUser();
document.getElementById('user-name').textContent = user?.name || '';
document.getElementById('user-role').textContent = user?.role || '';

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  window.location.href = '/login.html';
});

const tbody = document.getElementById('clients-tbody');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalAlert = document.getElementById('modal-alert');
const clientForm = document.getElementById('client-form');
const toast = document.getElementById('toast');

let searchTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function loadClients() {
  const search = searchInput.value.trim();
  try {
    const { data } = await apiRequest(`/clients${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    renderClients(data);
  } catch (err) {
    showToast(err.message);
  }
}

function renderClients(clients) {
  tbody.innerHTML = '';
  emptyState.style.display = clients.length ? 'none' : 'block';

  for (const client of clients) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(client.name)}</td>
      <td>${escapeHtml(client.email)}</td>
      <td>${escapeHtml(client.phone || '—')}</td>
      <td>${formatDate(client.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost btn-small" data-edit="${client.id}">Editar</button>
          <button class="btn btn-danger btn-small" data-delete="${client.id}">Remover</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadClients, 300);
});

function openModal(mode, client = null) {
  modalAlert.classList.remove('show');
  clientForm.reset();
  document.getElementById('client-id').value = client?.id || '';
  document.getElementById('c-name').value = client?.name || '';
  document.getElementById('c-email').value = client?.email || '';
  document.getElementById('c-phone').value = client?.phone || '';
  document.getElementById('c-notes').value = client?.notes || '';
  modalTitle.textContent = mode === 'edit' ? 'Editar cliente' : 'Novo cliente';
  modalBackdrop.classList.add('show');
  document.getElementById('c-name').focus();
}

function closeModal() {
  modalBackdrop.classList.remove('show');
}

document.getElementById('new-client-btn').addEventListener('click', () => openModal('create'));
document.getElementById('cancel-btn').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

clientForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const payload = {
    name: document.getElementById('c-name').value.trim(),
    email: document.getElementById('c-email').value.trim(),
    phone: document.getElementById('c-phone').value.trim(),
    notes: document.getElementById('c-notes').value.trim(),
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';

  try {
    if (id) {
      await apiRequest(`/clients/${id}`, { method: 'PUT', body: payload });
      showToast('Cliente atualizado.');
    } else {
      await apiRequest('/clients', { method: 'POST', body: payload });
      showToast('Cliente cadastrado.');
    }
    closeModal();
    loadClients();
  } catch (err) {
    modalAlert.textContent = err.message;
    modalAlert.classList.add('show');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salvar';
  }
});

tbody.addEventListener('click', async (e) => {
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;

  if (editId) {
    try {
      const { data } = await apiRequest(`/clients/${editId}`);
      openModal('edit', data);
    } catch (err) {
      showToast(err.message);
    }
  }

  if (deleteId) {
    if (!confirm('Tem certeza que deseja remover este cliente?')) return;
    try {
      await apiRequest(`/clients/${deleteId}`, { method: 'DELETE' });
      showToast('Cliente removido.');
      loadClients();
    } catch (err) {
      showToast(err.message);
    }
  }
});

loadClients();
