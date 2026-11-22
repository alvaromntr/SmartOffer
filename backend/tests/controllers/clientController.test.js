jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const db = require('../../src/config/db');
const {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
} = require('../../src/controllers/clientController');
const { mockReq, mockRes } = require('../helpers');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('clientController.listClients', () => {
  // O controller altera a lista de parâmetros depois da primeira consulta, e o Jest
  // guarda só a referência. Por isso copiamos os parâmetros no momento de cada chamada.
  let chamadas;

  function simularLista(total = 2, linhas = [{ id: 'c1' }, { id: 'c2' }]) {
    chamadas = [];
    const respostas = [{ rows: [{ total }] }, { rows: linhas }];
    db.query.mockImplementation(async (sql, params) => {
      chamadas.push({ sql, params: [...params] });
      return respostas[chamadas.length - 1];
    });
  }

  test('lista só clientes ativos do usuário, com paginação padrão', async () => {
    simularLista();
    const res = mockRes();

    await listClients(mockReq({ query: {} }), res, jest.fn());

    expect(chamadas[0].sql).toContain('is_active = TRUE AND created_by = $1');
    expect(chamadas[0].params).toEqual(['user-1']);
    expect(res.json).toHaveBeenCalledWith({
      data: [{ id: 'c1' }, { id: 'c2' }],
      pagination: { total: 2, page: 1, limit: 20 },
    });
  });

  test('limita o tamanho da página a 100 e a página mínima a 1', async () => {
    simularLista();
    const res = mockRes();

    await listClients(mockReq({ query: { limit: '500', page: '0' } }), res, jest.fn());

    expect(res.json.mock.calls[0][0].pagination).toMatchObject({ page: 1, limit: 100 });
  });

  test('calcula o deslocamento (offset) da página pedida', async () => {
    simularLista();
    await listClients(mockReq({ query: { page: '3', limit: '10' } }), mockRes(), jest.fn());

    expect(chamadas[1].params).toEqual(['user-1', 10, 20]);
  });

  test('a busca filtra por nome ou e-mail usando parâmetro', async () => {
    simularLista();
    await listClients(mockReq({ query: { search: 'ana' } }), mockRes(), jest.fn());

    expect(chamadas[0].sql).toContain('ILIKE');
    expect(chamadas[0].params).toEqual(['user-1', '%ana%']);
  });

  test('erro do banco é repassado ao errorHandler', async () => {
    const erro = new Error('falha');
    db.query.mockRejectedValue(erro);
    const next = jest.fn();
    await listClients(mockReq({ query: {} }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(erro);
  });
});

describe('clientController.getClient', () => {
  test('devolve o cliente do usuário', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'c1', name: 'Maria' }] });
    const res = mockRes();

    await getClient(mockReq({ params: { id: 'c1' } }), res, jest.fn());

    expect(db.query.mock.calls[0][1]).toEqual(['c1', 'user-1']);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'c1', name: 'Maria' } });
  });

  test('cliente de outro usuário retorna 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = mockRes();
    await getClient(mockReq({ params: { id: 'c-de-outro' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cliente não encontrado.' });
  });
});

describe('clientController.createClient', () => {
  test('exige apenas o nome: sem nome retorna 400', async () => {
    const res = mockRes();
    await createClient(mockReq({ body: { email: 'maria@teste.com' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'O nome é obrigatório.' });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('nome só com espaços também é recusado', async () => {
    const res = mockRes();
    await createClient(mockReq({ body: { name: '   ' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('cadastra o cliente só com o nome (e-mail, telefone e observações ficam null)', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'c1', name: 'Maria' }] });
    const res = mockRes();

    await createClient(mockReq({ body: { name: ' Maria ' } }), res, jest.fn());

    expect(db.query.mock.calls[0][1]).toEqual(['Maria', null, null, null, 'user-1']);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('e-mail em branco é gravado como null', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'c1', name: 'Maria' }] });

    await createClient(mockReq({ body: { name: 'Maria', email: '   ' } }), mockRes(), jest.fn());

    expect(db.query.mock.calls[0][1][1]).toBeNull();
  });

  test('cadastra o cliente vinculado ao usuário, com e-mail normalizado', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'c1', name: 'Maria' }] });
    const req = mockReq({ body: { name: ' Maria ', email: ' MARIA@Teste.com ', phone: '11999999999' } });
    const res = mockRes();

    await createClient(req, res, jest.fn());

    expect(db.query.mock.calls[0][1]).toEqual(['Maria', 'maria@teste.com', '11999999999', null, 'user-1']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(req.audit).toHaveBeenCalledWith('CLIENT_CREATE', expect.objectContaining({ entityId: 'c1' }));
  });
});

describe('clientController.updateClient', () => {
  test('cliente de outro usuário retorna 404 e não altera nada', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();

    await updateClient(mockReq({ params: { id: 'c-de-outro' }, body: { name: 'X' } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('atualiza o cliente do usuário e registra a auditoria', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Maria Nova' }] });
    const req = mockReq({ params: { id: 'c1' }, body: { name: 'Maria Nova', email: 'maria@teste.com' } });
    const res = mockRes();

    await updateClient(req, res, jest.fn());

    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toContain('UPDATE clients');
    expect(sql).toContain('created_by = $5');
    expect(params).toEqual(['Maria Nova', 'maria@teste.com', null, null, 'user-1', 'c1']);
    expect(req.audit).toHaveBeenCalledWith('CLIENT_UPDATE', expect.objectContaining({ entityId: 'c1' }));
    expect(res.json.mock.calls[0][0].message).toBe('Cliente atualizado com sucesso.');
  });
});

describe('clientController.updateClient (e-mail opcional)', () => {
  test('e-mail em branco na edição remove o e-mail do cliente', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Maria' }] });

    await updateClient(mockReq({ params: { id: 'c1' }, body: { name: 'Maria', email: '' } }), mockRes(), jest.fn());

    expect(db.query.mock.calls[1][1][1]).toBeNull();
  });
});

describe('clientController.deleteClient', () => {
  test('faz exclusão lógica (is_active = FALSE), sem apagar o registro', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'c1', name: 'Maria' }] });
    const req = mockReq({ params: { id: 'c1' } });
    const res = mockRes();

    await deleteClient(req, res, jest.fn());

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('is_active = FALSE');
    expect(sql).not.toContain('DELETE FROM');
    expect(params).toEqual(['user-1', 'c1']);
    expect(req.audit).toHaveBeenCalledWith('CLIENT_DELETE', expect.objectContaining({ entityId: 'c1' }));
    expect(res.json).toHaveBeenCalledWith({ message: 'Cliente removido com sucesso.' });
  });

  test('cliente de outro usuário (ou já removido) retorna 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = mockRes();
    await deleteClient(mockReq({ params: { id: 'c-de-outro' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
