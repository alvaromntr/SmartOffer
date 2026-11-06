const db = require('../config/db');
const auditService = require('../services/auditService');
const { comparePassword } = require('../utils/password');

async function deleteAccount(req, res, next) {
  const userId = req.user.sub;
  const { password } = req.body;
  const client = await db.pool.connect();

  try {
    const userResult = await client.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conta não encontrada.' });
    }

    const passwordOk = await comparePassword(password, userResult.rows[0].password_hash);
    if (!passwordOk) {
      await req.audit('ACCOUNT_DELETE_FAILED', { entity: 'user', entityId: userId, statusCode: 401 });
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    await client.query('BEGIN');

    await client.query(
      `DELETE FROM sales
       WHERE created_by = $1
          OR client_id  IN (SELECT id FROM clients  WHERE created_by = $1)
          OR product_id IN (SELECT id FROM products WHERE created_by = $1)`,
      [userId]
    );
    await client.query('DELETE FROM clients  WHERE created_by = $1', [userId]);
    await client.query('DELETE FROM products WHERE created_by = $1', [userId]);

    await client.query('UPDATE clients  SET updated_by = NULL WHERE updated_by = $1', [userId]);
    await client.query('UPDATE products SET updated_by = NULL WHERE updated_by = $1', [userId]);
    await client.query('UPDATE sales    SET created_by = NULL WHERE created_by = $1', [userId]);

    await client.query('DELETE FROM user_consents WHERE user_id = $1', [userId]);
    await client.query(
      `UPDATE audit_logs
       SET user_id = NULL, user_email = NULL, ip_address = NULL, user_agent = NULL
       WHERE user_id = $1`,
      [userId]
    );
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    await client.query('COMMIT');

    await auditService.logAction({
      action: 'ACCOUNT_DELETE',
      entity: 'user',
      method: req.method,
      path: req.originalUrl,
      statusCode: 200,
      details: { note: 'Conta e dados do titular excluídos a pedido do próprio usuário.' },
    });

    return res.json({ message: 'Conta excluída com sucesso.' });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Falha no rollback da exclusão de conta:', rollbackErr.message);
    }
    return next(err);
  } finally {
    client.release();
  }
}

module.exports = { deleteAccount };
