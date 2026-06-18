/* =============================================================================
   ndef.js — Decodificador NDEF
   -----------------------------------------------------------------------------
   Dois modos:
   - decodificarRegistrosWebNfc(records): recebe os NDEFRecord já parseados pela
     API Web NFC (Android/Chrome).
   - decodificarBytesNdef(bytes): parser cru de uma mensagem NDEF (caminho do
     leitor físico, que entrega bytes). O formato do registro NDEF é fixo e
     bem definido (NFC Forum).
   ============================================================================= */

// Tabela de prefixos de URI (NFC Forum URI RTD)
const PREFIXOS_URI = [
  '', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:',
  'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://',
  'nfs://', 'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://',
  'urn:', 'pop:', 'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://',
  'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:',
  'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

function bytesParaHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

function dataViewParaUint8(dv) {
  if (dv instanceof Uint8Array) return dv;
  if (dv instanceof ArrayBuffer) return new Uint8Array(dv);
  if (dv && dv.buffer) return new Uint8Array(dv.buffer, dv.byteOffset || 0, dv.byteLength);
  return new Uint8Array(0);
}

// --- Decodificação de um payload WiFi (WSC TLV) ------------------------------
function decodificarWifi(bytes) {
  const campos = {};
  let i = 0;
  while (i + 4 <= bytes.length) {
    const tipo = (bytes[i] << 8) | bytes[i + 1];
    const tam = (bytes[i + 2] << 8) | bytes[i + 3];
    const val = bytes.slice(i + 4, i + 4 + tam);
    if (tipo === 0x1045) campos.ssid = new TextDecoder().decode(val);
    else if (tipo === 0x1027) campos.senha = new TextDecoder().decode(val);
    else if (tipo === 0x1003) campos.autenticacao = '0x' + bytesParaHex(val).replace(/ /g, '');
    else if (tipo === 0x100f) campos.criptografia = '0x' + bytesParaHex(val).replace(/ /g, '');
    i += 4 + tam;
  }
  return campos;
}

/**
 * Decodifica registros já parseados pela API Web NFC.
 * Cada record tem: recordType, mediaType, encoding, lang, data (DataView).
 */
export function decodificarRegistrosWebNfc(records) {
  return records.map((rec) => decodificarUm(rec));
}

function decodificarUm(rec) {
  const tipo = rec.recordType;
  const bytes = dataViewParaUint8(rec.data);

  const base = { tipo, hex: bytesParaHex(bytes), tamanho: bytes.length };

  try {
    if (tipo === 'text') {
      const dec = new TextDecoder(rec.encoding || 'utf-8');
      return { ...base, rotulo: 'Texto', idioma: rec.lang || '?', valor: dec.decode(bytes) };
    }
    if (tipo === 'url' || tipo === 'absolute-url') {
      return { ...base, rotulo: 'URL', valor: new TextDecoder().decode(bytes) };
    }
    if (tipo === 'mime') {
      const mt = (rec.mediaType || '').toLowerCase();
      if (mt.includes('wsc') || mt.includes('wifi')) {
        return { ...base, rotulo: 'WiFi', mediaType: rec.mediaType, valor: decodificarWifi(bytes) };
      }
      if (mt.includes('vcard') || mt.includes('x-vcard')) {
        return { ...base, rotulo: 'vCard', mediaType: rec.mediaType, valor: new TextDecoder().decode(bytes) };
      }
      // MIME genérico: tenta texto, senão hex
      let txt = '';
      try { txt = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { txt = null; }
      return { ...base, rotulo: 'MIME', mediaType: rec.mediaType, valor: txt };
    }
    if (tipo === 'smart-poster') {
      // Smart Poster contém uma mensagem NDEF aninhada.
      const aninhados = typeof rec.toRecords === 'function'
        ? decodificarRegistrosWebNfc(rec.toRecords())
        : [];
      return { ...base, rotulo: 'Smart Poster', valor: aninhados };
    }
    if (tipo === 'empty') {
      return { ...base, rotulo: 'Vazio', valor: '(sem conteúdo)' };
    }
    // Tipo externo ou desconhecido
    return { ...base, rotulo: tipo || 'Desconhecido', mediaType: rec.mediaType, valor: null };
  } catch (e) {
    return { ...base, rotulo: tipo || 'Erro', erro: String(e), valor: null };
  }
}

/**
 * Parser cru de uma mensagem NDEF a partir de bytes (caminho do leitor).
 * Formato do registro NDEF (NFC Forum):
 *   byte0: MB ME CF SR IL TNF(3 bits)
 *   type length (1 byte)
 *   payload length (1 byte se SR, senão 4 bytes big-endian)
 *   id length (1 byte, só se IL)
 *   type, id, payload
 */
export function decodificarBytesNdef(bytes) {
  const registros = [];
  let i = 0;
  while (i < bytes.length) {
    const cabecalho = bytes[i++];
    const me = !!(cabecalho & 0x40);
    const sr = !!(cabecalho & 0x10);
    const il = !!(cabecalho & 0x08);
    const tnf = cabecalho & 0x07;

    const tamTipo = bytes[i++];
    let tamPayload;
    if (sr) {
      tamPayload = bytes[i++];
    } else {
      tamPayload = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
      i += 4;
    }
    const tamId = il ? bytes[i++] : 0;
    const tipo = bytes.slice(i, i + tamTipo); i += tamTipo;
    const id = bytes.slice(i, i + tamId); i += tamId;
    const payload = bytes.slice(i, i + tamPayload); i += tamPayload;

    registros.push(interpretarBruto(tnf, tipo, payload));
    if (me) break;
  }
  return registros;
}

function interpretarBruto(tnf, tipo, payload) {
  const tipoStr = new TextDecoder().decode(tipo);
  const base = { tnf, tipoStr, hex: bytesParaHex(payload), tamanho: payload.length };

  // TNF 1 = Well Known; "T" texto, "U" URI
  if (tnf === 1 && tipoStr === 'T') {
    const status = payload[0];
    const tamLang = status & 0x3f;
    const utf16 = !!(status & 0x80);
    const idioma = new TextDecoder().decode(payload.slice(1, 1 + tamLang));
    const texto = new TextDecoder(utf16 ? 'utf-16' : 'utf-8').decode(payload.slice(1 + tamLang));
    return { ...base, rotulo: 'Texto', idioma, valor: texto };
  }
  if (tnf === 1 && tipoStr === 'U') {
    const prefixo = PREFIXOS_URI[payload[0]] || '';
    const resto = new TextDecoder().decode(payload.slice(1));
    return { ...base, rotulo: 'URL', valor: prefixo + resto };
  }
  // TNF 2 = MIME
  if (tnf === 2) {
    return { ...base, rotulo: 'MIME', mediaType: tipoStr, valor: null };
  }
  return { ...base, rotulo: tipoStr || 'Desconhecido', valor: null };
}
