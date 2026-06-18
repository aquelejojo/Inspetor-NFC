/* =============================================================================
   nfc-web.js — Leitura via Web NFC (Android / Chrome)
   -----------------------------------------------------------------------------
   Entrega UID (serialNumber) + registros NDEF parseados. Lembre-se: esta API
   NÃO expõe ATQA/SAK/ATS nem leitura de setor — é só NDEF + UID.
   A chamada scan() PRECISA ser disparada por um gesto do usuário (clique).
   ============================================================================= */

import { decodificarRegistrosWebNfc } from './ndef.js';

let leitorAtivo = null;
let controleAborto = null;

/**
 * Inicia a varredura. Chama os callbacks quando uma tag é lida ou em erro.
 * @param {object} cb { aoLer(resultado), aoErro(erro), aoIniciar() }
 */
export async function iniciarVarredura(cb) {
  if (!('NDEFReader' in window)) {
    cb.aoErro?.(new Error('Web NFC indisponível neste navegador.'));
    return;
  }

  try {
    leitorAtivo = new NDEFReader();
    controleAborto = new AbortController();

    await leitorAtivo.scan({ signal: controleAborto.signal });
    cb.aoIniciar?.();

    leitorAtivo.onreading = (evento) => {
      const { message, serialNumber } = evento;
      const registros = decodificarRegistrosWebNfc(message.records || []);
      cb.aoLer?.({
        fonte: 'web-nfc',
        momento: new Date().toISOString(),
        uid: serialNumber || null,        // ex.: "04:5a:1b:2c"
        sak: null, atqa: null, ats: null, // indisponíveis no Web NFC
        ndef: registros,
        memoria: null,                    // leitura de bloco indisponível
      });
    };

    leitorAtivo.onreadingerror = () => {
      cb.aoErro?.(new Error('Não foi possível ler a tag. Reposicione e tente de novo.'));
    };
  } catch (e) {
    // Erros comuns: permissão negada (NotAllowedError), sem hardware NFC, etc.
    cb.aoErro?.(traduzirErro(e));
  }
}

export function pararVarredura() {
  try { controleAborto?.abort(); } catch { /* ok */ }
  leitorAtivo = null;
  controleAborto = null;
}

function traduzirErro(e) {
  const nome = e?.name || '';
  if (nome === 'NotAllowedError') return new Error('Permissão de NFC negada. Autorize o acesso e verifique se o NFC do aparelho está ligado.');
  if (nome === 'NotSupportedError') return new Error('Este aparelho não possui hardware NFC compatível.');
  if (nome === 'NotReadableError') return new Error('O NFC está indisponível no momento (em uso por outro app?).');
  return e instanceof Error ? e : new Error(String(e));
}
