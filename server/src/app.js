'use strict';

const express = require('express');
const config = require('./config');
const apiRoutes = require('./routes');
const { identificar } = require('./middlewares/auth');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

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
