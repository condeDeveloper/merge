'use strict';

/**
 * A linha de comando, com a mesma interface do `git merge-file`.
 *
 *     node merge.js [-p] [--diff3] [-L rotulo]... meu base seu
 *
 * O `-L` pode vir ate tres vezes, na ordem meu, base, seu -- e a ordem dos
 * arquivos e a mesma que o git usa, que confunde todo mundo na primeira vez: o
 * ancestral comum fica no **meio**.
 *
 * O codigo de saida e o numero de conflitos, e nao um erro. Foi assim que o
 * `diff3` do RCS fez em 1982 e o git manteve: quem chama quer saber quantos, e
 * um script consegue decidir o que fazer com o numero.
 */

const fs = require('node:fs');

const { mergeFile } = require('./index');

function principal(argumentos, saida = process.stdout, erros = process.stderr) {
  const opcoes = {
    paraATela: false,
    estilo: 'normal',
    rotulos: [],
  };

  const caminhos = [];

  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i];

    switch (argumento) {
      case '-p':
      case '--stdout':
        opcoes.paraATela = true;
        break;

      case '--diff3':
        opcoes.estilo = 'diff3';
        break;

      case '-L':
        i += 1;
        opcoes.rotulos.push(argumentos[i]);
        break;

      case '-h':
      case '--help':
        saida.write(AJUDA);

        return 0;

      default:
        if (argumento.startsWith('-')) {
          erros.write(`nao conheco a opcao ${argumento}\n`);

          return 129;
        }

        caminhos.push(argumento);
    }
  }

  if (caminhos.length !== 3) {
    erros.write('sao precisos tres arquivos: o meu, a base e o seu\n');
    saida.write(AJUDA);

    return 129;
  }

  let textos;

  try {
    textos = caminhos.map((caminho) => fs.readFileSync(caminho, 'utf8'));
  } catch (erro) {
    erros.write(`${erro.path}: ${erro.code === 'ENOENT' ? 'nao existe' : erro.message}\n`);

    return 129;
  }

  const resultado = mergeFile(textos[0], textos[1], textos[2], {
    rotuloA: opcoes.rotulos[0] ?? caminhos[0],
    rotuloBase: opcoes.rotulos[1] ?? caminhos[1],
    rotuloB: opcoes.rotulos[2] ?? caminhos[2],
    estilo: opcoes.estilo,
  });

  if (opcoes.paraATela) {
    saida.write(resultado.texto);
  } else {
    // Sem `-p`, o resultado vai por cima do primeiro arquivo -- que e o
    // comportamento do git, e e o que faz sentido num `merge` de verdade: o
    // arquivo do lado que esta recebendo e o que fica.
    fs.writeFileSync(caminhos[0], resultado.texto);
  }

  // O teto de 127 existe porque codigos acima disso tem significado proprio no
  // shell, e um arquivo com 200 conflitos nao pode sair como sinal 9.
  return Math.min(resultado.conflitos, 127);
}

const AJUDA = `merge -- fusao de tres vias do zero, com a saida do git merge-file

  node merge.js [-p] [--diff3] [-L rotulo]... meu base seu

  -p, --stdout   escreve o resultado na tela em vez de no primeiro arquivo
  --diff3        mostra tambem o ancestral comum dentro do conflito
  -L rotulo      o rotulo de cada lado, ate tres vezes, na ordem meu/base/seu

  O codigo de saida e o numero de conflitos.
`;

module.exports = { principal, AJUDA };
