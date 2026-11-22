jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const db = require('../../src/config/db');
const { getSummary } = require('../../src/controllers/dashboardController');
const { mockReq, mockRes } = require('../helpers');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('dashboardController.getSummary', () => {
  test('monta o resumo com totais, produtos mais vendidos e vendas recentes', async () => {
    const totais = { clients: 2, products: 3, sales: 5, revenue: '1000.00' };
    const topo = [{ id: 'p1', name: 'Mesa', units: 4 }];
    const recentes = [{ id: 's1', client_name: 'Maria', product_name: 'Mesa' }];
    db.query
      .mockResolvedValueOnce({ rows: [totais] })
      .mockResolvedValueOnce({ rows: topo })
      .mockResolvedValueOnce({ rows: recentes });
    const res = mockRes();

    await getSummary(mockReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ data: { totals: totais, topProducts: topo, recentSales: recentes } });
  });

  test('todas as consultas usam apenas o id do usuário logado', async () => {
    db.query.mockResolvedValue({ rows: [{}] });
    await getSummary(mockReq({ user: { sub: 'user-9' } }), mockRes(), jest.fn());

    expect(db.query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of db.query.mock.calls) {
      expect(sql).toContain('created_by = $1');
      expect(params).toEqual(['user-9']);
    }
  });

  test('erro do banco é repassado ao errorHandler', async () => {
    const erro = new Error('falha');
    db.query.mockRejectedValue(erro);
    const next = jest.fn();
    await getSummary(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(erro);
  });
});
