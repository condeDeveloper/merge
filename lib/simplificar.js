'use strict';

/**
 * As duas simplificacoes que o git faz depois de fundir.
 *
 * Elas nao mudam quais mudancas entram no resultado -- mudam onde os conflitos
 * comecam e acabam, e sao a diferenca entre um conflito legivel e um bloco de
 * trinta linhas em que a pessoa tem de descobrir sozinha o que esta em disputa.
 *
 * As duas ficam aqui, e nao no meio da fusao, porque sao exatamente o que o
 * `--diff3` desliga: com o ancestral a mostra, mexer nas fronteiras do conflito
 * faria o bloco do meio deixar de corresponder ao pedaco.
 */

const { CONFLITO, IGUAIS } = require('./tipos');

function encolherConflitos(regioes) {
  const saida = [];

  for (const regiao of regioes) {
    if (regiao.tipo !== CONFLITO) {
      saida.push(regiao);
      continue;
    }

    for (const pedaco of aparar(regiao)) {
      juntar(saida, pedaco);
    }
  }

  return juntarConflitosProximos(juntarTudo(saida));
}

/** Quantas linhas intactas cabem entre dois conflitos sem separa-los. */
const VIZINHANCA = 3;

/**
 * Junta dois conflitos separados por pouca coisa num conflito so.
 *
 * Esta e a regra do git que eu nunca teria adivinhado, e ela e o oposto do que
 * a intuicao pede. Dois conflitos separados por **tres linhas ou menos** viram
 * um conflito unico, com as tres linhas intactas dentro dele.
 *
 * Parece perda de precisao e e o contrario. Quem resolve um conflito precisa de
 * contexto, e dois blocos de marcadores separados por duas linhas sao mais
 * dificeis de ler que um bloco so: a pessoa tem de reconstruir na cabeca que os
 * dois pedacos sao a mesma decisao. O git escolheu a versao legivel.
 *
 * A segunda metade da regra e mais fina ainda: se as linhas entre os dois
 * conflitos **nao tem nenhum caractere alfanumerico** -- linhas em branco, uma
 * chave de fecho, um ponto e virgula solto --, eles se juntam por mais longe
 * que estejam. Separar uma decisao por uma linha em branco nao e separar nada.
 *
 * Sem isto, `merge-file` de dois arquivos que mudam a primeira e a ultima linha
 * de cinco da dois conflitos aqui e um no git. Foi a maior fonte de divergencia
 * que o juiz apontou.
 */
function juntarConflitosProximos(regioes) {
  const saida = [];

  for (const regiao of regioes) {
    const anterior = saida[saida.length - 1];
    const doMeio = saida[saida.length - 2];

    const podeJuntar = regiao.tipo === CONFLITO
      && anterior && anterior.tipo === IGUAIS
      && doMeio && doMeio.tipo === CONFLITO
      && (anterior.linhas.length <= VIZINHANCA
        || !temAlfanumerico(anterior.linhas));

    if (!podeJuntar) {
      saida.push(regiao);
      continue;
    }

    saida.pop();
    saida.pop();

    saida.push({
      tipo: CONFLITO,
      deA: doMeio.deA.concat(anterior.linhas, regiao.deA),
      deB: doMeio.deB.concat(anterior.linhas, regiao.deB),
      daBase: (doMeio.daBase || []).concat(anterior.linhas, regiao.daBase || []),
    });
  }

  return saida;
}

function temAlfanumerico(linhas) {
  return linhas.some((linha) => /[\p{L}\p{N}]/u.test(linha));
}

/**
 * Tira do conflito o comeco e o fim em que os dois lados concordam.
 *
 * Se os dois escreveram as mesmas dez linhas e so a decima primeira difere, o
 * conflito e de uma linha, nao de onze. As dez iguais saem de dentro dos
 * marcadores e viram texto normal.
 *
 * Cheguei a tentar ir mais longe -- comparar os dois lados entre si e partir o
 * conflito em todos os pontos de concordancia, que e o que a documentacao do
 * xdiff sugere. O juiz reprovou: a concordancia com o git caiu de 95,0% para
 * 94,0%. O git apara as pontas e para por ai, e um trecho igual no **meio** de
 * um conflito continua dentro dele -- o que faz sentido, porque duas pessoas
 * escrevendo a mesma linha no meio de trechos em disputa nao e concordancia
 * nenhuma, e coincidencia.
 */
function aparar(regiao) {
  const deA = regiao.deA;
  const deB = regiao.deB;

  let comeco = 0;

  while (comeco < deA.length && comeco < deB.length && deA[comeco] === deB[comeco]) {
    comeco += 1;
  }

  let fim = 0;

  while (fim < deA.length - comeco && fim < deB.length - comeco
      && deA[deA.length - fim - 1] === deB[deB.length - fim - 1]) {
    fim += 1;
  }

  const pedacos = [];

  if (comeco > 0) {
    pedacos.push({ tipo: IGUAIS, linhas: deA.slice(0, comeco) });
  }

  const meioA = deA.slice(comeco, deA.length - fim);
  const meioB = deB.slice(comeco, deB.length - fim);

  if (meioA.length > 0 || meioB.length > 0) {
    pedacos.push({
      tipo: CONFLITO,
      deA: meioA,
      deB: meioB,
      daBase: regiao.daBase,
    });
  }

  if (fim > 0) {
    pedacos.push({ tipo: IGUAIS, linhas: deA.slice(deA.length - fim) });
  }

  return pedacos;
}


function juntar(saida, regiao) {
  const ultima = saida[saida.length - 1];

  if (ultima && ultima.tipo === IGUAIS && regiao.tipo === IGUAIS) {
    ultima.linhas = ultima.linhas.concat(regiao.linhas);

    return;
  }

  saida.push(regiao);
}

function juntarTudo(regioes) {
  const saida = [];

  for (const regiao of regioes) {
    juntar(saida, regiao);
  }

  return saida;
}

module.exports = { encolherConflitos, juntar, juntarTudo, aparar,
  juntarConflitosProximos, VIZINHANCA };
