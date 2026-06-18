/* =============================================================================
   usb-acr122u.js — Caminho do leitor físico via WebUSB  [BETA]
   -----------------------------------------------------------------------------
   Este é o caminho que entrega o que o NFC do celular NÃO entrega: UID, ATQA,
   SAK, blocos e setores. Funciona em Chrome/Edge no desktop (Win/Linux/Mac).

   ⚠️ HONESTIDADE TÉCNICA: a CONEXÃO (abrir/clamar interface/achar endpoints) é
   código WebUSB padrão e seguro. A função transceive() está escrita conforme a
   especificação CCID + pseudo-APDUs do ACR122U, mas NÃO foi validada contra o
   hardware. Esta é a peça que vamos finalizar e testar juntos COM o leitor em
   mãos (a contagem de bSeq, os endpoints exatos e quirks do ACR122U precisam de
   verificação real). Tudo está protegido por try/catch para não derrubar o app.

   Conflito de driver no Linux: o pcscd costuma "segurar" o leitor. Para testar
   via WebUSB pode ser necessário parar o serviço (sudo systemctl stop pcscd) ou
   adicionar regra udev. No Windows, o leitor é exposto via WinUSB/Zadig conforme
   o caso. Documentaremos o procedimento exato na fase de testes.
   ============================================================================= */

// Leitores citados no escopo. Confirmado: ACR122U. Os demais são leitores PC/SC
// e exigem trabalho específico por modelo (e podem estar presos pelo serviço de
// smartcard do SO). Acrescente VID/PID conforme confirmarmos cada um.
export const LEITORES = [
  { nome: 'ACS ACR122U', vendorId: 0x072f, productId: 0x2200, confirmado: true },
  // { nome: 'Identiv uTrust 3700 F', vendorId: 0x04e6, productId: 0x5790, confirmado: false },
  // { nome: 'Bit4id miniLector AIR', vendorId: 0x????, productId: 0x????, confirmado: false },
  // { nome: 'RC700 (HID OMNIKEY?)',  vendorId: 0x????, productId: 0x????, confirmado: false },
];

// Pseudo-APDUs do ACR122U (PC/SC) — comandos padronizados:
export const APDU = {
  GET_UID: [0xff, 0xca, 0x00, 0x00, 0x00],                       // lê o UID
  // Carrega chave A/B no leitor (slot 0): FF 82 00 00 06 <6 bytes da chave>
  carregarChave: (chave6) => [0xff, 0x82, 0x00, 0x00, 0x06, ...chave6],
  // Autentica um bloco: FF 86 00 00 05 01 00 <bloco> <tipoChave 0x60=A/0x61=B> <slot>
  autenticar: (bloco, tipoChave = 0x60, slot = 0x00) =>
    [0xff, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, bloco, tipoChave, slot],
  // Lê 16 bytes de um bloco: FF B0 00 <bloco> 10
  lerBloco: (bloco) => [0xff, 0xb0, 0x00, bloco, 0x10],
  // Transmissão direta ao PN532 (p/ obter ATQA/SAK via InListPassiveTarget):
  //   FF 00 00 00 <Lc> <comando PN532...>
  direto: (cmdPn532) => [0xff, 0x00, 0x00, 0x00, cmdPn532.length, ...cmdPn532],
};

const CHAVE_PADRAO = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]; // chave de fábrica comum

let dispositivo = null;
let epOut = null;
let epIn = null;
let bSeq = 0;

