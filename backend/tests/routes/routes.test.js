// Testa a "tabela de endereços" da API: quais métodos e caminhos existem em cada arquivo
// de routes e se as proteções (login e validação) estão ligadas na ordem certa.
jest.mock('../../src/config/db', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));

const authRoutes = require('../../src/routes/authRoutes');
const clientRoutes = require('../../src/routes/clientRoutes');
const productRoutes = require('../../src/routes/productRoutes');
const saleRoutes = require('../../src/routes/saleRoutes');
const chatRoutes = require('../../src/routes/chatRoutes');
const accountRoutes = require('../../src/routes/accountRoutes');
const dashboardRoutes = require('../../src/routes/dashboardRoutes');

function rotas(router) {
  return router.stack
    .filter((camada) => camada.route)
    .map((camada) => `${Object.keys(camada.route.methods)[0].toUpperCase()} ${camada.route.path}`);
}

function camadasDeRota(router) {
  return router.stack.filter((camada) => camada.route);
}

describe('routes: endereços disponíveis', () => {
  test('authRoutes', () => {
    expect(rotas(authRoutes)).toEqual(['POST /register', 'POST /login', 'GET /me']);
  });

  test('clientRoutes', () => {
    expect(rotas(clientRoutes)).toEqual(['GET /', 'GET /:id', 'POST /', 'PUT /:id', 'DELETE /:id']);
  });

  test('productRoutes', () => {
    expect(rotas(productRoutes)).toEqual(['GET /', 'GET /:id', 'POST /', 'PUT /:id', 'DELETE /:id']);
  });

  test('saleRoutes', () => {
    expect(rotas(saleRoutes)).toEqual(['GET /', 'POST /', 'DELETE /:id']);
  });

  test('chatRoutes', () => {
    expect(rotas(chatRoutes)).toEqual(['POST /']);
  });

  test('accountRoutes', () => {
    expect(rotas(accountRoutes)).toEqual(['DELETE /']);
  });

  test('dashboardRoutes', () => {
    expect(rotas(dashboardRoutes)).toEqual(['GET /']);
  });
});

describe('routes: proteção por login', () => {
  test.each([
    ['clientRoutes', clientRoutes],
    ['productRoutes', productRoutes],
    ['saleRoutes', saleRoutes],
    ['chatRoutes', chatRoutes],
    ['accountRoutes', accountRoutes],
    ['dashboardRoutes', dashboardRoutes],
  ])('%s exige autenticação em todas as rotas (authenticate é o primeiro passo)', (nome, router) => {
    expect(router.stack[0].name).toBe('authenticate');
    expect(router.stack[0].route).toBeUndefined();
  });

  test('authRoutes não exige login em todas as rotas: cadastro e login são públicos', () => {
    expect(semAuthenticateGlobal(authRoutes)).toBe(true);
  });

  test('em authRoutes, só a rota /me passa pelo authenticate', () => {
    const porRota = Object.fromEntries(
      camadasDeRota(authRoutes).map((c) => [c.route.path, c.route.stack.map((s) => s.name)])
    );
    expect(porRota['/me']).toContain('authenticate');
    expect(porRota['/register']).not.toContain('authenticate');
    expect(porRota['/login']).not.toContain('authenticate');
  });
});

function semAuthenticateGlobal(router) {
  return router.stack[0].name !== 'authenticate' && Boolean(router.stack[0].route);
}

describe('routes: validação antes do controller', () => {
  test.each([
    ['authRoutes', authRoutes],
    ['clientRoutes', clientRoutes],
    ['productRoutes', productRoutes],
    ['saleRoutes', saleRoutes],
    ['chatRoutes', chatRoutes],
    ['accountRoutes', accountRoutes],
  ])('%s: toda rota que grava ou apaga dados passa pelo validate antes do controller', (nome, router) => {
    const gravacoes = camadasDeRota(router).filter((c) => ['post', 'put', 'delete'].some((m) => c.route.methods[m]));
    expect(gravacoes.length).toBeGreaterThan(0);

    for (const camada of gravacoes) {
      const nomes = camada.route.stack.map((s) => s.name);
      expect(nomes).toContain('validate');
      expect(nomes.indexOf('validate')).toBeLessThan(nomes.length - 1); // o controller vem por último
    }
  });

  test('os controllers corretos estão ligados às rotas de vendas', () => {
    const ultimos = camadasDeRota(saleRoutes).map((c) => c.route.stack[c.route.stack.length - 1].name);
    expect(ultimos).toEqual(['listSales', 'createSale', 'deleteSale']);
  });

  test('a exclusão de conta liga o controller deleteAccount', () => {
    const [camada] = camadasDeRota(accountRoutes);
    expect(camada.route.stack[camada.route.stack.length - 1].name).toBe('deleteAccount');
  });
});
