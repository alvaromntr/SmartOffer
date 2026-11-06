requireAuth();

const user = getUser();
document.getElementById('user-name').textContent = user?.name || '';
document.getElementById('user-role').textContent = user?.role || '';
document.getElementById('hello').textContent = user?.name ? `Olá, ${user.name.split(' ')[0]}` : 'Olá';

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  window.location.href = '/login.html';
});

const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatPrice(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function renderTopProducts(items) {
  const box = document.getElementById('top-products');
  const empty = document.getElementById('top-empty');
  box.innerHTML = '';
  empty.style.display = items.length ? 'none' : 'block';

  const max = Math.max(...items.map((i) => i.units), 1);
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-label"><span>${escapeHtml(item.name)}</span><em>${item.units} un. · ${formatPrice(item.revenue)}</em></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((item.units / max) * 100)}%"></div></div>
    `;
    box.appendChild(row);
  }
}

function renderRecentSales(items) {
  const tbody = document.getElementById('recent-tbody');
  const empty = document.getElementById('recent-empty');
  tbody.innerHTML = '';
  empty.style.display = items.length ? 'none' : 'block';

  for (const s of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(s.sale_date)}</td>
      <td>${escapeHtml(s.client_name)}</td>
      <td>${escapeHtml(s.product_name)}</td>
      <td>${s.quantity}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function loadSummary() {
  try {
    const { data } = await apiRequest('/dashboard');
    document.getElementById('st-clients').textContent = data.totals.clients;
    document.getElementById('st-products').textContent = data.totals.products;
    document.getElementById('st-sales').textContent = data.totals.sales;
    document.getElementById('st-revenue').textContent = formatPrice(data.totals.revenue);
    renderTopProducts(data.topProducts);
    renderRecentSales(data.recentSales);
  } catch (err) {
    showToast(err.message);
  }
}

loadSummary();

const deleteBackdrop = document.getElementById('delete-backdrop');
const deleteAlert = document.getElementById('delete-alert');
const deleteForm = document.getElementById('delete-form');
const deletePassword = document.getElementById('delete-password');

function openDeleteModal() {
  deleteAlert.classList.remove('show');
  deleteForm.reset();
  deleteBackdrop.classList.add('show');
  deletePassword.focus();
}

function closeDeleteModal() {
  deleteBackdrop.classList.remove('show');
}

document.getElementById('delete-account-btn').addEventListener('click', openDeleteModal);
document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
deleteBackdrop.addEventListener('click', (e) => {
  if (e.target === deleteBackdrop) closeDeleteModal();
});

deleteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const confirmBtn = document.getElementById('delete-confirm-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Excluindo...';
  deleteAlert.classList.remove('show');

  try {
    await apiRequest('/account', { method: 'DELETE', body: { password: deletePassword.value } });
    clearSession();
    window.location.href = '/login.html?deleted=1';
  } catch (err) {
    deleteAlert.textContent = err.message;
    deleteAlert.classList.add('show');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Excluir definitivamente';
  }
});
