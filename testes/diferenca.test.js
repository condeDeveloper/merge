'use strict';

/**
 * A diferenca, conferida por uma propriedade em vez de por exemplos.
 *
 * O teste forte de um algoritmo de diferenca nao e "neste caso ele da isto".
 * E: **aplicar a diferenca em A tem de dar B**, para qualquer A e qualquer B.
 * Cinquenta mil pares sorteados conferem isso sem que eu precise imaginar quais
 * casos sao dificeis -- e os dificeis sao justamente os que eu nao imaginaria.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { mudancas, trechosIguais } = require('../lib/diferenca');

/** Aplica as mudancas em `a` usando as linhas de `b`. */
function aplicar(a, b, lista) {
  const saida = [];

  let posicao = 0;

  for (const m of lista) {
    saida.push(...a.slice(posicao, m.inicioA));
    saida.push(...b.slice(m.inicioB, m.fimB));

    posicao = m.fimA;
  }

  saida.push(...a.slice(posicao));

  return saida;
}

function sorteador(semente) {
  let estado = semente >>> 0;

  return () => {
    estado ^= estado << 13;
    estado >>>= 0;
    estado ^= estado >>> 17;
    estado ^= estado << 5;
    estado >>>= 0;

    return estado / 0x100000000;
  };
}

test('aplicar a diferenca em A da B, em cinquenta mil pares', () => {
  const proximo = sorteador(20260928);

  for (let i = 0; i < 50_000; i += 1) {
    const alfabeto = 'abcd';

    const a = [];
    const b = [];

    for (let j = 0, n = Math.floor(proximo() * 14); j < n; j += 1) {
      a.push(alfabeto[Math.floor(proximo() * alfabeto.length)]);
    }

    for (let j = 0, n = Math.floor(proximo() * 14); j < n; j += 1) {
      b.push(alfabeto[Math.floor(proximo() * alfabeto.length)]);
    }

    const obtido = aplicar(a, b, mudancas(a, b));

    assert.deepStrictEqual(obtido, b,
      `caso ${i}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  }
});

test('os trechos iguais sao mesmo iguais, e crescem sempre', () => {
  const proximo = sorteador(7);

  for (let i = 0; i < 5000; i += 1) {
    const a = [];
    const b = [];

    for (let j = 0, n = Math.floor(proximo() * 20); j < n; j += 1) {
      a.push(String.fromCharCode(97 + Math.floor(proximo() * 5)));
    }

    for (let j = 0, n = Math.floor(proximo() * 20); j < n; j += 1) {
      b.push(String.fromCharCode(97 + Math.floor(proximo() * 5)));
    }

    let anteriorA = -1;
    let anteriorB = -1;

    for (const trecho of trechosIguais(a, b)) {
      assert.ok(trecho.inicioA > anteriorA || trecho.tamanho === 0,
        'os trechos tem de vir em ordem crescente');
      assert.ok(trecho.inicioB > anteriorB || trecho.tamanho === 0);

      for (let k = 0; k < trecho.tamanho; k += 1) {
        assert.strictEqual(a[trecho.inicioA + k], b[trecho.inicioB + k],
          'um trecho dito igual que nao e igual');
      }

      anteriorA = trecho.inicioA;
      anteriorB = trecho.inicioB;
    }
  }
});

test('os casos de borda', () => {
  assert.deepStrictEqual(mudancas([], []), []);
  assert.deepStrictEqual(mudancas(['a'], ['a']), []);

  assert.deepStrictEqual(mudancas([], ['a']),
    [{ inicioA: 0, fimA: 0, inicioB: 0, fimB: 1 }]);

  assert.deepStrictEqual(mudancas(['a'], []),
    [{ inicioA: 0, fimA: 1, inicioB: 0, fimB: 0 }]);

  assert.deepStrictEqual(mudancas(['a', 'b'], ['a', 'x', 'b']),
    [{ inicioA: 1, fimA: 1, inicioB: 1, fimB: 2 }]);
});

test('um arquivo grande com poucas mudancas sai depressa', () => {
  // E a promessa de Myers: o custo depende do tamanho da resposta, e nao do
  // tamanho da entrada. Dez mil linhas com tres mudancas tem de sair num
  // instante -- se o algoritmo estivesse errado e virasse quadratico, este
  // teste levaria minutos.
  const a = Array.from({ length: 10_000 }, (_, i) => `linha ${i}`);
  const b = a.slice();

  b[100] = 'mudei aqui';
  b.splice(5000, 0, 'e aqui tambem');
  b.splice(9000, 1);

  const comeco = Date.now();
  const lista = mudancas(a, b);
  const gasto = Date.now() - comeco;

  assert.strictEqual(lista.length, 3);
  assert.ok(gasto < 2000, `levou ${gasto} ms`);

  assert.deepStrictEqual(aplicar(a, b, lista), b);
});
