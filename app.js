/* =============================================================================
   app.js — Orquestrador da interface
   ============================================================================= */

import { detectarCapacidades } from './capabilities.js';
import { iniciarVarredura, pararVarredura } from './nfc-web.js';
import * as usb from './usb-acr122u.js';
import { identificarChip } from './chipdb.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

const CHAVE_HIST = 'inspetorNfc.historico';
let historico = carregarHistorico();
let leituraAtual = null;

/* ---------- Inicialização ------------------------------------------------- */
function init() {
  const caps = detectarCapacidades();
  configurarBadge(caps);
  configurarBanner(caps.mensagem);
  configurarScanner(caps);
  renderHistorico();
}

function configurarBadge(caps) {
  const badge = $('#mode-badge');
  let texto = 'Sem suporte';
  let cls = 'badge badge--off';
  if (caps.metodo === 'web-nfc') { texto = 'Web NFC · Android'; cls = 'badge badge--live'; }
  else if (caps.metodo === 'usb') { texto = 'Leitor USB · desktop'; cls = 'badge badge--usb'; }
  badge.className = cls;
  badge.textContent = texto;
}

function configurarBanner(msg) {
  const b = $('#banner');
  b.className = `banner banner--${msg.nivel}`;
  b.innerHTML = '';
  b.appendChild(el('strong', 'banner__titulo', msg.titulo));
  b.appendChild(el('span', 'banner__texto', msg.texto));
}

function configurarScanner(caps) {
  const acoes = $('#scan-actions');
  acoes.innerHTML = '';

  if (caps.metodo === 'web-nfc') {
    const btn = el('button', 'btn btn--primary', 'Escanear');
    btn.addEventListener('click', () => iniciarLeituraNfc(btn));
    acoes.appendChild(btn);
  } else if (caps.metodo === 'usb') {
    const conectar = el('button', 'btn btn--primary', 'Conectar leitor');
    conectar.addEventListener('click', () => conectarLeitorUsb(conectar));
    acoes.appendChild(conectar);
    const aviso = el('p', 'nota-beta', 'Caminho do leitor físico em fase beta — finalização com o hardware em mãos.');
    acoes.appendChild(aviso);
  } else {
    const btn = el('button', 'btn btn--primary', 'Escanear');
    btn.disabled = true;
    acoes.appendChild(btn);
  }
}

/* ---------- Estado visual do scanner -------------------------------------- */
function estado(nome, texto) {
  const sc = $('#scanner');
  sc.dataset.estado = nome; // idle | scanning | detected | error (estilizado no CSS)
  $('#scan-status').textContent = texto;
}

/* ---------- Web NFC ------------------------------------------------------- */
function iniciarLeituraNfc(btn) {
  btn.disabled = true;
  estado('scanning', 'Aproxime a tag do aparelho…');

  iniciarVarredura({
    aoIniciar: () => estado('scanning', 'Aguardando tag…'),
    aoLer: (resultado) => {
      estado('detected', 'Tag lida.');
      processarLeitura(resultado);
      btn.disabled = false;
    },
    aoErro: (erro) => {
      estado('error', erro.message || 'Erro na leitura.');
      btn.disabled = false;
    },
  });
}

/* ---------- WebUSB (beta) ------------------------------------------------- */
async function conectarLeitorUsb(btn) {
  btn.disabled = true;
  estado('scanning', 'Selecione o leitor…');
  try {
    const info = await usb.conectar();
    estado('idle', `Conectado: ${info.nome}`);
    const ler = el('button', 'btn btn--primary', 'Ler tag no leitor');
    ler.addEventListener('click', () => lerNoLeitorUsb(ler));
    $('#scan-actions').appendChild(ler);
    btn.textContent = 'Leitor conectado';
  } catch (e) {
    estado('error', e.message || 'Não foi possível conectar ao leitor.');
    btn.disabled = false;
  }
}

async function lerNoLeitorUsb(btn) {
  btn.disabled = true;
  estado('scanning', 'Encoste a tag no leitor…');
  try {
    const { uid, status } = await usb.lerUid();
    if (status !== 'ok') {
      estado('error', 'Nenhuma tag detectada no leitor.');
      btn.disabled = false;
      return;
    }
    estado('detected', 'Tag lida.');
    processarLeitura({
      fonte: 'acr122u',
      momento: new Date().toISOString(),
      uid, sak: null, atqa: null, ats: null,
      ndef: [], memoria: null,
    });
    btn.disabled = false;
  } catch (e) {
    estado('error', `Erro no leitor (beta): ${e.message}`);
    btn.disabled = false;
  }
}

