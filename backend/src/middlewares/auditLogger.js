const auditService = require('../services/auditService');

function auditLogger(req, res, next) {
  req.audit = (action, extra = {}) => {
    return auditService.logAction({
      userId: req.user ? req.user.sub : extra.userId || null,
      userEmail: req.user ? req.user.email : extra.userEmail || null,
      action,
      entity: extra.entity || null,
      entityId: extra.entityId || null,
      method: req.method,
      path: req.originalUrl,
      statusCode: extra.statusCode ?? res.statusCode,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: extra.details || null,
    });
  };
  next();
}

module.exports = auditLogger;
