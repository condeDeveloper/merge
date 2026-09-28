#!/usr/bin/env node

'use strict';

/**
 * O placar: quantos por cento dos casos saem byte a byte iguais aos do git.
 *
 *     node ferramentas/placar.js [quantos-por-corpus]
 *
 * Existe porque um numero vago nao serve para nada. "Funciona bem" nao diz se
 * uma mudanca melhorou ou piorou; "94,53% no corpus de quatro letras" diz, e
 * foi assim que cada decisao deste projeto foi tomada:
 *
 *   - guardar a quebra de linha **dentro** da linha: 87,3% -> 95,0%
 *   - traduzir o `xdl_change_compact` do xdiff fielmente: 91,6% -> 95,0%
 *   - partir o conflito em todo ponto de concordancia: 95,0% -> 94,0%, desfeito
 *
 * A terceira e a mais util das tres. Ela parecia obviamente certa, veio de ler
 * a documentacao do xdiff, e piorou -- e sem o placar teria entrado no codigo
 * com uma explicacao convincente do porque devia estar la.
 */

const { conferir, sorteador, trioSorteado, limpar } = require('../testes/juiz');

const distintas = Array.from({ length: 60 }, (_, i) => `linha numero ${i}`);

const CORPUS = [
  {
    nome: '4 letras',
    conta: 'quase toda linha se repete: empate em quase todo alinhamento',
    opcoes: { alfabeto: 'abcd' },
  },
  {
    nome: '7 letras',
    conta: 'ainda muito ambiguo',
    opcoes: { alfabeto: 'abcdefg' },
  },
  {
    nome: '20 letras',
    conta: 'repeticao ocasional',
    opcoes: { alfabeto: 'abcdefghijklmnopqrst' },
  },
  {
    nome: 'linhas distintas',
    conta: 'parecido com codigo de verdade',
    opcoes: { alfabeto: distintas, tamanho: 20 },
  },
  {
    nome: 'diff3',
    conta: 'com o ancestral dentro do conflito',
    opcoes: { alfabeto: 'abcde', opcoes: { estilo: 'diff3' } },
  },
];

function principal() {
  const quantos = Number(process.argv[2] || 500);

  console.log(`${quantos} trios por corpus, contra o git merge-file de verdade`);
  console.log();
  console.log('corpus'.padEnd(18) + 'bateram'.padStart(12) + '  '
    + 'limpas iguais'.padStart(14) + '  conta');
  console.log('-'.repeat(78));

  let totalOk = 0;
  let total = 0;

  const falhas = [];

  for (const corpus of CORPUS) {
    const proximo = sorteador(20260928);

    let bateram = 0;
    let limpas = 0;
    let limpasIguais = 0;

    for (let i = 0; i < quantos; i += 1) {
      const trio = trioSorteado(proximo, corpus.opcoes);
      const resultado = conferir(trio.meu, trio.base, trio.seu, corpus.opcoes.opcoes);

      if (resultado.bateu) {
        bateram += 1;
      } else if (falhas.length < 3) {
        falhas.push({ corpus: corpus.nome, ...resultado });
      }

      if (resultado.conflitosMeus === 0 && resultado.conflitosDele === 0) {
        limpas += 1;

        if (resultado.meu === resultado.dele) {
          limpasIguais += 1;
        }
      }
    }

    totalOk += bateram;
    total += quantos;

    const taxa = `${(100 * bateram / quantos).toFixed(2)}%`;

    console.log(corpus.nome.padEnd(18)
      + `${bateram}/${quantos}`.padStart(12) + '  '
      + `${limpasIguais}/${limpas}`.padStart(14)
      + `  ${corpus.conta}`);

    console.log(''.padEnd(18) + taxa.padStart(12));
  }

  console.log('-'.repeat(78));
  console.log(`total: ${totalOk}/${total} = ${(100 * totalOk / total).toFixed(2)}%`);

  if (falhas.length > 0) {
    console.log();
    console.log('as primeiras divergencias, para quem quiser olhar:');

    for (const falha of falhas) {
      console.log();
      console.log(`  [${falha.corpus}]`);
      console.log(`  base: ${JSON.stringify(falha.entrada.base)}`);
      console.log(`  meu:  ${JSON.stringify(falha.entrada.meu)}`);
      console.log(`  seu:  ${JSON.stringify(falha.entrada.seu)}`);
      console.log('  --- o git diz:');
      process.stdout.write(comRecuo(falha.dele));
      console.log('  --- eu digo:');
      process.stdout.write(comRecuo(falha.meu));
    }
  }

  limpar();
}

function comRecuo(texto) {
  return texto.split(/(?<=\n)/).map((linha) => `      ${linha}`).join('')
    + (texto.endsWith('\n') ? '' : '\n');
}

principal();
