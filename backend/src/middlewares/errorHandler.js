function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      message: err.message || "Erro interno do servidor.",
      status
    }
  });
}

module.exports = { errorHandler };
