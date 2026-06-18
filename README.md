# Inspetor NFC

Ferramenta web para análise de tags NFC e chips RFID. Base de código única (PWA)
que detecta o aparelho e ativa o método de leitura disponível.

## Estrutura (tudo na raiz, sem subpastas)

```
index.html            página e marcação do scanner
styles.css            tema "instrumento de bancada"
app.js                orquestração da interface (ponto de entrada)
capabilities.js       detecção de capacidade do dispositivo
nfc-web.js            leitura via Web NFC (Android)
usb-acr122u.js        leitor físico via WebUSB  [BETA]
ndef.js               decodificador NDEF
chipdb.js             identificação de fabricante/família
icon.svg              ícone
manifest.webmanifest  PWA (permite instalar no Android)
README.md             este arquivo
```

Todos os arquivos ficam no mesmo nível. O `app.js` carrega os demais módulos
automaticamente (eles estão na mesma pasta, então funciona sem configuração).

## Publicar pelo site do GitHub (sem usar terminal)

1. Em github.com, clique em **New** (ou no `+` no topo) → crie um repositório
   com nome `inspetor-nfc` → marque **Public** → **Create repository**.
2. Na tela do repositório vazio, clique em **uploading an existing file**
   (ou **Add file → Upload files**).
3. Selecione **todos os arquivos** desta pasta (não a pasta em si — os arquivos
   soltos) e arraste para a área de upload. Como não há subpastas, nada precisa
   ser recriado.
4. Em baixo, escreva uma mensagem (ex.: "primeira versão") e clique em
   **Commit changes**.

### Ligar o GitHub Pages

5. No repositório: **Settings → Pages**.
6. Em **Source**, escolha **Deploy from a branch** → Branch **main**, pasta
   **/ (root)** → **Save**.
7. Aguarde ~1 minuto. A URL aparece no topo da mesma página:
   `https://<seu-usuario>.github.io/inspetor-nfc/`

### Atualizar depois

- **Editar um arquivo**: abra o arquivo no repositório → ícone de **lápis** →
  edite → **Commit changes**.
- **Trocar um arquivo inteiro**: **Add file → Upload files**, suba o arquivo com
  o mesmo nome (sobrescreve) → **Commit changes**.

## Teste local (opcional)

Não abra por `file://` (os módulos JS não carregam). Sirva por HTTP:

```bash
python3 -m http.server 8000
# abra http://localhost:8000  (localhost conta como contexto seguro)
```

Para testar a leitura NFC de verdade, use um **Android com Chrome** acessando a
URL do GitHub Pages, com o NFC do aparelho ligado.

## O que esta versão faz / não faz

Faz: detecção de capacidade; leitura Web NFC (UID + NDEF: Texto, URL, WiFi,
vCard, Smart Poster); identificação de fabricante pelo UID; visualização hex;
histórico; exportação JSON/CSV/TXT/PDF.

Limites do navegador (não do código): iPhone/iPad não acessam NFC por web; o
Web NFC só dá UID + NDEF (sem SAK/ATQA/ATS nem setor pelo celular); leitura de
setor/bloco só pelo leitor físico (WebUSB) em Chrome/Edge no desktop.

Beta: caminho do leitor ACR122U (WebUSB) conecta, mas a leitura de setores será
finalizada e validada com o leitor físico em mãos.

> Crédito de desenvolvedor: ajuste em `index.html` (`#credito`).
