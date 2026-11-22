jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const db = require('../../src/config/db');
const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../../src/controllers/productController');
const { mockReq, mockRes } = require('../helpers');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('productController.listProducts', () => {
  test('lista só produtos ativos do usuário', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'p1' }] });
    const res = mockRes();

    await listProducts(mockReq({ query: {} }), res, jest.fn());

    const [sql, valores] = db.query.mock.calls[0];
    expect(sql).toContain('is_active = TRUE AND created_by = $1');
    expect(valores).toEqual(['user-1']);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 'p1' }] });
  });

  test('a busca filtra pelo nome usando parâmetro', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await listProducts(mockReq({ query: { search: 'mesa' } }), mockRes(), jest.fn());
    expect(db.query.mock.calls[0][1]).toEqual(['user-1', '%mesa%']);
  });
});

describe('productController.getProduct', () => {
  test('devolve o produto do usuário', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'p1' }] });
    const res = mockRes();
    await getProduct(mockReq({ params: { id: 'p1' } }), res, jest.fn());
    expect(db.query.mock.calls[0][1]).toEqual(['p1', 'user-1']);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'p1' } });
  });

  test('produto de outro usuário retorna 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = mockRes();
    await getProduct(mockReq({ params: { id: 'p-de-outro' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('productController.createProduct', () => {
  test('exige nome e preço', async () => {
    const res = mockRes();
    await createProduct(mockReq({ body: { name: 'Mesa' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('recusa preço negativo', async () => {
    const res = mockRes();
    await createProduct(mockReq({ body: { name: 'Mesa', price: -5 } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'O preço não pode ser negativo.' });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('aceita preço zero', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'p1', name: 'Brinde' }] });
    const res = mockRes();
    await createProduct(mockReq({ body: { name: 'Brinde', price: 0 } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('cadastra o produto vinculado ao usuário e registra a auditoria', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'p1', name: 'Mesa' }] });
    const req = mockReq({ body: { name: ' Mesa ', description: 'Madeira', price: 500 } });
    const res = mockRes();

    await createProduct(req, res, jest.fn());

    expect(db.query.mock.calls[0][1]).toEqual(['Mesa', 'Madeira', 500, 'user-1']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(req.audit).toHaveBeenCalledWith('PRODUCT_CREATE', expect.objectContaining({ entityId: 'p1' }));
  });
});

describe('productController.updateProduct', () => {
  test('produto de outro usuário retorna 404 e não altera nada', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await updateProduct(mockReq({ params: { id: 'p-de-outro' }, body: { name: 'X' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('atualiza o produto do usuário', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Mesa nova' }] });
    const req = mockReq({ params: { id: 'p1' }, body: { name: 'Mesa nova', price: 600 } });
    const res = mockRes();

    await updateProduct(req, res, jest.fn());

    expect(db.query.mock.calls[1][1]).toEqual(['Mesa nova', null, 600, 'user-1', 'p1']);
    expect(req.audit).toHaveBeenCalledWith('PRODUCT_UPDATE', expect.objectContaining({ entityId: 'p1' }));
  });
});

describe('productController.deleteProduct', () => {
  test('faz exclusão lógica, preservando o histórico de vendas', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'p1', name: 'Mesa' }] });
    const req = mockReq({ params: { id: 'p1' } });
    const res = mockRes();

    await deleteProduct(req, res, jest.fn());

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('is_active = FALSE');
    expect(sql).not.toContain('DELETE FROM');
    expect(params).toEqual(['user-1', 'p1']);
    expect(req.audit).toHaveBeenCalledWith('PRODUCT_DELETE', expect.objectContaining({ entityId: 'p1' }));
  });

  test('produto de outro usuário retorna 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = mockRes();
    await deleteProduct(mockReq({ params: { id: 'p-de-outro' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
