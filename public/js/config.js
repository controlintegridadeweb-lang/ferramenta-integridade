'use strict';

/* O GitHub Pages só entrega a interface. A API fica no Render. */
if (/(^|\.)github\.io$/i.test(location.hostname)) {
  window.FERRAMENTA_API = 'https://ferramenta-integridade.onrender.com';
}
