'use strict';

/**
 * A diferenca entre duas listas de linhas, pelo algoritmo de Myers.
 *
 * Ela nao e o produto deste projeto -- e o insumo. Uma fusao de tres vias
 * precisa saber, antes de mais nada, o que cada lado mudou em relacao ao
 * ancestral comum, e e isso que sai daqui.
 *
 * A pergunta ingenua seria "qual e a maior subsequencia comum?", e ela custa
 * uma tabela de N por M. Myers (1986) faz a pergunta ao contrario -- "qual e o
 * menor numero de edicoes?" -- e caminha por diagonais, o que custa
 * O((N+M)*D), com D sendo o tamanho da resposta. Em arquivo de verdade, D e
 * pequeno: tres linhas mudadas em dez mil saem num piscar.
 *
 * A saida e uma lista de trechos iguais, no formato (inicioA, inicioB,
 * tamanho), como o `get_matching_blocks` do difflib -- e o que resta entre dois
 * trechos iguais e, por definicao, o que mudou.
 */

/**
 * Os trechos iguais entre duas listas.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {{inicioA: number, inicioB: number, tamanho: number}[]}
 */
function trechosIguais(a, b) {
  const iguais = [];

  percorrer(a, 0, a.length, b, 0, b.length, iguais);

  // O trecho vazio no fim simplifica quem consome: sempre ha um ponto de
  // ancoragem no final das duas listas.
  iguais.push({ inicioA: a.length, inicioB: b.length, tamanho: 0 });

  return juntarVizinhos(iguais);
}

/**
 * Divide e conquista pelo "ponto do meio" de Myers.
 *
 * A ideia e a de 1986 e continua sendo a melhor: em vez de guardar a tabela
 * inteira para depois refazer o caminho, procura-se a diagonal em que os
 * caminhos vindos das duas pontas se encontram. Isso parte o problema em dois
 * pela metade e gasta espaco proporcional a N+M, e nao a N*M.
 */
function percorrer(a, inicioA, fimA, b, inicioB, fimB, saida) {
  // Apara as pontas iguais antes de qualquer coisa. E barato e resolve o caso
  // mais comum de todos: dois arquivos que so diferem no meio.
  let comecoIgual = 0;

  while (inicioA + comecoIgual < fimA && inicioB + comecoIgual < fimB
      && a[inicioA + comecoIgual] === b[inicioB + comecoIgual]) {
    comecoIgual += 1;
  }

  if (comecoIgual > 0) {
    saida.push({ inicioA, inicioB, tamanho: comecoIgual });

    inicioA += comecoIgual;
    inicioB += comecoIgual;
  }

  let fimIgual = 0;

  while (fimA - fimIgual > inicioA && fimB - fimIgual > inicioB
      && a[fimA - fimIgual - 1] === b[fimB - fimIgual - 1]) {
    fimIgual += 1;
  }

  const guardado = fimIgual > 0
    ? { inicioA: fimA - fimIgual, inicioB: fimB - fimIgual, tamanho: fimIgual }
    : null;

  fimA -= fimIgual;
  fimB -= fimIgual;

  if (inicioA < fimA && inicioB < fimB) {
    const meio = pontoDoMeio(a, inicioA, fimA, b, inicioB, fimB);

    percorrer(a, inicioA, meio.a, b, inicioB, meio.b, saida);
    percorrer(a, meio.a, fimA, b, meio.b, fimB, saida);
  }

  if (guardado) {
    saida.push(guardado);
  }
}

/**
 * Onde os caminhos da frente e de tras se encontram.
 *
 * O caminho da frente anda de (0,0) para (N,M); o de tras, ao contrario. Uma
 * posicao (x,y) do caminho de tras corresponde a (N-x, M-y) no de frente, e por
 * isso a diagonal k de um vira `delta - k` no outro. Trocar os dois indices e o
 * erro classico aqui, e ele nao da resposta errada: da recursao que nao anda.
 */
