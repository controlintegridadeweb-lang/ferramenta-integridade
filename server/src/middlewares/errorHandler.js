'use strict';

/* Tratamento centralizado de erros. Loga no servidor e responde com uma
   mensagem neutra, respeitando o status definido pela camada de serviço. */
module.exports = (err, req, res, _next) => {
  const status = err.status || 500;
  console.error(`[api] ${req.method} ${req.originalUrl}:`, err.message || err);
  res.status(status).json({ erro: err.expose ? err.message : (err.message || 'Erro interno.') });
};
