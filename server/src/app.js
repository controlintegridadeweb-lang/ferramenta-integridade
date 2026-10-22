'use strict';

const express = require('express');
const config = require('./config');
const apiRoutes = require('./routes');
const { identificar } = require('./middlewares/auth');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

/* O front no GitHub Pages é outra origem e precisa chamar esta API.
   Chrome também exige permissão de rede privada ao sair de um site público
   para localhost. */
function origemPermitida(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (url.protocol === 'https:' && (host === 'github.io' || host.endsWith('.github.io'))) return true;
    if ((host === 'localhost' || host === '127.0.0.1') && (url.protocol === 'http:' || url.protocol === 'https:')) return true;
  } catch (_) { /* origem malformada */ }
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origemPermitida(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb' }));

/* Identifica o ator (req.ator) a partir do token, sem bloquear. */
app.use('/api', identificar);

/* API */
app.use('/api', apiRoutes);

/* Estáticos (front-end) — servidos pelo mesmo processo */
app.use(express.static(config.publicDir));

/* Tratamento de erros (sempre por último) */
app.use(errorHandler);

module.exports = app;
