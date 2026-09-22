const db = require('../config/db');

async function logAction({
  userId = null,
  userEmail = null,
  action,
  entity = null,
  entityId = null,
  method = null,
  path = null,
  statusCode = null,
  ipAddress = null,
  userAgent = null,
  details = null,
}) {
  try {
    await db.query(
      `INSERT INTO audit_logs
        (user_id, user_email, action, entity, entity_id, method, path, status_code, ip_address, user_agent, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId,
        userEmail,
        action,
        entity,
        entityId,
        method,
        path,
        statusCode,
        ipAddress,
        userAgent,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    console.error('[auditService] Falha ao gravar log de auditoria:', err.message);
  }
}

module.exports = { logAction };
