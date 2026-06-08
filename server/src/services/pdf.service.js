'use strict';

const puppeteer = require('puppeteer');

/* ═══════════════════════════════════════════════════════════════════════════
   GERAÇÃO DE PDF — HTML → PDF via Chrome headless (Puppeteer)
   ───────────────────────────────────────────────────────────────────────────
   Renderiza o MESMO HTML do relatório (com seu CSS @page / @media print) num
   navegador real e exporta um PDF vetorial: texto selecionável, paginação
   nativa do CSS, fidelidade total ao layout. Sem rasterização no cliente.

   O navegador é iniciado sob demanda e reaproveitado entre requisições (abrir
   o Chrome a cada PDF seria lento). Em caso de queda, ele é reinicializado.
   ═══════════════════════════════════════════════════════════════════════════ */

let _browserPromise = null;

async function _obterBrowser() {
  if (_browserPromise) {
    try {
      const b = await _browserPromise;
      if (b.connected) return b;
    } catch (_) { /* cai para recriar abaixo */ }
    _browserPromise = null;
  }

  // Em produção (Docker) usamos o Chromium do sistema via PUPPETEER_EXECUTABLE_PATH.
  // Localmente a variável fica vazia e o Puppeteer usa o Chromium que baixou sozinho.
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  _browserPromise = puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const browser = await _browserPromise;
  browser.on('disconnected', () => { _browserPromise = null; });
  return browser;
}

/* Converte uma string HTML completa em um Buffer PDF (A4, com fundo). */
async function htmlParaPdf(html) {
  if (!html || typeof html !== 'string') {
    const e = new Error('HTML do relatório ausente.');
    e.status = 400; e.expose = true;
    throw e;
  }

  const browser = await _obterBrowser();
  const page = await browser.newPage();
  try {
    // O HTML do relatório é autocontido (CSS inline, fontes do sistema, SVGs
    // embutidos): não há recursos externos para aguardar. Usamos 'load' em vez
    // de 'networkidle0' porque, com o Chromium do sistema (Docker), os eventos
    // de rede ociosa nem sempre disparam e a navegação estourava o timeout.
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    // Garante que as fontes terminem de carregar (limite curto para não travar).
    await Promise.race([
      page.evaluate(() => document.fonts && document.fonts.ready),
      new Promise((r) => setTimeout(r, 2000)),
    ]).catch(() => {});
    // emulateMediaType('print') garante que @media print e @page sejam aplicados.
    await page.emulateMediaType('print');
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,   // honra @page (tamanho/margens definidos no CSS)
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function encerrar() {
  if (!_browserPromise) return;
  try {
    const b = await _browserPromise;
    await b.close();
  } catch (_) { /* já fechado */ }
  _browserPromise = null;
}

module.exports = { htmlParaPdf, encerrar };
