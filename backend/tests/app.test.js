// Teste de integração leve: sobe o app Express (sem rede e sem banco real) e faz
// requisições de verdade para conferir a cadeia completa de middlewares e routes.
jest.mock('../src/config/db', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('morgan', () => jest.fn(() => (req, res, next) => next())); // silencia o log nos testes

const request = require('supertest');
const db = require('../src/config/db');
const app = require('../src/app');
const { generateToken } = require('../src/utils/jwt');

function tokenDe(id) {
  return generateToken({ id, email: `${id}@teste.com`, role: 'user' });
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('app: rotas públicas e erros', () => {
  test('GET /api/health responde ok', async () => {
    const resposta = await request(app).get('/api/health');
    expect(resposta.status).toBe(200);
    expect(resposta.body.status).toBe('ok');
  });

  test('endereço da API que não existe retorna 404 em JSON', async () => {
    const resposta = await request(app).get('/api/rota-que-nao-existe');
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ error: 'Rota não encontrada.' });
  });

  test('o helmet adiciona cabeçalhos de segurança', async () => {
    const resposta = await request(app).get('/api/health');
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['content-security-policy']).toBeDefined();
  });
});

describe('app: rotas protegidas exigem login', () => {
  test.each([
    ['get', '/api/clients'],
    ['get', '/api/products'],
    ['get', '/api/sales'],
    ['post', '/api/sales'],
    ['post', '/api/chat'],
    ['delete', '/api/account'],
    ['get', '/api/auth/me'],
  ])('%s %s sem token retorna 401', async (metodo, caminho) => {
    const resposta = await request(app)[metodo](caminho);
    expect(resposta.status).toBe(401);
    expect(resposta.body.error).toBe('Token de autenticação ausente.');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('token inválido retorna 401', async () => {
    const resposta = await request(app).get('/api/clients').set('Authorization', 'Bearer token-falso');
    expect(resposta.status).toBe(401);
    expect(resposta.body.error).toBe('Token inválido ou expirado.');
  });
});

describe('app: validação nas routes', () => {
  test('cadastro sem aceitar os termos é recusado antes de chegar ao banco', async () => {
    const resposta = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ana@teste.com', password: 'senha1234', acceptTerms: false });
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toBe('Dados inválidos.');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('cadastro com senha curta é recusado antes de chegar ao banco', async () => {
    const resposta = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ana@teste.com', password: '123', acceptTerms: true });
    expect(resposta.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('login com e-mail inválido é recusado antes de chegar ao banco', async () => {
    const resposta = await request(app).post('/api/auth/login').send({ email: 'isso-nao-e-email', password: 'x' });
    expect(resposta.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('venda com quantidade zero é recusada na route', async () => {
    const resposta = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${tokenDe('11111111-1111-4111-8111-111111111111')}`)
      .send({
        clientId: '22222222-2222-4222-8222-222222222222',
        productId: '33333333-3333-4333-8333-333333333333',
        quantity: 0,
      });
    expect(resposta.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('cliente com e-mail inválido é recusado na route', async () => {
    const resposta = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${tokenDe('u1')}`)
      .send({ name: 'Maria', email: 'isso-nao-e-email' });
    expect(resposta.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test.each([
    ['sem o campo e-mail', { name: 'Maria' }],
    ['com e-mail vazio', { name: 'Maria', email: '' }],
  ])('cliente %s é aceito: só o nome é obrigatório', async (descricao, corpo) => {
    db.query.mockResolvedValue({ rows: [{ id: 'c1', name: 'Maria' }] });
    const resposta = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${tokenDe('u1')}`)
      .send(corpo);
    expect(resposta.status).toBe(201);
    expect(db.query.mock.calls[0][1]).toEqual(['Maria', null, null, null, 'u1']);
  });

  test('cliente sem nome é recusado na route', async () => {
    const resposta = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${tokenDe('u1')}`)
      .send({ email: 'maria@teste.com' });
    expect(resposta.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('ID inválido na URL é recusado', async () => {
    const resposta = await request(app)
      .get('/api/clients/nao-e-um-uuid')
      .set('Authorization', `Bearer ${tokenDe('u1')}`);
    expect(resposta.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('app: cadeia completa com usuário logado', () => {
  test('cada usuário consulta o banco com o próprio id (isolamento dos dados)', async () => {
    db.query.mockResolvedValue({ rows: [{ total: 0 }] });

    await request(app).get('/api/clients').set('Authorization', `Bearer ${tokenDe('usuario-A')}`);
    const idsUsados = db.query.mock.calls.map((c) => c[1][0]);
    expect(idsUsados.length).toBeGreaterThan(0);
    expect(new Set(idsUsados)).toEqual(new Set(['usuario-A']));

    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [{ total: 0 }] });

    await request(app).get('/api/clients').set('Authorization', `Bearer ${tokenDe('usuario-B')}`);
    const idsUsadosB = db.query.mock.calls.map((c) => c[1][0]);
    expect(new Set(idsUsadosB)).toEqual(new Set(['usuario-B']));
  });

  test('listagem de clientes devolve os dados e a paginação', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Maria' }] });

    const resposta = await request(app).get('/api/clients').set('Authorization', `Bearer ${tokenDe('u1')}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.data).toEqual([{ id: 'c1', name: 'Maria' }]);
    expect(resposta.body.pagination.total).toBe(1);
  });

  test('erro inesperado do banco vira 500 sem vazar detalhes', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockRejectedValue(new Error('senha do banco: segredo123'));

    const resposta = await request(app).get('/api/products').set('Authorization', `Bearer ${tokenDe('u1')}`);

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro interno do servidor.' });
    expect(JSON.stringify(resposta.body)).not.toContain('segredo123');
    console.error.mockRestore();
  });
});
