function errorHandler(err, req, res, next) {
  console.error('[errorHandler]', err);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Já existe um registro com esses dados (violação de unicidade).' });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Erro interno do servidor.' : err.message;

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
