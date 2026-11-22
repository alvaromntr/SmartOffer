jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const db = require('../../src/config/db');
const { listSales, createSale, deleteSale } = require('../../src/controllers/saleController');
const { mockReq, mockRes } = require('../helpers');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('saleController.listSales', () => {
  test('lista só as vendas do usuário logado', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 's1' }] });
    const res = mockRes();

    await listSales(mockReq({ query: {} }), res, jest.fn());

    const [sql, valores] = db.query.mock.calls[0];
    expect(sql).toContain('s.created_by = $1');
    expect(valores).toEqual(['user-1']);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 's1' }] });
  });

  test('filtra por cliente quando clientId é informado', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await listSales(mockReq({ query: { clientId: 'c1' } }), mockRes(), jest.fn());

    const [sql, valores] = db.query.mock.calls[0];
    expect(sql).toContain('s.client_id = $2');
    expect(valores).toEqual(['user-1', 'c1']);
  });

  test('erro do banco é repassado ao errorHandler', async () => {
    const erro = new Error('falha');
    db.query.mockRejectedValue(erro);
    const next = jest.fn();
    await listSales(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(erro);
  });
});

describe('saleController.createSale', () => {
  function simularCadastroValido() {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] }) // cliente do usuário existe
      .mockResolvedValueOnce({ rows: [{ id: 'p1', price: '150.00' }] }) // produto do usuário existe
      .mockResolvedValueOnce({ rows: [{ id: 's1', client_id: 'c1', product_id: 'p1', quantity: 3, unit_price: '150.00' }] });
  }

  test('exige cliente e produto', async () => {
    const res = mockRes();
    await createSale(mockReq({ body: { clientId: 'c1' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('cliente de outro usuário (ou inexistente) retorna 404 e não grava nada', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();

    await createSale(mockReq({ body: { clientId: 'c-de-outro', productId: 'p1', quantity: 1 } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cliente não encontrado.' });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual(['c-de-outro', 'user-1']);
  });

  test('produto de outro usuário (ou inexistente) retorna 404 e não grava nada', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'c1' }] }).mockResolvedValueOnce({ rows: [] });
    const res = mockRes();

    await createSale(mockReq({ body: { clientId: 'c1', productId: 'p-de-outro', quantity: 1 } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Produto não encontrado.' });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('registra a venda com o preço do produto e o usuário logado', async () => {
    simularCadastroValido();
    const req = mockReq({ body: { clientId: 'c1', productId: 'p1', quantity: 3 } });
    const res = mockRes();

    await createSale(req, res, jest.fn());

    const [sqlInsert, paramsInsert] = db.query.mock.calls[2];
    expect(sqlInsert).toContain('INSERT INTO sales');
    expect(paramsInsert).toEqual(['c1', 'p1', 3, '150.00', null, 'user-1']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(req.audit).toHaveBeenCalledWith('SALE_CREATE', expect.objectContaining({ entity: 'sale', entityId: 's1' }));
  });

  test('o preço enviado pelo cliente é ignorado: vale o preço cadastrado no produto', async () => {
    simularCadastroValido();
    const req = mockReq({ body: { clientId: 'c1', productId: 'p1', quantity: 3, unitPrice: 0.01, unit_price: 0.01 } });

    await createSale(req, mockRes(), jest.fn());

    expect(db.query.mock.calls[2][1][3]).toBe('150.00');
  });

  test('sem quantidade informada, assume 1', async () => {
    simularCadastroValido();
    await createSale(mockReq({ body: { clientId: 'c1', productId: 'p1' } }), mockRes(), jest.fn());
    expect(db.query.mock.calls[2][1][2]).toBe(1);
  });

  test('usa a data informada quando ela é enviada', async () => {
    simularCadastroValido();
    await createSale(mockReq({ body: { clientId: 'c1', productId: 'p1', quantity: 1, saleDate: '2026-11-01' } }), mockRes(), jest.fn());
    expect(db.query.mock.calls[2][1][4]).toBe('2026-11-01');
  });

  test('erro do banco é repassado ao errorHandler', async () => {
    const erro = new Error('falha');
    db.query.mockRejectedValue(erro);
    const next = jest.fn();
    await createSale(mockReq({ body: { clientId: 'c1', productId: 'p1' } }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(erro);
  });
});

describe('saleController.deleteSale', () => {
  test('remove a venda do usuário e registra a auditoria', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 's1' }] });
    const req = mockReq({ params: { id: 's1' } });
    const res = mockRes();

    await deleteSale(req, res, jest.fn());

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('DELETE FROM sales');
    expect(sql).toContain('created_by');
    expect(params).toEqual(['s1', 'user-1']);
    expect(req.audit).toHaveBeenCalledWith('SALE_DELETE', expect.objectContaining({ entityId: 's1' }));
    expect(res.json).toHaveBeenCalledWith({ message: 'Venda removida com sucesso.' });
  });

  test('venda de outro usuário (ou inexistente) retorna 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const req = mockReq({ params: { id: 's-de-outro' } });
    const res = mockRes();

    await deleteSale(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(req.audit).not.toHaveBeenCalled();
  });
});
