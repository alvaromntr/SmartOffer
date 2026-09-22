requireAuth();

const user = getUser();
document.getElementById('user-name').textContent = user?.name || '';
document.getElementById('user-role').textContent = user?.role || '';

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  window.location.href = '/login.html';
});

const tbody = document.getElementById('sales-tbody');
const emptyState = document.getElementById('empty-state');
const filterClient = document.getElementById('filter-client');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalAlert = document.getElementById('modal-alert');
const saleForm = document.getElementById('sale-form');
const toast = document.getElementById('toast');

let clientsCache = [];
let productsCache = [];

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

async function loadClientsAndProducts() {
  try {
    const [clientsRes, productsRes] = await Promise.all([
      apiRequest('/clients?limit=100'),
      apiRequest('/products'),
    ]);
    clientsCache = clientsRes.data;
    productsCache = productsRes.data;

    filterClient.innerHTML = '<option value="">Todos os clientes</option>' +
      clientsCache.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    document.getElementById('s-client').innerHTML =
      clientsCache.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') ||
      '<option value="">Nenhum cliente cadastrado</option>';

    document.getElementById('s-product').innerHTML =
      productsCache.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} — ${formatPrice(p.price)}</option>`).join('') ||
      '<option value="">Nenhum produto cadastrado</option>';
  } catch (err) {
    showToast(err.message);
  }
}

async function loadSales() {
  try {
    const clientId = filterClient.value;
    const { data } = await apiRequest(`/sales${clientId ? `?clientId=${clientId}` : ''}`);
    renderSales(data);
  } catch (err) {
    showToast(err.message);
  }
}

function renderSales(sales) {
  tbody.innerHTML = '';
  emptyState.style.display = sales.length ? 'none' : 'block';

  for (const sale of sales) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(sale.client_name)}</td>
      <td>${escapeHtml(sale.product_name)}</td>
      <td>${sale.quantity}</td>
      <td>${formatPrice(sale.unit_price)}</td>
      <td>${formatDate(sale.sale_date)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-danger btn-small" data-delete="${sale.id}">Remover</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

filterClient.addEventListener('change', loadSales);

function openModal() {
  modalAlert.classList.remove('show');
  saleForm.reset();
  document.getElementById('s-quantity').value = 1;
  modalBackdrop.classList.add('show');
}

function closeModal() {
  modalBackdrop.classList.remove('show');
}

document.getElementById('new-sale-btn').addEventListener('click', openModal);
document.getElementById('cancel-btn').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

saleForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    clientId: document.getElementById('s-client').value,
    productId: document.getElementById('s-product').value,
    quantity: parseInt(document.getElementById('s-quantity').value, 10) || 1,
    saleDate: document.getElementById('s-date').value || undefined,
  };

  if (!payload.clientId || !payload.productId) {
    modalAlert.textContent = 'Cadastre ao menos um cliente e um produto antes de registrar uma venda.';
    modalAlert.classList.add('show');
    return;
  }

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Registrando...';

  try {
    await apiRequest('/sales', { method: 'POST', body: payload });
    showToast('Venda registrada.');
    closeModal();
    loadSales();
  } catch (err) {
    modalAlert.textContent = err.message;
    modalAlert.classList.add('show');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Registrar';
  }
});

tbody.addEventListener('click', async (e) => {
  const deleteId = e.target.dataset.delete;
  if (!deleteId) return;
  if (!confirm('Tem certeza que deseja remover esta venda?')) return;
  try {
    await apiRequest(`/sales/${deleteId}`, { method: 'DELETE' });
    showToast('Venda removida.');
    loadSales();
  } catch (err) {
    showToast(err.message);
  }
});

(async function init() {
  await loadClientsAndProducts();
  await loadSales();
})();
