// Funções auxiliares para simular req e res do Express nos testes.

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
    originalUrl: '/api/teste',
    method: 'POST',
    user: { sub: 'user-1', email: 'user1@teste.com', role: 'user' },
    audit: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

module.exports = { mockReq, mockRes };
