const errorHandler = require('../../src/middlewares/errorHandler');
const { mockReq, mockRes } = require('../helpers');

describe('middlewares/errorHandler', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('violação de unicidade do banco (23505) retorna 409', () => {
    const res = mockRes();
    errorHandler(Object.assign(new Error('dup'), { code: '23505' }), mockReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('erro com statusCode usa o código e a mensagem do erro', () => {
    const res = mockRes();
    errorHandler(Object.assign(new Error('Cliente não encontrado.'), { statusCode: 404 }), mockReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cliente não encontrado.' });
  });

  test('erro inesperado retorna 500 sem expor detalhes internos', () => {
    const res = mockRes();
    errorHandler(new Error('senha do banco incorreta: abc123'), mockReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro interno do servidor.' });
  });
});
