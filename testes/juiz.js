'use strict';

/**
 * O juiz: o `git merge-file` de verdade.
 *
 * Nao e uma lista de expectativas que eu escrevi -- e o programa que o mundo
 * inteiro usa, rodando de verdade, com os mesmos tres arquivos. A comparacao e
 * byte a byte, inclusive os marcadores, inclusive os rotulos, inclusive a
 * quebra de linha do fim.
 *
 * E o unico jeito honesto de testar isto. Uma fusao de tres vias tem dezenas de
 * decisoes pequenas -- onde um conflito comeca, ate onde ele vai, se duas
 * mudancas coladas viram uma ou duas, o que acontece quando os dois lados
 * apagam o mesmo trecho -- e para cada uma delas ha uma resposta plausivel que
 * nao e a do git. Testar contra as minhas proprias expectativas so provaria que
 * eu sou consistente comigo mesmo.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { mergeFile } = require('../lib');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-juiz-'));

let contador = 0;

/**
 * Roda o `git merge-file` de verdade e devolve saida e codigo.
 *
 * @returns {{texto: string, codigo: number}}
 */
function gitMergeFile(meu, base, seu, opcoes = {}) {
  contador += 1;

  const caminhoMeu = path.join(pasta, `m${contador}`);
  const caminhoBase = path.join(pasta, `o${contador}`);
  const caminhoSeu = path.join(pasta, `s${contador}`);

  fs.writeFileSync(caminhoMeu, meu);
  fs.writeFileSync(caminhoBase, base);
  fs.writeFileSync(caminhoSeu, seu);

  const argumentos = ['merge-file', '-p'];

  if (opcoes.estilo === 'diff3') {
    argumentos.push('--diff3');
  }

  argumentos.push('-L', opcoes.rotuloA ?? 'meu');
  argumentos.push('-L', opcoes.rotuloBase ?? 'base');
  argumentos.push('-L', opcoes.rotuloB ?? 'seu');

  argumentos.push(caminhoMeu, caminhoBase, caminhoSeu);

  let texto;
  let codigo = 0;

  try {
    texto = execFileSync('git', argumentos, { encoding: 'utf8' });
  } catch (erro) {
    // O git sai com o numero de conflitos, e um numero positivo faz o
    // execFileSync lancar. O texto vem do mesmo jeito.
    texto = erro.stdout;
    codigo = erro.status;

    if (texto === undefined) {
      throw erro;
    }
  }

  fs.unlinkSync(caminhoMeu);
  fs.unlinkSync(caminhoBase);
  fs.unlinkSync(caminhoSeu);

  return { texto, codigo };
}

/**
 * Compara a minha fusao com a do git e devolve o que nao bateu.
 *
 * @returns {{bateu: boolean, meu: string, dele: string, entrada: object}}
 */
function conferir(meu, base, seu, opcoes = {}) {
  const comOpcoes = {
    rotuloA: 'meu',
    rotuloBase: 'base',
    rotuloB: 'seu',
    ...opcoes,
  };

  const dele = gitMergeFile(meu, base, seu, comOpcoes);
  const oMeu = mergeFile(meu, base, seu, comOpcoes);

  return {
    bateu: oMeu.texto === dele.texto,
    meu: oMeu.texto,
    dele: dele.texto,
    conflitosMeus: oMeu.conflitos,
    conflitosDele: dele.codigo,
    entrada: { meu, base, seu, opcoes: comOpcoes },
  };
}

/** Um gerador de trios reproduzivel. */
function sorteador(semente) {
  let estado = semente >>> 0;

  return function proximo() {
    // xorshift32: reproduzivel entre maquinas, que e o que um teste precisa.
    estado ^= estado << 13;
    estado >>>= 0;
    estado ^= estado >>> 17;
    estado ^= estado << 5;
    estado >>>= 0;

    return estado / 0x100000000;
  };
}

/**
 * Um trio sorteado: uma base, e dois lados que a editam.
 *
 * As edicoes sao sorteadas em cima da base, e nao independentes -- e o que
 * produz casos realistas, com regioes que as vezes se cruzam e as vezes nao.
 */
function trioSorteado(proximo, opcoes = {}) {
  const alfabeto = opcoes.alfabeto || 'abcdefg';
  const tamanho = 1 + Math.floor(proximo() * (opcoes.tamanho || 14));

  const base = [];

  for (let i = 0; i < tamanho; i += 1) {
    base.push(alfabeto[Math.floor(proximo() * alfabeto.length)]);
  }

  return {
    base: base.join('\n') + (proximo() < 0.9 ? '\n' : ''),
    meu: editar(base, proximo, alfabeto).join('\n')
        + (proximo() < 0.9 ? '\n' : ''),
    seu: editar(base, proximo, alfabeto).join('\n')
        + (proximo() < 0.9 ? '\n' : ''),
  };
}

function editar(linhas, proximo, alfabeto) {
  const saida = linhas.slice();
  const quantas = Math.floor(proximo() * 4);

  for (let i = 0; i < quantas; i += 1) {
    const onde = Math.floor(proximo() * (saida.length + 1));
    const que = proximo();

    if (que < 0.4 && saida.length > 0) {
      saida.splice(onde % Math.max(1, saida.length), 1);
    } else if (que < 0.7) {
      saida.splice(onde, 0, alfabeto[Math.floor(proximo() * alfabeto.length)]);
    } else if (saida.length > 0) {
      saida[onde % saida.length] = alfabeto[Math.floor(proximo() * alfabeto.length)];
    }
  }

  return saida;
}

function limpar() {
  try {
    fs.rmSync(pasta, { recursive: true, force: true });
  } catch {
    // Nao ha o que fazer se a pasta temporaria nao sair.
  }
}

module.exports = { gitMergeFile, conferir, sorteador, trioSorteado, limpar };
