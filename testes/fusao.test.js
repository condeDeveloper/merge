'use strict';

/**
 * As regioes da fusao, sem passar pelo git.
 *
 * O teste de conformidade diz se o texto final bate; este diz **por que**. Os
 * dois se completam: uma regiao classificada errado pode produzir o texto certo
 * por acidente, e um dia deixa de produzir.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { fundir } = require('../lib/fusao');
const { emLinhas } = require('../lib/marcadores');
const { CONFLITO, IGUAIS, SO_A, SO_B } = require('../lib/tipos');

function tipos(meu, base, seu, opcoes) {
  return fundir(emLinhas(base), emLinhas(meu), emLinhas(seu), opcoes)
    .map((regiao) => regiao.tipo);
}

test('os quatro casos, um a um', () => {
  assert.deepStrictEqual(
    tipos('a\nb\nc\n', 'a\nb\nc\n', 'a\nb\nc\n'),
    [IGUAIS],
    'ninguem mexeu');

  assert.deepStrictEqual(
    tipos('a\nX\nc\n', 'a\nb\nc\n', 'a\nb\nc\n'),
    [IGUAIS, SO_A, IGUAIS],
    'so o lado A');

  assert.deepStrictEqual(
    tipos('a\nb\nc\n', 'a\nb\nc\n', 'a\nY\nc\n'),
    [IGUAIS, SO_B, IGUAIS],
    'so o lado B');

  assert.deepStrictEqual(
    tipos('a\nX\nc\n', 'a\nb\nc\n', 'a\nY\nc\n'),
    [IGUAIS, CONFLITO, IGUAIS],
    'os dois, diferente');
});

test('os dois fizeram a mesma mudanca: nao e conflito', () => {
  // Sem este caso, um `cherry-pick` do mesmo commit nos dois ramos daria
  // conflito em tudo -- e e um dos casos mais comuns que existem.
  const regioes = fundir(
    emLinhas('a\nb\nc\n'), emLinhas('a\nX\nc\n'), emLinhas('a\nX\nc\n'));

  assert.deepStrictEqual(regioes.map((r) => r.tipo), [IGUAIS]);
  assert.strictEqual(regioes[0].linhas.join(''), 'a\nX\nc\n');
});

test('mudancas distantes entram as duas, sem conflito', () => {
  const regioes = fundir(
    emLinhas('a\nb\nc\nd\ne\n'),
    emLinhas('X\nb\nc\nd\ne\n'),
    emLinhas('a\nb\nc\nd\nY\n'));

  assert.deepStrictEqual(regioes.map((r) => r.tipo),
    [SO_A, IGUAIS, SO_B]);
});

test('mudancas coladas viram um conflito so', () => {
  // Nao e preciso haver sobreposicao: basta as duas regioes se encostarem.
  // Senao sairiam dois conflitos vizinhos onde ha uma decisao so.
  assert.deepStrictEqual(
    tipos('a\nX\nc\nd\n', 'a\nb\nc\nd\n', 'a\nb\nY\nd\n'),
    [IGUAIS, CONFLITO, IGUAIS]);
});

test('o conflito encolhe ate o pedaco em disputa', () => {
  // Os dois lados escreveram as mesmas cinco linhas e so a sexta difere. O
  // conflito e de uma linha, nao de seis.
  const regioes = fundir(
    emLinhas('base\n'),
    emLinhas('base\n1\n2\n3\n4\n5\nX\n'),
    emLinhas('base\n1\n2\n3\n4\n5\nY\n'));

  const conflitos = regioes.filter((r) => r.tipo === CONFLITO);

  assert.strictEqual(conflitos.length, 1);
  assert.deepStrictEqual(conflitos[0].deA, ['X\n']);
  assert.deepStrictEqual(conflitos[0].deB, ['Y\n']);
});

test('dois conflitos separados por pouco viram um', () => {
  // A regra do git: tres linhas intactas ou menos entre dois conflitos e eles
  // se juntam, com as linhas dentro.
  const comTres = fundir(
    emLinhas('a\nb\nc\nd\ne\n'),
    emLinhas('X\nb\nc\nd\nZ\n'),
    emLinhas('W\nb\nc\nd\nV\n'));

  assert.strictEqual(comTres.filter((r) => r.tipo === CONFLITO).length, 1,
    'tres linhas entre os dois: viram um');

  const conflito = comTres.find((r) => r.tipo === CONFLITO);

  assert.deepStrictEqual(conflito.deA, ['X\n', 'b\n', 'c\n', 'd\n', 'Z\n']);
  assert.deepStrictEqual(conflito.deB, ['W\n', 'b\n', 'c\n', 'd\n', 'V\n']);

  const comQuatro = fundir(
    emLinhas('a\nb\nc\nd\ne\nf\n'),
    emLinhas('X\nb\nc\nd\ne\nZ\n'),
    emLinhas('W\nb\nc\nd\ne\nV\n'));

  assert.strictEqual(comQuatro.filter((r) => r.tipo === CONFLITO).length, 2,
    'quatro linhas entre os dois: continuam separados');
});

test('linhas sem nenhum alfanumerico no meio nao separam dois conflitos', () => {
  // Uma linha em branco, uma chave de fecho, um ponto e virgula solto: nada
  // disso e separacao de verdade, e o git junta os conflitos por mais longe
  // que estejam.
  const regioes = fundir(
    emLinhas('a\n}\n\n}\n\n}\n\nb\n'),
    emLinhas('X\n}\n\n}\n\n}\n\nZ\n'),
    emLinhas('W\n}\n\n}\n\n}\n\nV\n'));

  assert.strictEqual(regioes.filter((r) => r.tipo === CONFLITO).length, 1,
    'seis linhas sem alfanumerico no meio: viram um conflito so');
});

test('o diff3 nao encolhe nem junta', () => {
  // Com o ancestral a mostra, mexer nas fronteiras faria o bloco do meio
  // deixar de corresponder ao pedaco.
  const zeloso = fundir(
    emLinhas('base\n'),
    emLinhas('base\n1\n2\nX\n'),
    emLinhas('base\n1\n2\nY\n'));

  const cru = fundir(
    emLinhas('base\n'),
    emLinhas('base\n1\n2\nX\n'),
    emLinhas('base\n1\n2\nY\n'),
    { zeloso: false });

  assert.deepStrictEqual(zeloso.find((r) => r.tipo === CONFLITO).deA, ['X\n']);
  assert.deepStrictEqual(cru.find((r) => r.tipo === CONFLITO).deA,
    ['1\n', '2\n', 'X\n'],
    'sem zelo, o conflito guarda as linhas iguais tambem');
});

test('arquivos vazios', () => {
  assert.deepStrictEqual(tipos('', '', ''), []);
  assert.deepStrictEqual(tipos('', 'a\n', 'a\n'), [SO_A]);
  assert.deepStrictEqual(tipos('a\n', 'a\n', ''), [SO_B]);
  assert.deepStrictEqual(tipos('', 'a\n', ''), [IGUAIS],
    'os dois apagaram tudo: nao e conflito');
});

test('a quebra de linha do fim faz parte da linha', () => {
  // Um arquivo que termina sem quebra e diferente de um que termina com ela, e
  // a diferenca aparece como uma mudanca de verdade.
  assert.deepStrictEqual(tipos('a\nb', 'a\nb\n', 'a\nb\n'), [IGUAIS, SO_A]);
  assert.deepStrictEqual(tipos('a\nb\n', 'a\nb\n', 'a\nb'), [IGUAIS, SO_B]);
  assert.deepStrictEqual(tipos('a\nX', 'a\nb', 'a\nY'), [IGUAIS, CONFLITO]);
});

test('os dois apagaram o mesmo trecho', () => {
  assert.deepStrictEqual(tipos('a\nd\n', 'a\nb\nc\nd\n', 'a\nd\n'), [IGUAIS]);
});

test('um apagou e o outro mudou: conflito', () => {
  const regioes = fundir(
    emLinhas('a\nb\nc\nd\n'), emLinhas('a\nd\n'), emLinhas('a\nB\nc\nd\n'));

  assert.strictEqual(regioes.filter((r) => r.tipo === CONFLITO).length, 1);
});
