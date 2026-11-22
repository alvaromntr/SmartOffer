const { body } = require('express-validator');
const validate = require('../../src/middlewares/validate');
const { mockRes } = require('../helpers');

describe('middlewares/validate', () => {
  test('dados inválidos retornam 400 com os detalhes e não chamam next', async () => {
    const req = { body: { name: '' } };
    await body('name').notEmpty().withMessage('Nome é obrigatório.').run(req);
    const res = mockRes();
    const next = jest.fn();

    validate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const resposta = res.json.mock.calls[0][0];
    expect(resposta.error).toBe('Dados inválidos.');
    expect(resposta.details[0].msg).toBe('Nome é obrigatório.');
    expect(next).not.toHaveBeenCalled();
  });

  test('dados válidos chamam next', async () => {
    const req = { body: { name: 'Ana' } };
    await body('name').notEmpty().run(req);
    const res = mockRes();
    const next = jest.fn();

    validate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
