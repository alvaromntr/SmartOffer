const authorize = require('../../src/middlewares/authorize');
const { mockReq, mockRes } = require('../helpers');

describe('middlewares/authorize', () => {
  test('sem usuário autenticado retorna 401', () => {
    const req = mockReq({ user: undefined });
    const res = mockRes();
    const next = jest.fn();
    authorize('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('perfil não permitido retorna 403', () => {
    const req = mockReq({ user: { sub: 'u1', role: 'user' } });
    const res = mockRes();
    const next = jest.fn();
    authorize('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('perfil permitido chama next', () => {
    const req = mockReq({ user: { sub: 'u1', role: 'admin' } });
    const res = mockRes();
    const next = jest.fn();
    authorize('admin', 'user')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('sem lista de perfis, qualquer usuário autenticado passa', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    authorize()(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
