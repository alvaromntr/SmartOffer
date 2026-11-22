jest.mock('../../src/config/db', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../../src/utils/password', () => ({ comparePassword: jest.fn() }));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));

const db = require('../../src/config/db');
const { comparePassword } = require('../../src/utils/password');
const auditService = require('../../src/services/auditService');
const { deleteAccount } = require('../../src/controllers/accountController');
const { mockReq, mockRes } = require('../helpers');

let cliente; // conexão falsa usada na transação

function sqlsExecutados() {
  return cliente.query.mock.calls.map((c) => c[0].replace(/\s+/g, ' ').trim());
}

beforeEach(() => {
  jest.resetAllMocks();
  cliente = { query: jest.fn(), release: jest.fn() };
  db.pool.connect.mockResolvedValue(cliente);
  cliente.query.mockImplementation(async (sql) =>
    sql.includes('SELECT password_hash') ? { rows: [{ password_hash: 'hash-do-banco' }] } : { rows: [] }
  );
});

describe('accountController.deleteAccount', () => {
  test('conta inexistente retorna 404 e devolve a conexão ao pool', async () => {
    cliente.query.mockImplementation(async () => ({ rows: [] }));
    const res = mockRes();

    await deleteAccount(mockReq({ body: { password: 'x' } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(sqlsExecutados()).not.toContain('BEGIN');
    expect(cliente.release).toHaveBeenCalledTimes(1);
  });

  test('senha incorreta retorna 401, registra a tentativa e não apaga nada', async () => {
    comparePassword.mockResolvedValue(false);
    const req = mockReq({ body: { password: 'errada' } });
    const res = mockRes();

    await deleteAccount(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Senha incorreta.' });
    expect(req.audit).toHaveBeenCalledWith('ACCOUNT_DELETE_FAILED', expect.objectContaining({ statusCode: 401 }));
    expect(sqlsExecutados()).not.toContain('BEGIN');
    expect(sqlsExecutados().some((s) => s.startsWith('DELETE'))).toBe(false);
    expect(cliente.release).toHaveBeenCalledTimes(1);
  });

  test('senha correta apaga os dados dentro de uma transação e confirma com COMMIT', async () => {
    comparePassword.mockResolvedValue(true);
    const res = mockRes();

    await deleteAccount(mockReq({ body: { password: 'certa' } }), res, jest.fn());

    const sqls = sqlsExecutados();
    expect(sqls[1]).toBe('BEGIN'); // a consulta da senha vem antes (índice 0)
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(sqls).not.toContain('ROLLBACK');

    const posicao = (trecho) => sqls.findIndex((s) => s.includes(trecho));
    expect(posicao('DELETE FROM sales')).toBeGreaterThan(posicao('BEGIN'));
    expect(posicao('DELETE FROM clients')).toBeGreaterThan(-1);
    expect(posicao('DELETE FROM products')).toBeGreaterThan(-1);
    expect(posicao('DELETE FROM user_consents')).toBeGreaterThan(-1);
    expect(posicao('UPDATE audit_logs')).toBeGreaterThan(-1);
    expect(posicao('DELETE FROM users')).toBeLessThan(posicao('COMMIT'));

    expect(res.json).toHaveBeenCalledWith({ message: 'Conta excluída com sucesso.' });
    expect(cliente.release).toHaveBeenCalledTimes(1);
  });

  test('todas as operações de dados usam o id do usuário logado', async () => {
    comparePassword.mockResolvedValue(true);

    await deleteAccount(mockReq({ user: { sub: 'user-7' }, body: { password: 'certa' } }), mockRes(), jest.fn());

    const comParametros = cliente.query.mock.calls.filter((c) => c[1]);
    expect(comParametros.length).toBeGreaterThan(0);
    for (const [, params] of comParametros) {
      expect(params).toEqual(['user-7']);
    }
  });

  test('a exclusão da conta é registrada na auditoria sem identificar o titular', async () => {
    comparePassword.mockResolvedValue(true);

    await deleteAccount(mockReq({ body: { password: 'certa' } }), mockRes(), jest.fn());

    expect(auditService.logAction).toHaveBeenCalledTimes(1);
    const registro = auditService.logAction.mock.calls[0][0];
    expect(registro.action).toBe('ACCOUNT_DELETE');
    expect(registro.userId).toBeUndefined();
    expect(registro.userEmail).toBeUndefined();
  });

  test('se uma etapa falhar, faz ROLLBACK, não confirma e repassa o erro', async () => {
    comparePassword.mockResolvedValue(true);
    const erro = new Error('falha no meio da transação');
    cliente.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT password_hash')) return { rows: [{ password_hash: 'hash-do-banco' }] };
      if (sql.includes('DELETE FROM clients')) throw erro;
      return { rows: [] };
    });
    const res = mockRes();
    const next = jest.fn();

    await deleteAccount(mockReq({ body: { password: 'certa' } }), res, next);

    const sqls = sqlsExecutados();
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(next).toHaveBeenCalledWith(erro);
    expect(res.json).not.toHaveBeenCalled();
    expect(auditService.logAction).not.toHaveBeenCalled();
    expect(cliente.release).toHaveBeenCalledTimes(1);
  });
});
