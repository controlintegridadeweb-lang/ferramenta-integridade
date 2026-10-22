'use strict';

/* O GitHub Pages só entrega os arquivos estáticos. A API continua no Node.
   Enquanto não houver uma URL pública, o site publicado usa o servidor local. */
if (/(^|\.)github\.io$/i.test(location.hostname)) {
  window.FERRAMENTA_API = 'http://localhost:3000';
}
