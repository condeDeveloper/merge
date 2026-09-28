'use strict';

/** Os quatro tipos de regiao que uma fusao de tres vias produz. */
module.exports = {
  /** So o lado A mudou aqui: fica a versao dele. */
  SO_A: 'a',

  /** So o lado B mudou: fica a versao dele. */
  SO_B: 'b',

  /** Ninguem mudou, ou os dois fizeram a mesma coisa: uma copia so. */
  IGUAIS: 'iguais',

  /** Os dois mudaram, diferente. */
  CONFLITO: 'conflito',
};
