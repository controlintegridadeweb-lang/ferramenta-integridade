'use strict';

const { Router } = require('express');

const router = Router();

router.use('/auth', require('./auth.routes'));
router.use('/', require('./health.routes'));
router.use('/anotacoes', require('./anotacoes.routes'));
router.use('/sheets', require('./sheets.routes'));
router.use('/ciclos', require('./ciclos.routes'));

module.exports = router;
