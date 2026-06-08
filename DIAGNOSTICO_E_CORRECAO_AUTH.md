# Correção estrutural da autenticação — Frontend ↔ Backend

## Resumo executivo

A causa raiz era **duas fontes de token convivendo no frontend**. O backend já
estava correto (uma única cadeia de validação). No frontend, `ciclos.js` lia o
token de um lugar (`Supa._token`, o token HMAC legado) enquanto o login real
acontecia em outro (`window.Auth`, a sessão do Supabase). No modo Supabase
`Supa._token` é sempre `null`, então **toda chamada de ciclos saía sem
`Authorization`** e o backend respondia 401 — exatamente o sintoma relatado
(perda de sessão ao abrir fila de análises, gerar relatório ou finalizar ciclo).

A correção elimina a duplicidade: `window.Auth` passou a ser a **única fonte
oficial** de sessão e de token, em ambos os modos (Supabase e legado), exposta
por um único método `Auth.getToken()`. Nenhum módulo lê token de localStorage,
sessionStorage ou variável paralela.

---

## 1. Fluxo antigo (com o defeito)

```
Login (Supabase, no navegador)
        │
        ▼
  window.Auth._session.access_token   ← token verdadeiro
        │
        ├──► supabase_store.js (_authHeaders): no modo Supabase usava Auth ✔
        │
        └──► ciclos.js (_authHeaders): usava Supa.tokenAtual() ✘
                                        (= Supa._token = null no modo Supabase)
                                        → enviava SEM Authorization → 401
```

Duas variáveis de token independentes:
- `Auth._session.access_token` (Supabase) — usada por `supabase_store.js`.
- `Supa._token` (HMAC legado) — usada por `ciclos.js` e também guardada
  separadamente por `supabase_store.js` no modo legado.

Cada módulo tinha sua própria função `_authHeaders` e sua própria lógica de
`_garantirLogin`, com regras divergentes.

## 2. Fluxo novo (corrigido)

```
Login
  ├─ Supabase: signInWithPassword no navegador (supabase-js)
  └─ Legado:   POST /api/auth/login (token HMAC do backend)
        │
        ▼
  window.Auth  ── ÚNICA FONTE ──  Auth.getToken()  (sempre token fresco)
        │
        ├──► supabase_store.js  → _authHeaders() = Bearer Auth.getToken()
        ├──► ciclos.js          → _authHeaders() = Bearer Auth.getToken()
        └──► auth_ui.js         → login/sessão/header/logout via Auth
                                        │
                                        ▼
                          Authorization: Bearer <token>   (mesma origem)
                                        │
                                        ▼
        Backend: identificar → exigirAuth → auth.service.verificarToken
                 (Supabase JWT  OU  HMAC legado — uma única cadeia)
                                        │
                                        ▼
                   req.ator identificado → ação executada
```

Login → Token → Frontend recupera (getToken) → Frontend envia → Backend valida
→ Backend identifica usuário → ação. **Sem caminhos alternativos.**

## 3. Fonte oficial definida

- **Sessão oficial:** `window.Auth` (`auth.js`). No modo Supabase a sessão é a
  do supabase-js; no modo legado é o token HMAC, agora guardado também dentro
  de `Auth` (em memória, nunca persistido).
- **Token oficial:** `Auth.getToken()` — único método autorizado para obter o
  token de uma chamada protegida. `Auth.tokenAtual()` é a versão síncrona
  (sem renovação) para checagens rápidas.

## 4. Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `public/js/auth.js` | Vira a fonte única. Passa a suportar **os dois modos** (Supabase e legado). Novo `getToken()` assíncrono, `garantirLogin()`, `invalidarToken()`, `precisaAuth()`. O login legado (antes em `Supa`) foi movido para cá. |
| `public/js/supabase_store.js` | Removidas as variáveis paralelas `_token`/`_usuario` e o `_garantirLogin` próprio. `login/logout/usuarioAtual/tokenAtual/garantirLogin` agora **delegam** a `window.Auth`. `_authHeaders` virou `async` e usa `Auth.getToken()`. |
| `public/js/ciclos.js` | **Correção do bug principal:** `_authHeaders` agora usa `Auth.getToken()` (antes `Supa.tokenAtual()`). Virou `async`; os helpers `_get`/`_post` passaram a aguardá-lo; o retry de 401 usa `Auth.garantirLogin()`/`Auth.invalidarToken()`. |
| `public/js/auth_ui.js` | Login, verificação de sessão, cabeçalho e logout unificados em `window.Auth` (sem mais ramificação `Supa` vs `Auth`). |

