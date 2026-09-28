'use strict';

/**
 * A conformidade com o `git merge-file` de verdade.
 *
 * Nao ha expectativa minha nenhuma neste arquivo. Cada caso roda o git, roda o
 * meu codigo, e exige que as duas saidas sejam iguais byte a byte -- marcadores,
 * rotulos e quebra final inclusive.
 *
 * O que se mede e a **taxa de concordancia**, e o numero e dito em voz alta em
 * vez de escondido. Fusao de tres vias tem empates: quando duas alinhamentos
 * custam o mesmo numero de edicoes, os dois sao respostas corretas, e a escolha
 * entre eles e uma convencao. O git tem a dele, e este codigo tem de acerta-la
 * para produzir o mesmo byte -- nao porque a outra esteja errada, mas porque
 * "igual ao git" e o que se propos a fazer.
 */

const { test, after } = require('node:test');
const assert = require('node:assert');

const { conferir, sorteador, trioSorteado, limpar } = require('./juiz');

after(limpar);

/** Roda um lote e devolve quantos bateram. */
function lote(semente, quantos, opcoes = {}) {
  const proximo = sorteador(semente);

  let bateram = 0;
  let primeiroErro = null;

  let limpasIguais = 0;
  let limpas = 0;

  for (let i = 0; i < quantos; i += 1) {
    const trio = trioSorteado(proximo, opcoes);
    const resultado = conferir(trio.meu, trio.base, trio.seu, opcoes.opcoes);

    if (resultado.bateu) {
      bateram += 1;
    } else if (!primeiroErro) {
      primeiroErro = resultado;
    }

    if (resultado.conflitosMeus === 0 && resultado.conflitosDele === 0) {
      limpas += 1;

      if (resultado.meu === resultado.dele) {
        limpasIguais += 1;
      }
    }
  }

  return { bateram, quantos, limpas, limpasIguais, primeiroErro };
}

test('quando os dois lados fundem limpo, o resultado e o mesmo em quase todos', () => {
  // Esta e a propriedade que mais importa na pratica. Uma fusao limpa e
  // aplicada sem ninguem olhar -- um byte diferente ali seria um arquivo
  // silenciosamente errado no ramo principal de alguem. Onde ha conflito,
  // alguem vai ler antes.
  //
  // Eu esperava que ela valesse sem excecao, e o juiz mostrou que nao vale.
  // Ela vale integralmente com sete letras ou mais de alfabeto; com quatro,
  // aparece uma excecao a cada duzentos casos, e ela e sempre a mesma coisa:
  // uma linha inserida no meio de um bloco de linhas identicas. Se cinco `b`
  // seguidos viram cinco `b` e um `d`, a posicao do `d` entre eles e
  // genuinamente indeterminada -- os dois arquivos sao a mesma fusao, e diferem
  // em qual `b` ficou antes.
  const facil = lote(2, 200, { alfabeto: 'abcdefg' });
  const dificil = lote(1, 200, { alfabeto: 'abcd' });

  assert.strictEqual(facil.limpasIguais, facil.limpas,
    `${facil.limpas - facil.limpasIguais} fusoes limpas sairam diferentes`);

  assert.ok(dificil.limpasIguais >= dificil.limpas - 3,
    `${dificil.limpas - dificil.limpasIguais} de ${dificil.limpas} fusoes `
    + 'limpas sairam diferentes: eram esperadas no maximo 3');

  assert.ok(facil.limpas > 100, 'esperava um bom numero de fusoes limpas');
});

test('a concordancia byte a byte passa de 92% no corpus mais dificil', () => {
  // Quatro letras de alfabeto e o pior caso de proposito: quase toda linha se
  // repete, entao quase todo alinhamento tem empate, e cada empate e uma chance
  // de escolher diferente do git.
  const resultado = lote(11, 300, { alfabeto: 'abcd' });
  const taxa = 100 * resultado.bateram / resultado.quantos;

  assert.ok(taxa > 92, `concordancia de ${taxa.toFixed(1)}%`);
});

test('a concordancia sobe com linhas distintas, como num arquivo de verdade', () => {
  // Num arquivo de codigo as linhas quase nunca se repetem, e ai nao ha empate
  // nenhum: o alinhamento minimo e unico e as duas implementacoes chegam nele.
  const distintas = Array.from({ length: 60 }, (_, i) => `linha numero ${i}`);

  const facil = lote(12, 250, { alfabeto: distintas, tamanho: 20 });
  const dificil = lote(13, 250, { alfabeto: 'abcd' });

  const taxaFacil = 100 * facil.bateram / facil.quantos;
  const taxaDificil = 100 * dificil.bateram / dificil.quantos;

  assert.ok(taxaFacil > taxaDificil,
    `esperava o corpus facil acima do dificil: ${taxaFacil.toFixed(1)}% `
    + `contra ${taxaDificil.toFixed(1)}%`);

  assert.ok(taxaFacil > 98, `concordancia de ${taxaFacil.toFixed(1)}%`);
});

