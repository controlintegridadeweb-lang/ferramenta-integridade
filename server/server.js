'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ENTRYPOINT — Ferramenta de Avaliação de Integridade
   ───────────────────────────────────────────────────────────────────────────
   Apenas sobe o servidor. Toda a lógica está organizada em camadas sob src/:
     • config/        → configuração e clientes externos (Supabase)
     • repositories/  → acesso a dados puro
     • services/      → regra de negócio
     • routes/        → endpoints HTTP
     • middlewares/   → utilitários transversais (erros, async)
   ═══════════════════════════════════════════════════════════════════════════ */

const app    = require('./src/app');
const config = require('./src/config');

if (config.auth.usaSupabase) {
  const supabaseToken = require('./src/services/supabaseToken.service');
  supabaseToken.prepararJwks()
    .then(keys => {
      if (keys.length) console.log('[server] JWKS do Supabase Auth carregado (tokens ES256).');
      else console.warn('[server] JWKS vazio — verifique SUPABASE_URL.');
    })
    .catch(err => {
      console.warn('[server] Falha ao carregar JWKS do Supabase Auth — tokens ES256 podem falhar:', err.message || err);
    });
}

if (config.supabase.ativo) {
  const repo = require('./src/repositories/ciclos.repository');
  repo.garantirBucketRelatorios()
    .then(criado => {
      if (criado) console.log(`[server] Bucket Storage "${config.relatorios.bucket}" criado automaticamente.`);
    })
    .catch(err => {
      console.warn(`[server] Bucket Storage "${config.relatorios.bucket}" indisponível — PDFs do histórico não serão armazenados:`, err.message || err);
    });
}

app.listen(config.port, () => {
  console.log(`\n  ▸ Ferramenta no ar:  http://localhost:${config.port}`);
  console.log(`  ▸ Persistência:      ${config.supabase.ativo ? 'ATIVA (Supabase)' : 'desativada'}`);
  console.log(`  ▸ Google Sheets:     ${config.sheets.ativo ? 'ATIVO' : 'desativado'}\n`);
});
