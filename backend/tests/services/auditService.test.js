jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const db = require('../../src/config/db');
const { logAction } = require('../../src/services/auditService');

describe('services/auditService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  test('grava o registro na tabela audit_logs com os parâmetros na ordem', async () => {
    await logAction({
      userId: 'u1',
      userEmail: 'ana@teste.com',
      action: 'LOGIN_SUCCESS',
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 200,
      ipAddress: '10.0.0.1',
      userAgent: 'jest',
      details: { a: 1 },
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(params[0]).toBe('u1');
    expect(params[2]).toBe('LOGIN_SUCCESS');
    expect(params[7]).toBe(200);
    expect(params[10]).toBe(JSON.stringify({ a: 1 }));
  });

  test('campos não informados são gravados como null', async () => {
    await logAction({ action: 'ALGO' });
    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBeNull();
    expect(params[1]).toBeNull();
    expect(params[10]).toBeNull();
  });

  test('uma falha no banco não derruba a requisição (erro é engolido)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockRejectedValue(new Error('banco fora do ar'));
    await expect(logAction({ action: 'ALGO' })).resolves.toBeUndefined();
    console.error.mockRestore();
  });
});
