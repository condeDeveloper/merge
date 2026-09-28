#!/usr/bin/env node

'use strict';

/**
 * Mostra a fusao por dentro: que regiao e de quem, e por que.
 *
 *     node ferramentas/explicar.js meu base seu
 *
 * A saida de um `merge` diz **o que** ficou. Esta diz **por que**: cada linha do
 * resultado vem marcada com o caso em que ela caiu, e os quatro casos sao o
 * algoritmo inteiro.
 *
 * Foi escrita para depurar e ficou porque explica melhor que qualquer texto. A
 * primeira vez que eu vi uma regiao marcada "os dois fizeram o mesmo" foi a
 * primeira vez que eu entendi por que um `cherry-pick` do mesmo commit nos dois
 * ramos nao da conflito.
 */

const fs = require('node:fs');

const { fundir } = require('../lib/fusao');
const { emLinhas } = require('../lib/marcadores');
const { CONFLITO, IGUAIS, SO_A, SO_B } = require('../lib/tipos');

const EXPLICACAO = {
  [IGUAIS]: 'ninguem mexeu, ou os dois fizeram o mesmo',
  [SO_A]: 'so o lado A mudou: fica a versao dele',
  [SO_B]: 'so o lado B mudou: fica a versao dele',
  [CONFLITO]: 'os dois mudaram, e diferente',
};

const MARCA = {
  [IGUAIS]: '   ',
  [SO_A]: ' A ',
  [SO_B]: ' B ',
  [CONFLITO]: ' ! ',
};

function principal(argumentos) {
  if (argumentos.length !== 3) {
    process.stderr.write('uso: explicar.js meu base seu\n');

    return 1;
  }

  const [meu, base, seu] = argumentos.map((caminho) => fs.readFileSync(caminho, 'utf8'));

  const regioes = fundir(emLinhas(base), emLinhas(meu), emLinhas(seu));

  const contagem = { [IGUAIS]: 0, [SO_A]: 0, [SO_B]: 0, [CONFLITO]: 0 };

  console.log(`${regioes.length} regiao(oes)`);
  console.log();

  let numero = 0;

  for (const regiao of regioes) {
    contagem[regiao.tipo] += 1;
    numero += 1;

    console.log(`${MARCA[regiao.tipo]} regiao ${numero}: ${EXPLICACAO[regiao.tipo]}`);

    if (regiao.tipo === CONFLITO) {
      mostrar('     A dizia', regiao.deA);
      mostrar('     a base tinha', regiao.daBase || []);
      mostrar('     B dizia', regiao.deB);
    } else {
      mostrar('    ', regiao.linhas);
    }

    console.log();
  }

  console.log('-'.repeat(60));

  for (const [tipo, quantas] of Object.entries(contagem)) {
    if (quantas > 0) {
      console.log(`${MARCA[tipo]} ${String(quantas).padStart(3)}  ${EXPLICACAO[tipo]}`);
    }
  }

  return contagem[CONFLITO] > 0 ? 1 : 0;
}

function mostrar(rotulo, linhas) {
  if (linhas.length === 0) {
    console.log(`${rotulo}: (nada)`);

    return;
  }

  console.log(`${rotulo}:`);

  for (const linha of linhas) {
    process.stdout.write(`       | ${linha.endsWith('\n') ? linha : `${linha}\n`}`);
  }
}

process.exitCode = principal(process.argv.slice(2));
