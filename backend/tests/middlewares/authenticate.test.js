const authenticate = require('../../src/middlewares/authenticate');
const { generateToken } = require('../../src/utils/jwt');
const { mockReq, mockRes } = require('../helpers');

describe('middlewares/authenticate', () => {
  test('sem cabeçalho Authorization retorna 401', () => {
    const req = mockReq({ headers: {}, user: undefined });
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token de autenticação ausente.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('cabeçalho sem o prefixo Bearer retorna 401', () => {
    const req = mockReq({ headers: { authorization: 'Token abc' }, user: undefined });
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('token inválido retorna 401', () => {
    const req = mockReq({ headers: { authorization: 'Bearer lixo' }, user: undefined });
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido ou expirado.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('token válido preenche req.user e chama next', () => {
    const token = generateToken({ id: 'u1', email: 'ana@teste.com', role: 'user' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` }, user: undefined });
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ sub: 'u1', email: 'ana@teste.com' });
    expect(res.status).not.toHaveBeenCalled();
  });
});