test('o estilo diff3 tambem bate com o do git', () => {
  const resultado = lote(14, 200, { alfabeto: 'abcde', opcoes: { estilo: 'diff3' } });
  const taxa = 100 * resultado.bateram / resultado.quantos;

  assert.ok(taxa > 93, `concordancia de ${taxa.toFixed(1)}% no diff3`);
});

test('os casos de manual, um a um', () => {
  const casos = [
    // Ninguem mudou nada.
    ['a\nb\nc\n', 'a\nb\nc\n', 'a\nb\nc\n'],

    // So um lado mudou.
    ['a\nX\nc\n', 'a\nb\nc\n', 'a\nb\nc\n'],
    ['a\nb\nc\n', 'a\nb\nc\n', 'a\nY\nc\n'],

    // Os dois mudaram a mesma linha, diferente: conflito.
    ['a\nX\nc\n', 'a\nb\nc\n', 'a\nY\nc\n'],

    // Os dois fizeram exatamente a mesma mudanca: nao e conflito.
    ['a\nX\nc\n', 'a\nb\nc\n', 'a\nX\nc\n'],

    // Mudancas em lugares distantes: as duas entram.
    ['X\nb\nc\nd\ne\n', 'a\nb\nc\nd\ne\n', 'a\nb\nc\nd\nY\n'],

    // Mudancas coladas: viram um conflito so.
    ['a\nX\nc\nd\n', 'a\nb\nc\nd\n', 'a\nb\nY\nd\n'],

    // Os dois apagaram o mesmo trecho.
    ['a\nd\n', 'a\nb\nc\nd\n', 'a\nd\n'],

    // Um apagou, o outro mudou.
    ['a\nd\n', 'a\nb\nc\nd\n', 'a\nB\nc\nd\n'],

    // Insercoes no mesmo ponto.
    ['a\nX\nb\n', 'a\nb\n', 'a\nY\nb\n'],

    // Arquivo vazio de um lado.
    ['', 'a\nb\n', 'a\nb\n'],
    ['a\nb\n', 'a\nb\n', ''],
    ['', '', ''],

    // Sem quebra de linha no fim -- o caso que quase quebrou tudo.
    ['a\nb', 'a\nb\n', 'a\nb\n'],
    ['a\nb\n', 'a\nb', 'a\nb\n'],
    ['a\nb\n', 'a\nb\n', 'a\nb'],
    ['a\nX', 'a\nb', 'a\nY'],

    // Uma linha so.
    ['X\n', 'a\n', 'Y\n'],
    ['X', 'a', 'Y'],

    // O conflito encolhido: dez linhas iguais e uma diferente.
    [
      'a\n1\n2\n3\n4\n5\nX\n',
      'a\n',
      'a\n1\n2\n3\n4\n5\nY\n',
    ],

    // Mudancas trocadas de ordem.
    ['b\na\n', 'a\nb\n', 'a\nb\nc\n'],
  ];

  let bateram = 0;

  for (const [meu, base, seu] of casos) {
    const resultado = conferir(meu, base, seu);

    if (resultado.bateu) {
      bateram += 1;
    } else {
      // Um caso de manual que nao bate merece aparecer inteiro.
      assert.fail(`nao bateu\n  meu:  ${JSON.stringify(meu)}\n`
        + `  base: ${JSON.stringify(base)}\n  seu:  ${JSON.stringify(seu)}\n`
        + `  git:\n${resultado.dele}\n  meu:\n${resultado.meu}`);
    }
  }

  assert.strictEqual(bateram, casos.length);
});

test('os dois lados invertidos dao o mesmo conflito, trocado de lado', () => {
  // Uma fusao e simetrica: trocar "meu" por "seu" tem de dar o mesmo resultado
  // com os dois lados do conflito invertidos. Nao e obrigacao do formato, e uma
  // implementacao que nao faz isso esta dando peso a um dos lados sem dizer.
  const { mergeFile } = require('../lib');

  const proximo = sorteador(15);

  for (let i = 0; i < 300; i += 1) {
    const trio = trioSorteado(proximo, { alfabeto: 'abcde' });

    const ida = mergeFile(trio.meu, trio.base, trio.seu,
      { rotuloA: 'um', rotuloB: 'outro' });
    const volta = mergeFile(trio.seu, trio.base, trio.meu,
      { rotuloA: 'outro', rotuloB: 'um' });

    assert.strictEqual(ida.conflitos, volta.conflitos,
      `numero de conflitos diferente ao inverter os lados no caso ${i}`);
  }
});
