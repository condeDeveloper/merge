'use strict';

/**
 * A fusao de tres vias: o que o `git merge` faz por dentro.
 *
 * Duas pessoas partiram do mesmo arquivo e mudaram coisas. A pergunta e:
 * juntar as duas versoes, ficando com as duas mudancas, e reclamar so onde as
 * duas mexeram no mesmo lugar.
 *
 * O que torna isso possivel e o **ancestral comum**. Comparar so as duas
 * versoes finais nao basta: duas linhas diferentes podem ser "eu mudei e voce
 * nao" ou "voce mudou e eu nao", e sem o ponto de partida nao da para saber
 * qual. Com ele, cada regiao cai num de quatro casos:
 *
 *   so o lado A mudou       fica a versao de A
 *   so o lado B mudou       fica a versao de B
 *   os dois fizeram o mesmo fica uma copia so
 *   os dois, diferente      conflito
 *
 * E so isso. A fusao de tres vias e um dos algoritmos mais influentes da
 * historia do software -- e por causa dela que duas pessoas conseguem mexer no
 * mesmo arquivo -- e cabe em duas telas.
 *
 * O trabalho de verdade esta em dois lugares menos obvios: agrupar as regioes
 * que se sobrepoem, e **encolher** cada conflito ate o menor pedaco que ainda
 * e conflito. O segundo e o que o git chama de "zealous", e e a diferenca
 * entre um conflito de tres linhas e um de trinta.
 */

const { mudancas } = require('./diferenca');
const { encolherConflitos, juntarTudo } = require('./simplificar');
const { SO_A, SO_B, IGUAIS, CONFLITO } = require('./tipos');

/**
 * Funde tres versoes e devolve as regioes, em ordem.
 *
 * @param {string[]} base linhas do ancestral comum
 * @param {string[]} a linhas de um lado
 * @param {string[]} b linhas do outro
 * @returns {{tipo: string, linhas?: string[], deA?: string[], deB?: string[],
 *            daBase?: string[]}[]}
 */
function fundir(base, a, b, opcoes = {}) {
  const daA = comparar(base, a);
  const daB = comparar(base, b);

  const regioes = agrupar(base, a, b, daA, daB);

  // O `--diff3` do git **desliga** as duas simplificacoes, e nao por descuido:
  // elas sao incompativeis com mostrar o ancestral. Aparar o comeco e o fim de
  // um conflito, ou juntar dois conflitos vizinhos, muda quais linhas da base
  // correspondem ao pedaco -- e ai o bloco do meio, que devia ser "de onde os
  // dois partiram", passa a mostrar outra coisa.
  //
  // No codigo do git isso aparece como um teto: com estilo diff3, o nivel cai
  // para EAGER, que e abaixo de ZEALOUS. Achei isso procurando por que a
  // concordancia no diff3 tinha PIORADO quando as simplificacoes entraram.
  if (opcoes.zeloso === false) {
    return juntarTudo(regioes);
  }

  return encolherConflitos(regioes);
}

/** As mudancas de um lado em relacao a base, ja compactadas como o git faz. */
function comparar(base, outro) {
  return compactar(mudancas(base, outro), base, outro);
}

/**
 * Empurra cada grupo de mudanca o mais para baixo que der -- e cada lado por
 * conta propria.
 *
 * Quando uma linha e inserida no meio de varias iguais, o algoritmo de
 * diferenca pode dizer que ela entrou em qualquer uma das posicoes: todas dao o
 * mesmo arquivo final. A escolha importa aqui porque onde a regiao fica decide
 * se ela encosta na regiao do outro lado -- e encostar e a diferenca entre
 * fundir em silencio e reclamar de conflito.
 *
 * O git escolhe a posicao mais para baixo, e faz isso marcando cada linha de
 * cada arquivo como mudada ou nao e deslizando as marcas, em vez de deslizar o
 * par inteiro. A diferenca aparece numa substituicao: as linhas removidas e as
 * inseridas podem escorregar quantidades diferentes, e um grupo que era um pode
 * virar dois.
 */
function compactar(lista, base, outro) {
  const mudouBase = new Uint8Array(base.length);
  const mudouOutro = new Uint8Array(outro.length);

  for (const m of lista) {
    mudouBase.fill(1, m.inicioA, m.fimA);
    mudouOutro.fill(1, m.inicioB, m.fimB);
  }

  deslizar(base, mudouBase, mudouOutro);
  deslizar(outro, mudouOutro, mudouBase);

  return remontar(mudouBase, mudouOutro);
}

