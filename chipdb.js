/* =============================================================================
   chipdb.js — Identificação de fabricante e família de chip
   -----------------------------------------------------------------------------
   Duas fontes de identificação:

   1) BYTE DE FABRICANTE (1º byte do UID) — disponível em TODOS os caminhos
      (inclusive Web NFC). É o código de fabricante de circuito integrado
      registrado conforme ISO/IEC 7816-6. NÃO é palpite: é uma tabela publicada.
      A tabela abaixo é extensível — acrescente entradas conforme necessário.

   2) SAK / ATQA / ATS — disponível APENAS pelo caminho do leitor físico
      (WebUSB). O Web NFC NÃO expõe esses valores. São heurísticas conhecidas;
      a identificação definitiva de NTAG/Ultralight/DESFire vem do comando
      GET_VERSION, que só o leitor consegue emitir.
   ============================================================================= */

// --- 1) Códigos de fabricante de IC (ISO/IEC 7816-6) -------------------------
// Chave = byte (decimal). Cobre os fabricantes citados no escopo (NXP, Infineon,
// Fudan, ST, Sony, HID, ASK, TI, Broadcom, EM) e o restante da lista registrada.
export const FABRICANTES_IC = {
  0x01: 'Motorola',
  0x02: 'STMicroelectronics',
  0x03: 'Hitachi',
  0x04: 'NXP Semiconductors',
  0x05: 'Infineon Technologies',
  0x06: 'Cylink',
  0x07: 'Texas Instruments',
  0x08: 'Fujitsu',
  0x09: 'Matsushita Electronics',
  0x0a: 'NEC',
  0x0b: 'Oki Electric',
  0x0c: 'Toshiba',
  0x0d: 'Mitsubishi Electric',
  0x0e: 'Samsung Electronics',
  0x0f: 'Hynix',
  0x10: 'LG-Semiconductors',
  0x11: 'Emosyn-EM Microelectronics',
  0x12: 'INSIDE Technology',
  0x13: 'ORGA Kartensysteme',
  0x14: 'SHARP',
  0x15: 'ATMEL',
  0x16: 'EM Microelectronic-Marin',
  0x17: 'SMARTRAC TECHNOLOGY',
  0x18: 'ZMD',
  0x19: 'XICOR',
  0x1a: 'Sony',
  0x1b: 'Malaysia Microelectronic Solutions',
  0x1c: 'Emosyn',
  0x1d: 'Shanghai Fudan Microelectronics',
  0x1e: 'Magellan Technology',
  0x1f: 'Melexis',
  0x20: 'Renesas Technology',
  0x21: 'TAGSYS',
  0x22: 'Transcore',
  0x23: 'Shanghai Belling',
  0x24: 'Masktech Germany',
  0x25: 'Innovision R&T',
  0x26: 'Hitachi ULSI Systems',
  0x27: 'Yubico',
  0x28: 'Ricoh',
  0x29: 'ASK',
  0x2a: 'Unicore Microsystems',
  0x2b: 'Dallas Semiconductor / Maxim',
  0x2c: 'Impinj',
  0x2d: 'RightPlug Alliance',
  0x2e: 'Broadcom',
  0x2f: 'MStar Semiconductor',
  0x30: 'BeeDar Technology',
  0x31: 'RFIDsec',
  0x32: 'Schweizer Electronic',
  0x33: 'AMIC Technology',
  0x34: 'Mikron JSC',
  0x35: 'Fraunhofer Institute',
  0x36: 'IDS Microchip',
  0x37: 'Thinfilm (Kovio)',
  0x38: 'HMT Microelectronic',
  0x39: 'Silicon Craft Technology',
  0x3a: 'Advanced Film Device',
  0x3b: 'Nitecrest',
  0x3c: 'Verayo',
  0x3d: 'HID Global',
  0x3e: 'Productivity Engineering',
  0x3f: 'Austriamicrosystems (ams)',
  0x40: 'Gemalto',
  0x41: 'Renesas Electronics',
  0x42: '3Alogics',
  0x43: 'Top TroniQ Asia',
  0x44: 'Gentag',
};

