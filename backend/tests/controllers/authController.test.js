jest.mock('../../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/password', () => ({ hashPassword: jest.fn(), comparePassword: jest.fn() }));
jest.mock('../../src/utils/jwt', () => ({ generateToken: jest.fn() }));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));

const db = require('../../src/config/db');
const { hashPassword, comparePassword } = require('../../src/utils/password');
const { generateToken } = require('../../src/utils/jwt');
const auditService = require('../../src/services/auditService');
const { register, login, me } = require('../../src/controllers/authController');
const { mockReq, mockRes } = require('../helpers');

const umMinuto = 60 * 1000;

function usuario(overrides = {}) {
  return {
    id: 'u1',
    name: 'Ana',
    email: 'ana@teste.com',
    password_hash: 'hash-do-banco',
    role: 'user',
    is_active: true,
    failed_login_attempts: 0,
    locked_until: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('authController.register', () => {
  const corpoValido = { name: ' Ana ', email: ' ANA@Teste.com ', password: 'senha1234', acceptTerms: true };

  test('exige nome, e-mail e senha', async () => {
    const res = mockRes();
    await register(mockReq({ body: { name: 'Ana' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('recusa senha com menos de 8 caracteres', async () => {
    const res = mockRes();
    await register(mockReq({ body: { ...corpoValido, password: '1234567' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('exige o aceite do Termo de Uso e da Política de Privacidade', async () => {
    const res = mockRes();
    await register(mockReq({ body: { ...corpoValido, acceptTerms: false } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Termo de Uso/);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('cria o usuário com hash, registra o consentimento e a auditoria', async () => {
    hashPassword.mockResolvedValue('hash-falso');
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', name: 'Ana', email: 'ana@teste.com', role: 'user', created_at: 'hoje' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = mockRes();

    await register(mockReq({ body: corpoValido }), res, jest.fn());

    expect(hashPassword).toHaveBeenCalledWith('senha1234');

    const [sqlUsuario, paramsUsuario] = db.query.mock.calls[0];
    expect(sqlUsuario).toContain('INSERT INTO users');
    expect(paramsUsuario).toEqual(['Ana', 'ana@teste.com', 'hash-falso']);

    const [sqlConsentimento, paramsConsentimento] = db.query.mock.calls[1];
    expect(sqlConsentimento).toContain('INSERT INTO user_consents');
    expect(paramsConsentimento[0]).toBe('u1');

    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_REGISTER', userId: 'u1' }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].user).not.toHaveProperty('password_hash');
  });

  test('a senha em texto nunca é enviada ao banco', async () => {
    hashPassword.mockResolvedValue('hash-falso');
    db.query.mockResolvedValue({ rows: [{ id: 'u1', email: 'ana@teste.com' }] });

    await register(mockReq({ body: corpoValido }), mockRes(), jest.fn());

    expect(JSON.stringify(db.query.mock.calls)).not.toContain('senha1234');
  });

  test('e-mail já cadastrado retorna 409', async () => {
    hashPassword.mockResolvedValue('hash-falso');
    db.query.mockRejectedValue(Object.assign(new Error('duplicado'), { code: '23505' }));
    const res = mockRes();
    const next = jest.fn();

    await register(mockReq({ body: corpoValido }), res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Este e-mail já está cadastrado.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('erro inesperado é repassado ao errorHandler', async () => {
    hashPassword.mockResolvedValue('hash-falso');
    const erro = new Error('banco caiu');
    db.query.mockRejectedValue(erro);
    const next = jest.fn();

    await register(mockReq({ body: corpoValido }), mockRes(), next);

    expect(next).toHaveBeenCalledWith(erro);
  });
});

describe('authController.login', () => {
  const corpo = { email: ' ANA@teste.com ', password: 'senha1234' };

  test('exige e-mail e senha', async () => {
    const res = mockRes();
    await login(mockReq({ body: { email: 'ana@teste.com' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('normaliza o e-mail antes de consultar o banco', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await login(mockReq({ body: corpo }), mockRes(), jest.fn());
    expect(db.query.mock.calls[0][1]).toEqual(['ana@teste.com']);
  });

  test('usuário inexistente e senha errada recebem exatamente a mesma resposta', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const resInexistente = mockRes();
    await login(mockReq({ body: corpo }), resInexistente, jest.fn());

    jest.clearAllMocks();
    db.query.mockResolvedValueOnce({ rows: [usuario()] }).mockResolvedValueOnce({ rows: [] });
    comparePassword.mockResolvedValue(false);
    const resSenhaErrada = mockRes();
    await login(mockReq({ body: corpo }), resSenhaErrada, jest.fn());

    expect(resInexistente.status).toHaveBeenCalledWith(401);
    expect(resSenhaErrada.status).toHaveBeenCalledWith(401);
    expect(resInexistente.json.mock.calls[0][0]).toEqual({ error: 'E-mail ou senha inválidos.' });
    expect(resSenhaErrada.json.mock.calls[0][0]).toEqual(resInexistente.json.mock.calls[0][0]);
  });

  test('usuário inexistente registra LOGIN_FAILED e não compara senha', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await login(mockReq({ body: corpo }), mockRes(), jest.fn());
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_FAILED' }));
    expect(comparePassword).not.toHaveBeenCalled();
  });

  test('conta bloqueada retorna 423 mesmo sem conferir a senha', async () => {
    const futuro = new Date(Date.now() + 10 * umMinuto);
    db.query.mockResolvedValue({ rows: [usuario({ locked_until: futuro })] });
    const res = mockRes();

    await login(mockReq({ body: corpo }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(423);
    expect(res.json.mock.calls[0][0].error).toMatch(/bloqueada/);
    expect(comparePassword).not.toHaveBeenCalled();
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_BLOCKED' }));
  });

  test('conta desativada retorna 403', async () => {
    db.query.mockResolvedValue({ rows: [usuario({ is_active: false })] });
    const res = mockRes();
    await login(mockReq({ body: corpo }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('senha errada soma uma tentativa e ainda não bloqueia antes da quinta', async () => {
    db.query.mockResolvedValueOnce({ rows: [usuario({ failed_login_attempts: 2 })] }).mockResolvedValueOnce({ rows: [] });
    comparePassword.mockResolvedValue(false);

    await login(mockReq({ body: corpo }), mockRes(), jest.fn());

    const [sql, params] = db.query.mock.calls[1];
    expect(sql).toContain('UPDATE users SET failed_login_attempts');
    expect(params).toEqual([3, null, 'u1']);
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILED', details: { attempts: 3, locked: false } })
    );
  });

  test('na quinta senha errada a conta é bloqueada por 15 minutos', async () => {
    db.query.mockResolvedValueOnce({ rows: [usuario({ failed_login_attempts: 4 })] }).mockResolvedValueOnce({ rows: [] });
    comparePassword.mockResolvedValue(false);
    const antes = Date.now();

    await login(mockReq({ body: corpo }), mockRes(), jest.fn());

    const [tentativas, bloqueadoAte] = db.query.mock.calls[1][1];
    expect(tentativas).toBe(5);
    expect(bloqueadoAte).toBeInstanceOf(Date);
    expect(bloqueadoAte.getTime()).toBeGreaterThanOrEqual(antes + 15 * umMinuto);
    expect(bloqueadoAte.getTime()).toBeLessThanOrEqual(Date.now() + 15 * umMinuto);
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ details: { attempts: 5, locked: true } })
    );
  });

  test('bloqueio já vencido permite entrar de novo', async () => {
    const passado = new Date(Date.now() - 1 * umMinuto);
    db.query.mockResolvedValue({ rows: [usuario({ locked_until: passado, failed_login_attempts: 5 })] });
    comparePassword.mockResolvedValue(true);
    generateToken.mockReturnValue('token-falso');
    const res = mockRes();

    await login(mockReq({ body: corpo }), res, jest.fn());

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].token).toBe('token-falso');
  });

  test('login correto zera as tentativas, gera o token e registra LOGIN_SUCCESS', async () => {
    db.query.mockResolvedValue({ rows: [usuario({ failed_login_attempts: 3 })] });
    comparePassword.mockResolvedValue(true);
    generateToken.mockReturnValue('token-falso');
    const res = mockRes();

    await login(mockReq({ body: corpo }), res, jest.fn());

    const [sqlReset, paramsReset] = db.query.mock.calls[1];
    expect(sqlReset).toContain('failed_login_attempts = 0');
    expect(paramsReset).toEqual(['u1']);
    expect(generateToken).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_SUCCESS' }));

    expect(res.status).not.toHaveBeenCalled();
    const resposta = res.json.mock.calls[0][0];
    expect(resposta.token).toBe('token-falso');
    expect(resposta.user).toEqual({ id: 'u1', name: 'Ana', email: 'ana@teste.com', role: 'user' });
    expect(resposta.user).not.toHaveProperty('password_hash');
  });

  test('erro inesperado é repassado ao errorHandler', async () => {
    const erro = new Error('banco caiu');
    db.query.mockRejectedValue(erro);
    const next = jest.fn();
    await login(mockReq({ body: corpo }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(erro);
  });
});

describe('authController.me', () => {
  test('devolve os dados do usuário logado', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'user-1', name: 'Ana' }] });
    const res = mockRes();
    await me(mockReq(), res, jest.fn());
    expect(db.query.mock.calls[0][1]).toEqual(['user-1']);
    expect(res.json).toHaveBeenCalledWith({ user: { id: 'user-1', name: 'Ana' } });
  });

  test('usuário que não existe mais retorna 404', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = mockRes();
    await me(mockReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