/**
 * Desliza os grupos de marcas de um arquivo, olhando para o outro.
 *
 * Esta funcao e uma traducao do `xdl_change_compact` do xdiff, e a ordem dos
 * tres passos e o que produz o resultado do git:
 *
 *   1. Sobe o grupo enquanto der -- o que pode gruda-lo no grupo de cima.
 *   2. Desce o grupo enquanto der -- o que pode gruda-lo no de baixo.
 *   3. Repete 1 e 2 ate o grupo parar de crescer.
 *   4. E entao, **se** o outro arquivo tem um grupo terminando no mesmo ponto,
 *      volta o grupo para la.
 *
 * O passo 4 e o que eu nao tinha e que custou tres pontos de concordancia. Sem
 * ele o grupo fica sempre o mais para baixo possivel, o que e o certo na maioria
 * dos casos e e o errado justamente quando os dois arquivos mudaram perto um do
 * outro -- que e o caso que importa numa fusao.
 */
function deslizar(linhas, mudou, mudouOutro) {
  const n = linhas.length;

  const marca = (vetor, i) => (i >= 0 && i < vetor.length ? vetor[i] : 0);

  let ix = 0;
  let ixo = 0;

  for (;;) {
    // Acha o primeiro grupo, mantendo o indice do outro arquivo em sincronia:
    // cada linha intocada aqui corresponde a uma linha intocada la.
    while (ix < n && !mudou[ix]) {
      while (marca(mudouOutro, ixo)) {
        ixo += 1;
      }

      ixo += 1;
      ix += 1;
    }

    if (ix >= n) {
      break;
    }

    let ixs = ix;

    while (ix < n && mudou[ix]) {
      ix += 1;
    }

    while (marca(mudouOutro, ixo)) {
      ixo += 1;
    }

    let tamanho;
    let referencia;

    do {
      tamanho = ix - ixs;

      // Sobe: se a linha antes do grupo e igual a ultima do grupo, deslizar
      // para cima nao muda nada.
      while (ixs > 0 && linhas[ixs - 1] === linhas[ix - 1]) {
        ixs -= 1;
        ix -= 1;

        mudou[ixs] = 1;
        mudou[ix] = 0;

        while (marca(mudou, ixs - 1)) {
          ixs -= 1;
        }

        do {
          ixo -= 1;
        } while (marca(mudouOutro, ixo));
      }

      // Se o outro arquivo tem um grupo terminando exatamente aqui, guarda esta
      // posicao: e para ela que o grupo volta no fim.
      referencia = marca(mudouOutro, ixo - 1) ? ix : n;

      // Desce: se a linha depois do grupo e igual a primeira dele, idem.
      while (ix < n && linhas[ixs] === linhas[ix]) {
        mudou[ixs] = 0;
        mudou[ix] = 1;

        ixs += 1;
        ix += 1;

        while (marca(mudou, ix)) {
          ix += 1;
        }

        do {
          ixo += 1;
        } while (marca(mudouOutro, ixo));
      }
    } while (tamanho !== ix - ixs);

    // E volta, se houver com o que alinhar.
    while (referencia < ix) {
      ixs -= 1;
      ix -= 1;

      mudou[ixs] = 1;
      mudou[ix] = 0;

      do {
        ixo -= 1;
      } while (marca(mudouOutro, ixo));
    }
  }
}

/**
 * Remonta a lista de mudancas a partir das marcas dos dois lados.
 *
 * As linhas nao marcadas correspondem uma a uma, na ordem -- e essa e a unica
 * coisa que o formato de marcas garante e de que se precisa aqui.
 */
function remontar(mudouBase, mudouOutro) {
  const saida = [];

  let i = 0;
  let j = 0;

  while (i < mudouBase.length || j < mudouOutro.length) {
    const aquiA = i < mudouBase.length && mudouBase[i];
    const aquiB = j < mudouOutro.length && mudouOutro[j];

    if (aquiA || aquiB) {
      const inicioA = i;
      const inicioB = j;

      while (i < mudouBase.length && mudouBase[i]) {
        i += 1;
      }

      while (j < mudouOutro.length && mudouOutro[j]) {
        j += 1;
      }

      saida.push({ inicioA, fimA: i, inicioB, fimB: j });
      continue;
    }

    if (i >= mudouBase.length || j >= mudouOutro.length) {
      // Sobrou linha de um lado so: e o resto do arquivo mais longo.
      saida.push({
        inicioA: i,
        fimA: mudouBase.length,
        inicioB: j,
        fimB: mudouOutro.length,
      });

      break;
    }

    i += 1;
    j += 1;
  }

  return saida;
}

