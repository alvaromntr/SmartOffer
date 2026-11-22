jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));

const auditService = require('../../src/services/auditService');
const auditLogger = require('../../src/middlewares/auditLogger');

describe('middlewares/auditLogger', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('adiciona req.audit e chama next', () => {
    const req = {};
    const next = jest.fn();
    auditLogger(req, { statusCode: 200 }, next);
    expect(typeof req.audit).toBe('function');
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('req.audit registra a ação com os dados do usuário logado e da requisição', async () => {
    const req = {
      user: { sub: 'u1', email: 'ana@teste.com' },
      method: 'POST',
      originalUrl: '/api/clients',
      ip: '10.0.0.1',
      headers: { 'user-agent': 'jest' },
    };
    auditLogger(req, { statusCode: 200 }, jest.fn());

    await req.audit('CLIENT_CREATE', { entity: 'client', entityId: 'c1', statusCode: 201, details: { name: 'Maria' } });

    expect(auditService.logAction).toHaveBeenCalledWith({
      userId: 'u1',
      userEmail: 'ana@teste.com',
      action: 'CLIENT_CREATE',
      entity: 'client',
      entityId: 'c1',
      method: 'POST',
      path: '/api/clients',
      statusCode: 201,
      ipAddress: '10.0.0.1',
      userAgent: 'jest',
      details: { name: 'Maria' },
    });
  });

  test('sem usuário logado, usa null e o status atual da resposta', async () => {
    const req = { method: 'GET', originalUrl: '/x', ip: '1.1.1.1', headers: {} };
    auditLogger(req, { statusCode: 404 }, jest.fn());

    await req.audit('ALGO');

    const arg = auditService.logAction.mock.calls[0][0];
    expect(arg.userId).toBeNull();
    expect(arg.userEmail).toBeNull();
    expect(arg.statusCode).toBe(404);
  });
});