// --- 2) SAK → família (heurística; só via leitor) ----------------------------
export const SAK_FAMILIA = {
  0x00: { familia: 'MIFARE Ultralight / NTAG (Type 2)', iso14443_4: false },
  0x08: { familia: 'MIFARE Classic 1K', iso14443_4: false },
  0x09: { familia: 'MIFARE Classic Mini', iso14443_4: false },
  0x10: { familia: 'MIFARE Plus 2K (SL2)', iso14443_4: false },
  0x11: { familia: 'MIFARE Plus 4K (SL2)', iso14443_4: false },
  0x18: { familia: 'MIFARE Classic 4K', iso14443_4: false },
  0x20: { familia: 'ISO 14443-4 (DESFire / Plus SL3 / JCOP / SmartMX)', iso14443_4: true },
  0x28: { familia: 'SmartMX com MIFARE Classic 1K', iso14443_4: false },
  0x38: { familia: 'SmartMX com MIFARE Classic 4K', iso14443_4: false },
};

// --- 2b) ATQA conhecidos (heurística complementar) ---------------------------
export const ATQA_DICA = {
  0x0004: 'MIFARE Classic 1K (ou Plus 2K SL1)',
  0x0044: 'MIFARE Ultralight / NTAG',
  0x0002: 'MIFARE Classic 4K',
  0x0042: 'MIFARE Plus 4K SL1',
  0x0344: 'MIFARE DESFire',
  0x0048: 'SmartMX (emulação Classic)',
};

/**
 * Converte UID em string ("04:5a:1b") ou array de bytes para Uint8Array.
 */
export function uidParaBytes(uid) {
  if (uid instanceof Uint8Array) return uid;
  if (Array.isArray(uid)) return Uint8Array.from(uid);
  // string separada por ":", "-" ou espaços
  const limpa = String(uid).trim().split(/[:\s-]+/).filter(Boolean);
  return Uint8Array.from(limpa.map((h) => parseInt(h, 16)));
}

/**
 * Identifica o fabricante a partir do 1º byte do UID.
 * Trata o caso de UID aleatório (RID), que não identifica fabricante.
 */
export function fabricantePeloUid(uid) {
  const bytes = uidParaBytes(uid);
  if (!bytes.length) return { nome: 'Desconhecido', byte: null, aleatorio: false };

  const b0 = bytes[0];
  // UID de 4 bytes começando em 0x08 => UID aleatório (RID) por convenção ISO 14443-3.
  const aleatorio = bytes.length === 4 && b0 === 0x08;
  if (aleatorio) {
    return { nome: 'UID aleatório (RID) — não identifica fabricante', byte: b0, aleatorio: true };
  }
  return {
    nome: FABRICANTES_IC[b0] || `Não catalogado (0x${b0.toString(16).padStart(2, '0')})`,
    byte: b0,
    aleatorio: false,
  };
}

/**
 * Monta o perfil de identificação do chip combinando o que estiver disponível.
 * - Com apenas UID (Web NFC): fabricante + observação.
 * - Com SAK/ATQA (leitor): + família e se é ISO 14443-4.
 *
 * @param {object} dados { uid, sak, atqa, ats }
 * @returns {object} { fabricante, familia, iso14443_4, observacoes[] }
 */
export function identificarChip(dados = {}) {
  const obs = [];
  const fab = fabricantePeloUid(dados.uid || []);

  let familia = null;
  let iso14443_4 = null;

  if (typeof dados.sak === 'number') {
    const m = SAK_FAMILIA[dados.sak];
    if (m) {
      familia = m.familia;
      iso14443_4 = m.iso14443_4;
    } else {
      familia = `SAK 0x${dados.sak.toString(16).padStart(2, '0')} (não mapeado)`;
    }
  }

  if (typeof dados.atqa === 'number' && ATQA_DICA[dados.atqa]) {
    obs.push(`ATQA sugere: ${ATQA_DICA[dados.atqa]}`);
  }

  if (familia === null && typeof dados.sak !== 'number') {
    obs.push('Família e estrutura de memória exigem o caminho do leitor físico (SAK/ATQA/GET_VERSION).');
  }
  if (iso14443_4) {
    obs.push('Cartão ISO 14443-4: identificação fina via APDU GET_VERSION.');
  }

  return {
    fabricante: fab.nome,
    fabricanteByte: fab.byte,
    uidAleatorio: fab.aleatorio,
    familia,
    iso14443_4,
    observacoes: obs,
  };
}