/* ---------- Processa e renderiza uma leitura ------------------------------ */
function processarLeitura(res) {
  res.identificacao = identificarChip({ uid: res.uid, sak: res.sak, atqa: res.atqa, ats: res.ats });
  leituraAtual = res;
  renderResultado(res);
  adicionarAoHistorico(res);
}

function renderResultado(res) {
  const r = $('#result');
  r.hidden = false;
  const id = res.identificacao;

  // Identificação
  const ident = $('#r-ident');
  ident.innerHTML = '';
  ident.appendChild(secaoTitulo('Identificação'));
  ident.appendChild(linhaDado('Fabricante', id.fabricante));
  if (id.familia) ident.appendChild(linhaDado('Família', id.familia));
  ident.appendChild(linhaDado('Fonte da leitura', res.fonte === 'web-nfc' ? 'NFC do aparelho (Web NFC)' : 'Leitor USB (ACR122U)'));
  if (id.observacoes?.length) {
    const ul = el('ul', 'obs');
    id.observacoes.forEach((o) => ul.appendChild(el('li', null, o)));
    ident.appendChild(ul);
  }

  // Técnico
  const tec = $('#r-tech');
  tec.innerHTML = '';
  tec.appendChild(secaoTitulo('Dados técnicos'));
  tec.appendChild(linhaDado('UID', res.uid || '—', true));
  tec.appendChild(linhaDado('ATQA', formatarHexCampo(res.atqa)));
  tec.appendChild(linhaDado('SAK', formatarHexCampo(res.sak)));
  tec.appendChild(linhaDado('ATS', res.ats || '— (indisponível neste caminho)'));

  // NDEF
  const nd = $('#r-ndef');
  nd.innerHTML = '';
  nd.appendChild(secaoTitulo('NDEF'));
  if (!res.ndef || !res.ndef.length) {
    nd.appendChild(el('p', 'vazio', 'Nenhum registro NDEF na tag.'));
  } else {
    res.ndef.forEach((reg) => nd.appendChild(renderRegistroNdef(reg)));
  }

  // Memória (só quando o leitor entregar)
  const mem = $('#r-memory');
  mem.innerHTML = '';
  if (res.memoria && res.memoria.length) {
    mem.hidden = false;
    mem.appendChild(secaoTitulo('Memória (setores / blocos)'));
    mem.appendChild(renderMemoria(res.memoria));
  } else {
    mem.hidden = true;
  }

  r.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRegistroNdef(reg) {
  const card = el('div', 'ndef-reg');
  const cab = el('div', 'ndef-reg__cab');
  cab.appendChild(el('span', 'ndef-reg__tipo', reg.rotulo || reg.tipo));
  if (reg.mediaType) cab.appendChild(el('span', 'ndef-reg__mime', reg.mediaType));
  cab.appendChild(el('span', 'ndef-reg__tam', `${reg.tamanho} B`));
  card.appendChild(cab);

  if (reg.rotulo === 'Smart Poster' && Array.isArray(reg.valor)) {
    const sub = el('div', 'ndef-sub');
    reg.valor.forEach((s) => sub.appendChild(renderRegistroNdef(s)));
    card.appendChild(sub);
  } else if (reg.rotulo === 'WiFi' && reg.valor && typeof reg.valor === 'object') {
    Object.entries(reg.valor).forEach(([k, v]) => card.appendChild(linhaDado(k, v)));
  } else if (reg.valor != null && reg.valor !== '') {
    const v = el('div', 'ndef-reg__valor mono', reg.valor);
    card.appendChild(v);
  }
  // Hex bruto sempre disponível
  if (reg.hex) {
    const det = el('details', 'hex-det');
    det.appendChild(el('summary', null, 'Bytes (hex)'));
    det.appendChild(el('pre', 'mono hex-pre', reg.hex));
    card.appendChild(det);
  }
  return card;
}

function renderMemoria(setores) {
  const wrap = el('div', 'mem-grid');
  setores.forEach((s) => {
    const bloco = el('div', `mem-setor ${s.autenticou ? '' : 'mem-setor--bloqueado'}`);
    bloco.appendChild(el('div', 'mem-setor__cab', `Setor ${s.setor}${s.autenticou ? '' : ' · auth falhou'}`));
    s.blocos.forEach((b) => {
      const linha = el('div', 'mem-bloco mono');
      linha.appendChild(el('span', 'mem-bloco__n', String(b.bloco).padStart(3, '0')));
      linha.appendChild(el('span', 'mem-bloco__hex', b.hex));
      bloco.appendChild(linha);
    });
    wrap.appendChild(bloco);
  });
  return wrap;
}

/* ---------- Helpers de render --------------------------------------------- */
function secaoTitulo(t) { return el('h3', 'secao-titulo', t); }
function linhaDado(rotulo, valor, mono) {
  const linha = el('div', 'dado');
  linha.appendChild(el('span', 'dado__rotulo', rotulo));
  linha.appendChild(el('span', `dado__valor${mono ? ' mono' : ''}`, valor == null ? '—' : String(valor)));
  return linha;
}
function formatarHexCampo(v) {
  if (typeof v !== 'number') return '— (indisponível neste caminho)';
  return '0x' + v.toString(16).padStart(2, '0').toUpperCase();
}

/* ---------- Histórico (localStorage com fallback) ------------------------- */
function carregarHistorico() {
  try { return JSON.parse(localStorage.getItem(CHAVE_HIST)) || []; }
  catch { return []; }
}
function salvarHistorico() {
  try { localStorage.setItem(CHAVE_HIST, JSON.stringify(historico)); } catch { /* preview sem storage */ }
}
function adicionarAoHistorico(res) {
  historico.unshift({
    momento: res.momento,
    uid: res.uid,
    fabricante: res.identificacao?.fabricante,
    familia: res.identificacao?.familia || null,
    fonte: res.fonte,
    registros: (res.ndef || []).length,
    completo: res,
  });
  if (historico.length > 200) historico.length = 200;
  salvarHistorico();
  renderHistorico();
}
function renderHistorico() {
  const lista = $('#history-list');
  lista.innerHTML = '';
  if (!historico.length) {
    lista.appendChild(el('p', 'vazio', 'Nenhuma leitura registrada ainda.'));
    return;
  }
  historico.forEach((h, i) => {
    const item = el('button', 'hist-item');
    item.appendChild(el('span', 'hist-item__uid mono', h.uid || '—'));
    item.appendChild(el('span', 'hist-item__fab', h.fabricante || ''));
    item.appendChild(el('span', 'hist-item__hora', new Date(h.momento).toLocaleString('pt-BR')));
    item.addEventListener('click', () => { leituraAtual = h.completo; renderResultado(h.completo); });
    lista.appendChild(item);
  });
}

/* ---------- Exportação ---------------------------------------------------- */
function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function exportarJson() {
  if (!leituraAtual) return;
  baixar(`leitura-${Date.now()}.json`, JSON.stringify(leituraAtual, null, 2), 'application/json');
}
function exportarCsvHistorico() {
  const cab = 'momento,uid,fabricante,familia,fonte,registros';
  const linhas = historico.map((h) =>
    [h.momento, h.uid, h.fabricante, h.familia || '', h.fonte, h.registros]
      .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
  baixar(`historico-${Date.now()}.csv`, [cab, ...linhas].join('\n'), 'text/csv');
}
function exportarTxt() {
  if (!leituraAtual) return;
  baixar(`relatorio-${Date.now()}.txt`, montarRelatorioTexto(leituraAtual), 'text/plain');
}
function montarRelatorioTexto(res) {
  const id = res.identificacao || {};
  const L = [];
  L.push('INSPETOR NFC — RELATÓRIO TÉCNICO');
  L.push('='.repeat(40));
  L.push(`Data/hora: ${new Date(res.momento).toLocaleString('pt-BR')}`);
  L.push(`Fonte: ${res.fonte === 'web-nfc' ? 'NFC do aparelho (Web NFC)' : 'Leitor USB (ACR122U)'}`);
  L.push('');
  L.push('IDENTIFICAÇÃO');
  L.push(`  Fabricante: ${id.fabricante || '—'}`);
  L.push(`  Família:    ${id.familia || '—'}`);
  L.push('');
  L.push('DADOS TÉCNICOS');
  L.push(`  UID:  ${res.uid || '—'}`);
  L.push(`  ATQA: ${formatarHexCampo(res.atqa)}`);
  L.push(`  SAK:  ${formatarHexCampo(res.sak)}`);
  L.push(`  ATS:  ${res.ats || '—'}`);
  L.push('');
  L.push('NDEF');
  if (!res.ndef?.length) L.push('  (sem registros)');
  res.ndef?.forEach((r, i) => {
    L.push(`  [${i + 1}] ${r.rotulo}${r.mediaType ? ' (' + r.mediaType + ')' : ''}`);
    if (typeof r.valor === 'string') L.push(`      ${r.valor}`);
    L.push(`      hex: ${r.hex}`);
  });
  return L.join('\n');
}

/* ---------- Wiring de botões fixos ---------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  init();
  $('#exp-json').addEventListener('click', exportarJson);
  $('#exp-csv').addEventListener('click', exportarCsvHistorico);
  $('#exp-txt').addEventListener('click', exportarTxt);
  $('#exp-print').addEventListener('click', () => window.print());
  $('#history-clear').addEventListener('click', () => {
    historico = []; salvarHistorico(); renderHistorico();
  });
});
