function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para executar esta ação.' });
    }

    return next();
  };
}

module.exports = authorize;