/** Solicita ao usuário que escolha o leitor (precisa de gesto do usuário). */
export async function conectar() {
  if (!('usb' in navigator)) throw new Error('WebUSB indisponível neste navegador.');

  const filtros = LEITORES.map(({ vendorId, productId }) => ({ vendorId, productId }));
  dispositivo = await navigator.usb.requestDevice({ filters: filtros });

  await dispositivo.open();
  if (dispositivo.configuration === null) await dispositivo.selectConfiguration(1);

  // Encontra a interface CCID e seus endpoints bulk in/out.
  const intf = dispositivo.configuration.interfaces.find((i) =>
    i.alternates[0].endpoints.some((e) => e.type === 'bulk')
  ) || dispositivo.configuration.interfaces[0];

  await dispositivo.claimInterface(intf.interfaceNumber);

  for (const e of intf.alternates[0].endpoints) {
    if (e.type === 'bulk' && e.direction === 'out') epOut = e.endpointNumber;
    if (e.type === 'bulk' && e.direction === 'in') epIn = e.endpointNumber;
  }

  return {
    nome: dispositivo.productName || 'Leitor USB',
    fabricante: dispositivo.manufacturerName || '',
    interface: intf.interfaceNumber,
    epOut, epIn,
  };
}

export async function desconectar() {
  try { if (dispositivo) await dispositivo.close(); } catch { /* ok */ }
  dispositivo = null; epOut = null; epIn = null;
}

/**
 * Envia um APDU empacotado em CCID (PC_to_RDR_XfrBlock) e lê a resposta.
 * ⚠️ BETA — validar com o hardware.
 */
async function transceive(apduArray) {
  if (!dispositivo) throw new Error('Leitor não conectado.');
  const apdu = Uint8Array.from(apduArray);

  // Cabeçalho CCID (10 bytes): 6F | dwLength(4, LE) | bSlot | bSeq | bBWI | wLevel(2)
  const cab = new Uint8Array(10);
  cab[0] = 0x6f;
  new DataView(cab.buffer).setUint32(1, apdu.length, true);
  cab[5] = 0x00;
  cab[6] = bSeq++ & 0xff;

  const pacote = new Uint8Array(cab.length + apdu.length);
  pacote.set(cab, 0);
  pacote.set(apdu, cab.length);

  await dispositivo.transferOut(epOut, pacote);
  const resp = await dispositivo.transferIn(epIn, 256);
  const dados = new Uint8Array(resp.data.buffer);

  // Resposta RDR_to_PC_DataBlock: cabeçalho de 10 bytes + dados.
  if (dados.length <= 10) return new Uint8Array(0);
  return dados.slice(10);
}

/** Lê o UID via pseudo-APDU. Retorna { uid, status }. */
export async function lerUid() {
  const r = await transceive(APDU.GET_UID);
  // Resposta esperada: <UID...> 90 00
  const ok = r.length >= 2 && r[r.length - 2] === 0x90 && r[r.length - 1] === 0x00;
  const uidBytes = ok ? r.slice(0, r.length - 2) : r;
  return {
    uid: Array.from(uidBytes).map((b) => b.toString(16).padStart(2, '0')).join(':'),
    status: ok ? 'ok' : 'falha',
  };
}

/**
 * Tenta ler todos os blocos de um MIFARE Classic 1K (16 setores × 4 blocos)
 * usando a chave padrão. Setores que falharem a autenticação são marcados.
 * ⚠️ BETA — depende de transceive() validado e das chaves corretas do cartão.
 */
export async function lerClassic1k(chave = CHAVE_PADRAO) {
  await transceive(APDU.carregarChave(chave));
  const setores = [];
  for (let s = 0; s < 16; s++) {
    const blocoBase = s * 4;
    const auth = await transceive(APDU.autenticar(blocoBase, 0x60));
    const autenticou = auth.length >= 2 && auth[auth.length - 2] === 0x90;
    const blocos = [];
    if (autenticou) {
      for (let b = 0; b < 4; b++) {
        const dados = await transceive(APDU.lerBloco(blocoBase + b));
        blocos.push({
          bloco: blocoBase + b,
          hex: Array.from(dados.slice(0, 16)).map((x) => x.toString(16).padStart(2, '0')).join(' '),
        });
      }
    }
    setores.push({ setor: s, autenticou, blocos });
  }
  return setores;
}
