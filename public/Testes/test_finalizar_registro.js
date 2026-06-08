'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.resolve(__dirname,'..','js','ciclos.js'),'utf8');

// Extrai o corpo da função finalizarRegistroFluxo (verbatim) do arquivo real.
function extrair(src, marca){
  const ini = src.indexOf(marca);
  let i = src.indexOf('{', ini), prof=0;
  for(let j=i;j<src.length;j++){const c=src[j];if(c==='{')prof++;else if(c==='}'){prof--;if(prof===0)return src.slice(ini,j+1);}}
}
const corpo = extrair(SRC, 'async function finalizarRegistroFluxo(');

let ok=0, fail=0;
function eq(d,g,e){const G=JSON.stringify(g),E=JSON.stringify(e);if(G===E){ok++;console.log('  PASS',d);}else{fail++;console.log('  FAIL',d,'\n    obtido:',G,'\n    esper :',E);}}

async function cenario(statusUid, uidExisteNaPlanilha){
  const reg = [];
  const sandbox = {
    console, Date,
    _ativo: true,
    statusDe: () => statusUid,
    atualizarStatus: async () => {},
    State: { allData: uidExisteNaPlanilha ? [{ _uid:'X', objeto:'obra' }] : [] },
    showLoading: ()=>{}, hideLoading: ()=>{}, closeModal: ()=>reg.push('closeModal'),
    renderDashboard: async ()=>{}, applyFilters: ()=>{}, _updateAllStats: ()=>{},
    _gerarPdfBase64: async ()=> 'BASE64PDF',
    gerarRelatorio: async (uids)=>{ reg.push('gerarRelatorio:'+JSON.stringify(uids)); return { numero: 7, total_registros: uids.length, pdf_url: null }; },
    _toast: (m,t)=>reg.push('toast:'+t+':'+m),
    window: {},
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(corpo + '\nthis.__fn = finalizarRegistroFluxo;', ctx);
  await sandbox.__fn('X');
  return reg;
}

(async ()=>{
  console.log('\n=== Smoke: finalização individual ===');
  // 1. VALIDADO + presente na planilha → gera relatório com [X] e fecha modal
  eq('VALIDADO finaliza com uid correto', await cenario('VALIDADO', true),
     ['gerarRelatorio:["X"]','toast:success:Registro finalizado no relatório #007.','closeModal']);
  // 2. Não validado → não gera relatório, avisa
  const r2 = await cenario('EM_ANALISE', true);
  eq('não-validado não gera relatório', r2.filter(x=>x.startsWith('gerarRelatorio')), []);
  // 3. VALIDADO mas ausente da planilha → não gera, erro
  const r3 = await cenario('VALIDADO', false);
  eq('uid ausente da planilha não gera', r3.filter(x=>x.startsWith('gerarRelatorio')), []);
  console.log(`\n  RESULTADO SMOKE-FINALIZAR: ${ok} aprovados | ${fail} falhou(ram)\n`);
  process.exit(fail?1:0);
})();
