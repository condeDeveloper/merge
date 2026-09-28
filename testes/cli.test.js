'use strict';

/**
 * A linha de comando, comparada com a do git argumento por argumento.
 *
 * Aqui o juiz aparece de novo, e num lugar em que e facil esquecer dele: o
 * codigo de saida. O `git merge-file` sai com o **numero de conflitos**, e nao
 * com zero ou um -- e um script que trate o codigo como booleano funciona por
 * acaso e falha no dia em que houver dois conflitos.
 */

const { test, after } = require('node:test');
const assert = require('node:assert');

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { principal } = require('../lib/cli');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-cli-'));

after(() => {
  try {
    fs.rmSync(pasta, { recursive: true, force: true });
  } catch {
    // Nada a fazer.
  }
});

let contador = 0;

function escrever(conteudo) {
  contador += 1;

  const caminho = path.join(pasta, `arq${contador}`);

  fs.writeFileSync(caminho, conteudo);

  return caminho;
}

function coletar() {
  const pedacos = [];

  return {
    write(texto) {
      pedacos.push(texto);
    },
    texto() {
      return pedacos.join('');
    },
  };
}

function rodar(argumentos) {
  const saida = coletar();
  const erros = coletar();

  const codigo = principal(argumentos, saida, erros);

  return { codigo, saida: saida.texto(), erros: erros.texto() };
}

function codigoDoGit(argumentos) {
  try {
    execFileSync('git', ['merge-file', ...argumentos], { encoding: 'utf8' });

    return 0;
  } catch (erro) {
    if (erro.status === undefined) {
      throw erro;
    }

    return erro.status;
  }
}

test('o codigo de saida e o numero de conflitos, como no git', () => {
  const casos = [
    // sem conflito
    ['a\nb\nc\n', 'a\nb\nc\n', 'a\nb\nc\n'],
    ['a\nX\nc\n', 'a\nb\nc\n', 'a\nb\nc\n'],

    // um conflito
    ['a\nX\nc\n', 'a\nb\nc\n', 'a\nY\nc\n'],

    // dois conflitos, em pontos distantes
    ['X\nb\nc\nd\nZ\n', 'a\nb\nc\nd\ne\n', 'W\nb\nc\nd\nV\n'],

    // tres
    ['X\nb\nZ\nd\nQ\n', 'a\nb\nc\nd\ne\n', 'W\nb\nY\nd\nV\n'],
  ];

  for (const [meu, base, seu] of casos) {
    const caminhoMeu = escrever(meu);
    const caminhoBase = escrever(base);
    const caminhoSeu = escrever(seu);

    const dele = codigoDoGit(['-p', caminhoMeu, caminhoBase, caminhoSeu]);
    const oMeu = rodar(['-p', caminhoMeu, caminhoBase, caminhoSeu]);

    assert.strictEqual(oMeu.codigo, dele,
      `codigo de saida diferente para ${JSON.stringify(meu)}`);
  }
});

test('sem -p, o resultado vai por cima do primeiro arquivo', () => {
  // As duas mudancas precisam estar separadas por pelo menos uma linha intacta.
  // Coladas, elas viram uma regiao so e dao conflito -- o que o git tambem faz.
  // Foi este teste que me ensinou isso: na primeira versao eu tinha posto as
  // mudancas em linhas vizinhas e esperado uma fusao limpa.
  const caminhoMeu = escrever('a\nX\nc\nd\ne\n');
  const caminhoBase = escrever('a\nb\nc\nd\ne\n');
  const caminhoSeu = escrever('a\nb\nc\nd\nZ\n');

  const resultado = rodar([caminhoMeu, caminhoBase, caminhoSeu]);

  assert.strictEqual(resultado.codigo, 0);
  assert.strictEqual(resultado.saida, '');
  assert.strictEqual(fs.readFileSync(caminhoMeu, 'utf8'), 'a\nX\nc\nd\nZ\n');
});

test('os rotulos do -L aparecem nos marcadores', () => {
  const caminhoMeu = escrever('a\nX\nc\n');
  const caminhoBase = escrever('a\nb\nc\n');
  const caminhoSeu = escrever('a\nY\nc\n');

  const resultado = rodar([
    '-p', '-L', 'o meu ramo', '-L', 'o ancestral', '-L', 'o ramo dele',
    caminhoMeu, caminhoBase, caminhoSeu,
  ]);

  assert.ok(resultado.saida.includes('<<<<<<< o meu ramo'), resultado.saida);
  assert.ok(resultado.saida.includes('>>>>>>> o ramo dele'), resultado.saida);
  assert.ok(!resultado.saida.includes('|||||||'), 'sem --diff3 nao ha base');
});

test('o --diff3 mostra o ancestral dentro do conflito', () => {
  const caminhoMeu = escrever('a\nX\nc\n');
  const caminhoBase = escrever('a\nb\nc\n');
  const caminhoSeu = escrever('a\nY\nc\n');

  const resultado = rodar([
    '-p', '--diff3', '-L', 'meu', '-L', 'base', '-L', 'seu',
    caminhoMeu, caminhoBase, caminhoSeu,
  ]);

  assert.ok(resultado.saida.includes('||||||| base'), resultado.saida);
  assert.ok(resultado.saida.includes('\nb\n'), 'a linha da base tem de aparecer');
});

test('as recusas', () => {
  assert.strictEqual(rodar([]).codigo, 129);
  assert.strictEqual(rodar(['so-um-arquivo']).codigo, 129);
  assert.strictEqual(rodar(['--nao-existe', 'a', 'b', 'c']).codigo, 129);

  const naoExiste = rodar(['-p',
    path.join(pasta, 'nao-existe-1'),
    path.join(pasta, 'nao-existe-2'),
    path.join(pasta, 'nao-existe-3')]);

  assert.strictEqual(naoExiste.codigo, 129);
  assert.ok(naoExiste.erros.includes('nao existe'), naoExiste.erros);
});

test('o -h mostra a ajuda e sai com zero', () => {
  const resultado = rodar(['-h']);

  assert.strictEqual(resultado.codigo, 0);
  assert.ok(resultado.saida.includes('--diff3'));
});

test('cento e vinte e sete e o teto do codigo de saida', () => {
  // Um arquivo com duzentos conflitos nao pode sair como sinal 9. O git tem o
  // mesmo teto, pelo mesmo motivo.
  const linhas = (letra) => Array.from({ length: 200 },
    (_, i) => `${letra}${i}`).join('\n') + '\n';

  const caminhoMeu = escrever(linhas('X'));
  const caminhoBase = escrever(linhas('b'));
  const caminhoSeu = escrever(linhas('Y'));

  const resultado = rodar(['-p', caminhoMeu, caminhoBase, caminhoSeu]);

  assert.ok(resultado.codigo <= 127, `saiu com ${resultado.codigo}`);
});