/**
 * Junta as mudancas dos dois lados em regioes, na ordem da base.
 *
 * Duas mudancas que se encostam na base viram uma regiao so. E o passo que
 * decide o tamanho de cada conflito, e a regra e mais larga do que parece: um
 * conflito nao precisa de sobreposicao estrita, basta as duas regioes ficarem
 * coladas -- senao sairiam dois conflitos vizinhos onde ha um.
 */
function agrupar(base, a, b, daA, daB) {
  const regioes = [];

  let posBase = 0;
  let i = 0;
  let j = 0;

  // O deslocamento entre a base e cada lado, no ponto em que a leitura esta.
  // Fora de uma mudanca os dois andam juntos, entao uma soma basta para
  // traduzir uma posicao da base para o lado -- e e essa traducao que diz
  // quais linhas de A e de B correspondem a uma regiao da base.
  let desvioA = 0;
  let desvioB = 0;

  while (i < daA.length || j < daB.length) {
    const proximaA = daA[i];
    const proximaB = daB[j];

    const inicio = Math.min(
      proximaA ? proximaA.inicioA : Infinity,
      proximaB ? proximaB.inicioA : Infinity,
    );

    if (inicio > posBase) {
      regioes.push({ tipo: IGUAIS, linhas: base.slice(posBase, inicio) });
    }

    const inicioEmA = inicio + desvioA;
    const inicioEmB = inicio + desvioB;

    let fimNaBase = inicio;
    let mexeuA = false;
    let mexeuB = false;

    // Estende a regiao enquanto as mudancas dos dois lados se tocarem. Nao e
    // preciso haver sobreposicao: duas mudancas coladas viram uma regiao so,
    // senao sairiam dois conflitos vizinhos onde ha um.
    for (;;) {
      let cresceu = false;

      while (i < daA.length && daA[i].inicioA <= fimNaBase) {
        desvioA += (daA[i].fimB - daA[i].inicioB) - (daA[i].fimA - daA[i].inicioA);
        fimNaBase = Math.max(fimNaBase, daA[i].fimA);

        i += 1;
        mexeuA = true;
        cresceu = true;
      }

      while (j < daB.length && daB[j].inicioA <= fimNaBase) {
        desvioB += (daB[j].fimB - daB[j].inicioB) - (daB[j].fimA - daB[j].inicioA);
        fimNaBase = Math.max(fimNaBase, daB[j].fimA);

        j += 1;
        mexeuB = true;
        cresceu = true;
      }

      if (!cresceu) {
        break;
      }
    }

    const daBase = base.slice(inicio, fimNaBase);
    const ladoA = a.slice(inicioEmA, fimNaBase + desvioA);
    const ladoB = b.slice(inicioEmB, fimNaBase + desvioB);

    regioes.push(classificar(daBase, ladoA, ladoB, mexeuA, mexeuB));

    posBase = fimNaBase;
  }

  if (posBase < base.length) {
    regioes.push({ tipo: IGUAIS, linhas: base.slice(posBase) });
  }

  return regioes;
}

function classificar(daBase, ladoA, ladoB, mexeuA, mexeuB) {
  if (mexeuA && !mexeuB) {
    return { tipo: SO_A, linhas: ladoA, daBase };
  }

  if (mexeuB && !mexeuA) {
    return { tipo: SO_B, linhas: ladoB, daBase };
  }

  if (igual(ladoA, ladoB)) {
    // Os dois fizeram a mesma mudanca. Nao e conflito -- e concordancia, e o
    // resultado leva uma copia so. Sem este caso, um `cherry-pick` do mesmo
    // commit nos dois ramos daria conflito em tudo.
    return { tipo: IGUAIS, linhas: ladoA };
  }

  return { tipo: CONFLITO, deA: ladoA, deB: ladoB, daBase };
}

function igual(x, y) {
  return x.length === y.length && x.every((linha, i) => linha === y[i]);
}

/**
 * Encolhe cada conflito ate o menor pedaco que ainda e conflito.
 *
 * Se os dois lados acrescentaram dez linhas iguais e so a decima primeira
 * difere, o conflito e de uma linha, nao de onze. As dez iguais saem do
 * conflito e viram texto normal.
 *
 * O git chama isso de "zealous" e faz por padrao. A diferenca pratica e enorme:
 * sem este passo, um conflito num arquivo grande vem com dezenas de linhas
 * identicas dentro dos marcadores, e a pessoa tem de descobrir sozinha que
 * quase tudo ali nao esta em disputa.
 */
/** Houve conflito em alguma regiao? */
function temConflito(regioes) {
  return regioes.some((regiao) => regiao.tipo === CONFLITO);
}

module.exports = { fundir, temConflito, SO_A, SO_B, IGUAIS, CONFLITO };
