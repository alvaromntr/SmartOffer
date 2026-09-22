requireAuth();

const user = getUser();
document.getElementById('user-name').textContent = user?.name || '';
document.getElementById('user-role').textContent = user?.role || '';

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  window.location.href = '/login.html';
});

const tbody = document.getElementById('products-tbody');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalAlert = document.getElementById('modal-alert');
const productForm = document.getElementById('product-form');
const toast = document.getElementById('toast');

let searchTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatPrice(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function loadProducts() {
  const search = searchInput.value.trim();
  try {
    const { data } = await apiRequest(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    renderProducts(data);
  } catch (err) {
    showToast(err.message);
  }
}

function renderProducts(products) {
  tbody.innerHTML = '';
  emptyState.style.display = products.length ? 'none' : 'block';

  for (const product of products) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.description || '—')}</td>
      <td>${formatPrice(product.price)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost btn-small" data-edit="${product.id}">Editar</button>
          <button class="btn btn-danger btn-small" data-delete="${product.id}">Remover</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadProducts, 300);
});

function openModal(mode, product = null) {
  modalAlert.classList.remove('show');
  productForm.reset();
  document.getElementById('p-id').value = product?.id || '';
  document.getElementById('p-name').value = product?.name || '';
  document.getElementById('p-price').value = product?.price ?? '';
  document.getElementById('p-description').value = product?.description || '';
  modalTitle.textContent = mode === 'edit' ? 'Editar produto' : 'Novo produto';
  modalBackdrop.classList.add('show');
  document.getElementById('p-name').focus();
}

function closeModal() {
  modalBackdrop.classList.remove('show');
}

document.getElementById('new-product-btn').addEventListener('click', () => openModal('create'));
document.getElementById('cancel-btn').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('p-id').value;
  const payload = {
    name: document.getElementById('p-name').value.trim(),
    price: parseFloat(document.getElementById('p-price').value),
    description: document.getElementById('p-description').value.trim(),
  };

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';

  try {
    if (id) {
      await apiRequest(`/products/${id}`, { method: 'PUT', body: payload });
      showToast('Produto atualizado.');
    } else {
      await apiRequest('/products', { method: 'POST', body: payload });
      showToast('Produto cadastrado.');
    }
    closeModal();
    loadProducts();
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
      const { data } = await apiRequest(`/products/${editId}`);
      openModal('edit', data);
    } catch (err) {
      showToast(err.message);
    }
  }

  if (deleteId) {
    if (!confirm('Tem certeza que deseja remover este produto?')) return;
    try {
      await apiRequest(`/products/${deleteId}`, { method: 'DELETE' });
      showToast('Produto removido.');
      loadProducts();
    } catch (err) {
      showToast(err.message);
    }
  }
});

loadProducts();