function pontoDoMeio(a, inicioA, fimA, b, inicioB, fimB) {
  const n = fimA - inicioA;
  const m = fimB - inicioB;
  const delta = n - m;
  const impar = (delta & 1) !== 0;
  const teto = Math.ceil((n + m) / 2);

  // Um deslocamento unico para indexar diagonais negativas num vetor comum.
  const desvio = n + m + 1;
  const largura = 2 * (n + m) + 3;

  const daFrente = new Int32Array(largura).fill(-1);
  const deTras = new Int32Array(largura).fill(-1);

  daFrente[desvio + 1] = 0;
  deTras[desvio + 1] = 0;

  for (let d = 0; d <= teto; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      let x;

      if (k === -d || (k !== d && daFrente[desvio + k - 1] < daFrente[desvio + k + 1])) {
        x = daFrente[desvio + k + 1];
      } else {
        x = daFrente[desvio + k - 1] + 1;
      }

      let y = x - k;

      while (x < n && y < m && a[inicioA + x] === b[inicioB + y]) {
        x += 1;
        y += 1;
      }

      daFrente[desvio + k] = x;

      if (impar) {
        const oposta = delta - k;

        if (oposta >= -(d - 1) && oposta <= d - 1
            && deTras[desvio + oposta] >= 0
            && x + deTras[desvio + oposta] >= n) {
          return { a: inicioA + x, b: inicioB + y };
        }
      }
    }

    for (let k = -d; k <= d; k += 2) {
      let x;

      if (k === -d || (k !== d && deTras[desvio + k - 1] < deTras[desvio + k + 1])) {
        x = deTras[desvio + k + 1];
      } else {
        x = deTras[desvio + k - 1] + 1;
      }

      let y = x - k;

      while (x < n && y < m && a[fimA - x - 1] === b[fimB - y - 1]) {
        x += 1;
        y += 1;
      }

      deTras[desvio + k] = x;

      if (!impar) {
        const oposta = delta - k;

        if (oposta >= -d && oposta <= d
            && daFrente[desvio + oposta] >= 0
            && daFrente[desvio + oposta] + x >= n) {
          return { a: fimA - x, b: fimB - y };
        }
      }
    }
  }

  throw new Error('os caminhos de Myers nao se encontraram: isto e um defeito');
}

function juntarVizinhos(iguais) {
  iguais.sort((x, y) => x.inicioA - y.inicioA || x.inicioB - y.inicioB);

  const saida = [];

  for (const trecho of iguais) {
    if (trecho.tamanho === 0 && saida.length > 0) {
      continue;
    }

    const ultimo = saida[saida.length - 1];

    if (ultimo && ultimo.inicioA + ultimo.tamanho === trecho.inicioA
        && ultimo.inicioB + ultimo.tamanho === trecho.inicioB) {
      ultimo.tamanho += trecho.tamanho;
      continue;
    }

    saida.push({ ...trecho });
  }

  if (saida.length === 0 || saida[saida.length - 1].tamanho !== 0) {
    saida.push({ inicioA: iguais[iguais.length - 1].inicioA, inicioB: iguais[iguais.length - 1].inicioB, tamanho: 0 });
  }

  return saida;
}

/**
 * As mudancas: o que ha entre dois trechos iguais.
 *
 * Cada mudanca e (inicioA, fimA, inicioB, fimB), meia-aberta nos dois lados.
 * Uma insercao tem inicioA igual a fimA; uma remocao, inicioB igual a fimB.
 */
function mudancas(a, b) {
  const iguais = trechosIguais(a, b);
  const saida = [];

  let posA = 0;
  let posB = 0;

  for (const trecho of iguais) {
    if (trecho.inicioA > posA || trecho.inicioB > posB) {
      saida.push({
        inicioA: posA,
        fimA: trecho.inicioA,
        inicioB: posB,
        fimB: trecho.inicioB,
      });
    }

    posA = trecho.inicioA + trecho.tamanho;
    posB = trecho.inicioB + trecho.tamanho;
  }

  if (posA < a.length || posB < b.length) {
    saida.push({ inicioA: posA, fimA: a.length, inicioB: posB, fimB: b.length });
  }

  return saida;
}

module.exports = { trechosIguais, mudancas };
