'use strict';

/**
 * Transforma as regioes fundidas em texto, com os marcadores de conflito.
 *
 * Os marcadores sao de sete caracteres, e nao e arbitrario: sete e longo o
 * bastante para nao aparecer por acaso num arquivo, e curto o bastante para
 * caber na tela. Eles vem do RCS, de 1982, e sobreviveram intactos ao CVS, ao
 * Subversion e ao git.
 *
 *     <<<<<<< rotulo de um lado
 *     o que um lado escreveu
 *     =======
 *     o que o outro escreveu
 *     >>>>>>> rotulo do outro lado
 *
 * No estilo `diff3`, ha um terceiro bloco no meio com o ancestral comum,
 * separado por `|||||||`. Ele e mais util do que parece: sem ele, quem resolve
 * o conflito ve o que os dois querem e nao ve de onde os dois partiram, que
 * costuma ser a informacao que falta para decidir.
 */

const { CONFLITO, IGUAIS, SO_A, SO_B } = require('./tipos');

const MEU = '<<<<<<<';
const BASE = '|||||||';
const MEIO = '=======';
const SEU = '>>>>>>>';

/**
 * As regioes viradas em linhas de texto.
 *
 * @param {object[]} regioes
 * @param {{rotuloA?: string, rotuloBase?: string, rotuloB?: string,
 *          estilo?: 'normal'|'diff3'}} opcoes
 */
function renderizar(regioes, opcoes = {}) {
  const rotuloA = opcoes.rotuloA || '';
  const rotuloB = opcoes.rotuloB || '';
  const rotuloBase = opcoes.rotuloBase || '';
  const diff3 = opcoes.estilo === 'diff3';

  const saida = [];

  for (const regiao of regioes) {
    switch (regiao.tipo) {
      case IGUAIS:
      case SO_A:
      case SO_B:
        saida.push(...regiao.linhas);
        break;

      case CONFLITO:
        saida.push(comRotulo(MEU, rotuloA));
        saida.push(...regiao.deA);

        if (diff3) {
          saida.push(comRotulo(BASE, rotuloBase));
          saida.push(...(regiao.daBase || []));
        }

        saida.push(MEIO);
        saida.push(...regiao.deB);
        saida.push(comRotulo(SEU, rotuloB));
        break;

      default:
        throw new Error(`regiao de tipo desconhecido: ${regiao.tipo}`);
    }
  }

  return saida;
}

function comRotulo(marcador, rotulo) {
  return `${rotulo ? `${marcador} ${rotulo}` : marcador}\n`;
}

/**
 * Parte um texto em linhas, com a quebra de linha **dentro** de cada uma.
 *
 * Esta decisao parece de arrumacao e nao e: ela muda o resultado da fusao.
 *
 * Um arquivo que termina sem quebra de linha tem, na ultima posicao, uma linha
 * que nao e igual a mesma linha com quebra. O git enxerga assim -- para o
 * xdiff, a quebra faz parte do registro -- e por isso ele acusa conflito onde
 * um lado tirou a quebra final e o outro mexeu ali perto.
 *
 * Guardando a quebra fora da linha, as duas viram a mesma coisa, a fusao sai
 * limpa, e o resultado difere do git em um byte. Foi o juiz que apontou: 51 de
 * 400 trios sorteados nao batiam, e quase todos eram este caso.
 */
function emLinhas(texto) {
  if (texto === '') {
    return [];
  }

  // O `(?<=\n)` parte **depois** da quebra, e nao no lugar dela.
  return texto.split(/(?<=\n)/);
}

/**
 * O caminho de volta.
 *
 * A unica esperteza esta aqui: se uma linha sem quebra ficou no meio do
 * resultado -- porque veio do fim de um dos lados e outra coisa foi escrita
 * depois dela --, ela ganha a quebra. Sem isso, o marcador de conflito
 * acabaria colado no texto, o que nem o git faz nem seria legivel.
 */
function emTexto(linhas) {
  return linhas
    .map((linha, i) => (i < linhas.length - 1 && !linha.endsWith('\n')
      ? `${linha}\n`
      : linha))
    .join('');
}

module.exports = { renderizar, emLinhas, emTexto, MEU, BASE, MEIO, SEU };