Backend: **nenhuma alteração necessária** — a cadeia já era única e correta.

## 5. Código legado removido

- `Supa._token` e `Supa._usuario` (estado de token paralelo).
- `Supa._garantirLogin()` (lógica de relogin duplicada).
- `Supa.login()` falando direto com `/api/auth/login` (agora via `Auth`).
- Em `ciclos.js`: leitura de token via `Supa.tokenAtual()` e retry via
  `Supa.garantirLogin()` (substituídos pela fonte única).
- Em `auth_ui.js`: ramificação por `_modo` no login e por `supabaseAuth` na
  verificação de sessão, no header e no logout.

## 6. Garantias / requisitos atendidos

- Toda chamada autenticada obtém o token da **mesma fonte** (`Auth.getToken()`).
- Nenhum módulo lê token de `localStorage`, `sessionStorage` ou variável global
  legada (verificado por busca no código — zero ocorrências).
- Existe uma **camada única** de acesso ao token: `Auth.getToken()` /
  `Auth.tokenAtual()`.
- `fetch` com `Authorization: Bearer <token>` em `supabase_store.js` e
  `ciclos.js` agora compartilham a mesma origem.

## 7. Evidências (testes executados)

**Backend — cadeia única (Express real + JWT Supabase assinado):**
```
PASS  health 200
PASS  ciclos/sincronizar token válido NÃO-401
PASS  ciclos/sincronizar SEM token = 401
PASS  ciclos/sincronizar token expirado = 401
PASS  ciclos/sincronizar token adulterado = 401
PASS  anotacoes PUT token válido NÃO-401
PASS  anotacoes PUT SEM token = 401
```

**Frontend — mesma origem de token (módulos reais carregados, fetch instrumentado):**
```
PASS  GET  /api/anotacoes               -> Bearer <token-único>
PASS  PUT  /api/anotacoes/p1            -> Bearer <token-único>
PASS  GET  /api/ciclos/status           -> Bearer <token-único>
PASS  POST /api/ciclos/analises/p1/...  -> Bearer <token-único>
PASS  TODAS as chamadas usam a MESMA origem de token
```

Antes da correção, as duas últimas linhas (`/ciclos/...`) sairiam **sem**
`Authorization` no modo Supabase → 401 indevido.

## 8. Riscos encontrados / observações

- **Backend duplo de validação por design:** `auth.service.verificarToken`
  escolhe entre JWT Supabase e HMAC conforme `config.auth.usaSupabase`. Isso é
  intencional (suporta os dois modos) e **não** é o defeito — o defeito estava
  só no frontend. Mantido.
- **`_authHeaders` agora é assíncrono.** Todos os chamadores foram atualizados
  para `await`. Qualquer novo módulo deve seguir o mesmo padrão: `headers:
  await Auth... ` via a camada, nunca montar `Bearer` manualmente.
- **Compatibilidade:** os nomes públicos antigos (`Supa.login`, `Supa.logout`,
  `Supa.tokenAtual`, `Auth.tokenFresco`) foram preservados como *delegadores/
  aliases* para não quebrar chamadores existentes, mas internamente tudo aponta
  para `Auth`.
- **Arquivos do enunciado vs. reais:** o pedido citava `dashboard.js`,
  `historico.js`, `relatorios.js`, `analises.js`, `api.js`. Esses arquivos não
  existem neste projeto — dashboard, histórico, relatórios e fila de análises
  são todos implementados **dentro de `ciclos.js`** (e a leitura da planilha em
  `sheets.js`, que é endpoint público sem token). Portanto a correção de
  `ciclos.js` cobre, de uma vez, todos esses fluxos.
- `sheets.js` (`GET /api/sheets`) é leitura pública e não envia token — correto,
  pois a rota não exige auth no backend.

## 9. Checklist do fluxo completo

O fluxo Login → Dashboard → Fila de análises → Validar item → Gerar relatório →
Finalizar ciclo → Histórico → Logout → novo Login agora usa, em todas as etapas
autenticadas, o mesmo `Auth.getToken()`. O retry automático em 401 reautentica
pela mesma fonte e repete a chamada uma vez, sem depender de refresh manual da
página.
