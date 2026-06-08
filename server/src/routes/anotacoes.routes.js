'use strict';

const { Router } = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { exigirAuth } = require('../middlewares/auth');
const v = require('../middlewares/validarAnotacao');
const service = require('../services/anotacoes.service');
const config = require('../config');

const router = Router();

function ip(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
}

/* Listar todas as anotações.
   Mantém o contrato do front: resposta é { uid: dados }.
   As versões vão à parte em _versoes, para quem quiser controle de conflito. */
const guardaLeitura = config.auth.protegeLeitura ? [exigirAuth] : [];
router.get('/', ...guardaLeitura, asyncHandler(async (_req, res) => {
  const mapa = await service.listar();          // { uid: { dados, versao } }
  const dados = {};
  const versoes = {};
  for (const [uid, reg] of Object.entries(mapa)) {
    dados[uid]   = reg.dados;
    versoes[uid] = reg.versao;
  }
  res.json({ ...dados, _versoes: versoes });
}));

/* Gravar (upsert) — protegido por auth. Valida payload e versão.
   Use o header If-Match: <versao> para controle de conflito otimista. */
router.put('/:uid', exigirAuth, asyncHandler(async (req, res) => {
  const uid   = v.validarUid(req.params.uid);
  const dados = v.validarDados(req.body && req.body.dados);
  const versaoEsperada = v.validarVersaoEsperada(req);

  const r = await service.salvar({
    uid, dados,
    ator: req.ator,
    origemIp: ip(req),
    versaoEsperada,
  });
  res.set('ETag', String(r.versao));
  res.json({ ok: true, uid: r.uid, versao: r.versao });
}));

/* Remover — protegido por auth. */
router.delete('/:uid', exigirAuth, asyncHandler(async (req, res) => {
  const uid = v.validarUid(req.params.uid);
  await service.remover({ uid, ator: req.ator, origemIp: ip(req) });
  res.json({ ok: true });
}));

module.exports = router;
