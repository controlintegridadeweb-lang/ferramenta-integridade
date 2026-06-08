'use strict';

const { Router } = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const service = require('../services/sheets.service');

const router = Router();

/* Proxy do Google Sheets com cache + versionamento.
   ?forcar=1 ignora o TTL e rebusca no Google. */
router.get('/', asyncHandler(async (req, res) => {
  const forcar = req.query.forcar === '1' || req.query.forcar === 'true';
  const resultado = await service.obter({ forcar });

  if (resultado.erro) {
    return res.status(resultado.status || 500).json({ erro: resultado.erro });
  }

  const m = resultado.meta || {};
  // Rastreabilidade: o front sabe exatamente qual arquivo recebeu.
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Cache-Control', 'no-store');
  if (m.hash)        res.set('X-Sheet-Version', m.hash);
  if (m.importadoEm) res.set('X-Sheet-Imported-At', m.importadoEm);
  if (m.cache)       res.set('X-Sheet-Cache', m.cache);
  res.send(resultado.buffer);
}));

/* Metadados da versão atual (hash, horário, tamanho, origem) — sem os bytes. */
router.get('/meta', asyncHandler(async (_req, res) => {
  const r = await service.meta();
  if (r.erro) return res.status(r.status || 500).json({ erro: r.erro });
  res.json(r.meta || {});
}));

/* Histórico de importações (append-only). */
router.get('/historico', asyncHandler(async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 50, 500);
  const r = await service.historico(limite);
  if (r.erro) return res.status(r.status || 500).json({ erro: r.erro });
  res.json(r.historico);
}));

module.exports = router;
