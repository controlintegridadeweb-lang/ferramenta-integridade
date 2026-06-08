'use strict';

/* Envolve handlers async para encaminhar erros ao errorHandler
   sem precisar de try/catch em cada rota. */
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
