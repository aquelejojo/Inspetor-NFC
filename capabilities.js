/* =============================================================================
   capabilities.js — Detecção de capacidade do dispositivo
   -----------------------------------------------------------------------------
   Decide qual caminho de leitura está disponível NESTE aparelho/navegador e
   devolve uma explicação honesta para o usuário. Nada de prometer o que o
   navegador não entrega.
   ============================================================================= */

export function detectarCapacidades() {
  const ua = navigator.userAgent || '';
  const ehIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS finge ser Mac
  const ehAndroid = /Android/.test(ua);
  const ehFirefox = /Firefox/.test(ua);

  const temWebNfc = 'NDEFReader' in window;
  const temWebUsb = 'usb' in navigator;
  const temWebSerial = 'serial' in navigator;
  const contextoSeguro = window.isSecureContext;

  // Caminho primário recomendado para este ambiente
  let metodo = 'nenhum';
  if (temWebNfc) metodo = 'web-nfc';
  else if (temWebUsb) metodo = 'usb';

  return {
    ehIOS, ehAndroid, ehFirefox,
    temWebNfc, temWebUsb, temWebSerial, contextoSeguro,
    metodo,
    mensagem: montarMensagem({ ehIOS, ehAndroid, ehFirefox, temWebNfc, temWebUsb, contextoSeguro }),
  };
}

function montarMensagem(c) {
  if (!c.contextoSeguro) {
    return {
      nivel: 'erro',
      titulo: 'Contexto não seguro',
      texto: 'O acesso a NFC e USB exige HTTPS. Sirva a página por https:// (ex.: GitHub Pages) ou por localhost.',
    };
  }
  if (c.temWebNfc) {
    return {
      nivel: 'ok',
      titulo: 'Web NFC disponível',
      texto: 'Leitura pelo NFC do aparelho: UID e conteúdo NDEF. Leitura de setor/bloco exige leitor físico no desktop.',
    };
  }
  if (c.temWebUsb) {
    return {
      nivel: 'ok',
      titulo: 'WebUSB disponível',
      texto: 'Conecte um leitor físico (ex.: ACR122U) para ler UID, ATQA, SAK, blocos e setores.',
    };
  }
  if (c.ehIOS) {
    return {
      nivel: 'erro',
      titulo: 'iPhone/iPad não suportado',
      texto: 'O Safari e todos os navegadores do iOS não dão acesso a NFC por página web. Use um Android com Chrome ou um desktop com leitor USB.',
    };
  }
  if (c.ehFirefox) {
    return {
      nivel: 'erro',
      titulo: 'Firefox não suportado',
      texto: 'O Firefox não implementa Web NFC nem WebUSB. Use Chrome ou Edge.',
    };
  }
  return {
    nivel: 'erro',
    titulo: 'Sem método de leitura',
    texto: 'Este navegador não expõe Web NFC nem WebUSB. No Android use Chrome; no desktop use Chrome/Edge com um leitor USB.',
  };
}
