'use strict';

/** Monta a URL da API. Vazio = mesma origem (quando o Node serve o front). */
function apiUrl(path) {
  const p = String(path || '');
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(window.FERRAMENTA_API || '').replace(/\/$/, '');
  return base + (p.charAt(0) === '/' ? p : '/' + p);
}

window.apiUrl = apiUrl;
