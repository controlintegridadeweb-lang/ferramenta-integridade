'use strict';

const { Router } = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const auth = require('../services/auth.service');

const router = Router();

/* Troca usuario/senha por um token de sessão assinado. */
router.post('/login', asyncHandler(async (req, res) => {
  const { usuario, senha } = req.body || {};
  if (!usuario || !senha) {
    const err = new Error('Informe usuário e senha.');
    err.status = 400; err.expose = true;
    throw err;
  }
  const r = auth.login(String(usuario), String(senha));
  res.json({ token: r.token, usuario: r.usuario });
}));

module.exports = router;
