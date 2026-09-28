'use strict';

/**
 * A fachada: fundir tres textos e receber um texto.
 *
 * A assinatura e a do `git merge-file`, e de proposito: os mesmos tres textos,
 * na mesma ordem -- o meu, a base, o seu --, os mesmos rotulos e o mesmo
 * criterio de codigo de saida, que e o numero de conflitos.
 */

const { fundir, temConflito, CONFLITO } = require('./fusao');
const { renderizar, emLinhas, emTexto } = require('./marcadores');

/**
 * Funde tres textos.
 *
 * @param {string} meu
 * @param {string} base
 * @param {string} seu
 * @param {{rotuloA?: string, rotuloBase?: string, rotuloB?: string,
 *          estilo?: 'normal'|'diff3'}} opcoes
 * @returns {{texto: string, conflitos: number, houveConflito: boolean}}
 */
function mergeFile(meu, base, seu, opcoes = {}) {
  const regioes = fundir(emLinhas(base), emLinhas(meu), emLinhas(seu), {
    zeloso: opcoes.estilo !== 'diff3',
  });
  const linhas = renderizar(regioes, opcoes);

  const conflitos = regioes.filter((regiao) => regiao.tipo === CONFLITO).length;

  return {
    texto: emTexto(linhas),
    conflitos,
    houveConflito: temConflito(regioes),
  };
}

module.exports = { mergeFile, fundir, renderizar, emLinhas, emTexto };
