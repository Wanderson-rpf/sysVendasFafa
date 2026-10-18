// Inicia o Electron removendo ELECTRON_RUN_AS_NODE, que o terminal integrado do VS Code define
// e que faria o Electron rodar como Node puro (sem janela, e sem o módulo 'electron').
//
// Com --watch (usado pelo `npm start`): reinicia o Electron sempre que o processo principal for
// recompilado em dist-electron/. O Angular já recarrega sozinho; o processo principal não.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');

const watch = process.argv.includes('--watch');
const args = process.argv.slice(2).filter((a) => a !== '--watch');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let filho = null;
let reiniciando = false;

function iniciar() {
  filho = spawn(electron, ['.', ...args], { stdio: 'inherit', env });
  filho.on('close', (code) => {
    if (reiniciando) {
      reiniciando = false;
      iniciar();
    } else {
      // Janela fechada pelo usuário: encerra o script (e, no npm start, o ng serve junto).
      process.exit(code ?? 0);
    }
  });
}

iniciar();

if (watch) {
  const pasta = path.join(__dirname, '..', 'dist-electron');
  let timer = null;
  fs.watch(pasta, { recursive: true }, (_evento, arquivo) => {
    if (!arquivo || !arquivo.endsWith('.js')) return;
    // O tsc grava vários arquivos de uma vez: espera a rajada terminar antes de reiniciar.
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`\n[electron] ${arquivo} mudou — reiniciando o processo principal...\n`);
      reiniciando = true;
      filho.kill();
    }, 400);
  });
}
