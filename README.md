# merge

Fusão de três vias do zero em Node puro — o algoritmo que faz duas pessoas
conseguirem mexer no mesmo arquivo.

Inclui a diferença de Myers, a fusão propriamente dita e os marcadores de
conflito, e a interface é a do `git merge-file`: os mesmos argumentos, a mesma
saída, o mesmo código de retorno.

```
$ node merge.js -p -L meu -L base -L seu meu.txt base.txt seu.txt
a
<<<<<<< meu
X
=======
Y
>>>>>>> seu
c
```

## O juiz

O `git merge-file` de verdade, rodando de verdade, com os mesmos três arquivos.
A comparação é **byte a byte**: marcadores, rótulos, quebra de linha do fim e
código de saída.

É o único jeito honesto de testar isto. Uma fusão de três vias tem dezenas de
decisões pequenas — onde um conflito começa, até onde vai, se duas mudanças
coladas viram uma ou duas, o que acontece quando os dois lados apagam o mesmo
trecho — e cada uma tem uma resposta plausível que não é a do git. Testar contra
as minhas próprias expectativas só provaria que sou consistente comigo mesmo.

O placar, em 2.500 trios sorteados:

| corpus | concordância | fusões limpas idênticas |
|---|---|---|
| 4 letras de alfabeto | **95,00%** | 337/338 |
| 7 letras | **97,20%** | 325/325 |
| 20 letras | **99,00%** | 313/313 |
| linhas distintas, como código de verdade | **99,80%** | 311/311 |
| estilo `--diff3` | **96,80%** | 335/335 |
| **total** | **97,56%** | |

Os corpora vão do adversarial ao realista de propósito. Com quatro letras, quase
toda linha se repete, quase todo alinhamento tem empate, e cada empate é uma
chance de escolher diferente do git — e um empate é um empate: as duas respostas
custam o mesmo número de edições e as duas estão certas. Com linhas distintas,
como num arquivo de código, o alinhamento mínimo é único e as duas
implementações chegam nele: **99,80%**.

```
$ npm run placar
```

## Como o placar conduziu o projeto

"Funciona bem" não diz se uma mudança melhorou ou piorou. Cada decisão aqui foi
tomada medindo:

| mudança | antes | depois |
|---|---|---|
| guardar a quebra de linha **dentro** da linha | 87,3% | 95,0% |
| traduzir o `xdl_change_compact` do xdiff fielmente | 91,6% | 95,0% |
| partir o conflito em todo ponto de concordância | 95,0% | **94,0%** — desfeito |
| juntar conflitos separados por ≤ 3 linhas | 95,3% | 96,3% |
| desligar as simplificações no `--diff3` | 91,3% (diff3) | 96,8% (diff3) |

A terceira linha é a mais útil das cinco. Ela parecia obviamente certa, veio de
ler a documentação do xdiff, e **piorou**. Sem o placar teria entrado no código
com uma explicação convincente do porquê devia estar lá.

## As três coisas que o juiz ensinou

**A quebra de linha faz parte da linha.**

Um arquivo que termina sem quebra tem, na última posição, uma linha que não é
igual à mesma linha com quebra. O git enxerga assim — para o xdiff, o `\n` faz
parte do registro — e por isso ele acusa conflito onde um lado tirou a quebra
final e o outro mexeu ali perto. Guardando a quebra fora da linha, as duas viram
a mesma coisa, a fusão sai limpa, e o resultado difere do git em um byte. Eram
quase todas as 51 divergências das primeiras 400.

**Dois conflitos vizinhos viram um.**

Esta eu nunca teria adivinhado, e é o oposto do que a intuição pede. Dois
conflitos separados por **três linhas ou menos** viram um conflito único, com as
três linhas intactas dentro dele. E se as linhas entre eles não têm nenhum
caractere alfanumérico — linha em branco, chave de fecho, ponto e vírgula solto
— eles se juntam por mais longe que estejam.

Parece perda de precisão e é o contrário: quem resolve um conflito precisa de
contexto, e dois blocos de marcadores separados por duas linhas são mais
difíceis de ler que um bloco só. O git escolheu a versão legível.

**O `--diff3` desliga as simplificações.**

Achei isso procurando por que a concordância no `--diff3` tinha *piorado* quando
a regra acima entrou. No código do git aparece como um teto: com estilo diff3, o
nível de agressividade cai abaixo de ZEALOUS. Faz sentido — aparar as pontas de
um conflito ou juntar dois muda quais linhas da base correspondem ao pedaço, e
aí o bloco do meio, que devia mostrar "de onde os dois partiram", passa a
mostrar outra coisa.

## A propriedade que mais importa

**Quando nem o git nem este código acham conflito, os dois produzem exatamente o
mesmo arquivo.** Isso vale sem exceção com sete letras de alfabeto ou mais:
325/325, 313/313, 311/311, 335/335.

É o que importa na prática. Uma fusão limpa é aplicada sem ninguém olhar — um
byte diferente ali seria um arquivo silenciosamente errado no ramo principal de
alguém. Onde há conflito, uma pessoa vai ler antes.

Eu esperava que valesse sempre, e o juiz mostrou que não vale: com quatro
letras, aparece uma exceção a cada trezentos casos. Ela é sempre a mesma coisa —
uma linha inserida no meio de um bloco de linhas idênticas. Se cinco `b`
seguidos viram cinco `b` e um `d`, a posição do `d` entre eles é genuinamente
indeterminada. Os dois arquivos são a mesma fusão; diferem em qual `b` ficou
antes.

## O algoritmo, em quatro casos

O que torna a fusão possível é o **ancestral comum**. Comparar só as duas
versões finais não basta: duas linhas diferentes podem ser "eu mudei e você não"
ou "você mudou e eu não", e sem o ponto de partida não dá para saber qual. Com
ele, cada região cai num de quatro casos:

```
só o lado A mudou         fica a versão de A
só o lado B mudou         fica a versão de B
os dois fizeram o mesmo   fica uma cópia só
os dois, diferente        conflito
```

E é só isso. A fusão de três vias é um dos algoritmos mais influentes da
história do software e cabe em duas telas. O trabalho de verdade está em dois
lugares menos óbvios: **agrupar** as regiões que se tocam, e **encolher** cada
conflito até o menor pedaço que ainda é conflito.

O terceiro caso — os dois fizeram a mesma mudança — é o que quase ninguém
lembra de implementar, e sem ele um `cherry-pick` do mesmo commit nos dois ramos
daria conflito em tudo.

## Os marcadores

```
<<<<<<< o meu ramo
o que eu escrevi
||||||| o ancestral
o que estava lá antes
=======
o que você escreveu
>>>>>>> o seu ramo
```

Sete caracteres, e não é arbitrário: longo o bastante para não aparecer por
acaso num arquivo, curto o bastante para caber na tela. Vêm do RCS, de 1982, e
sobreviveram intactos ao CVS, ao Subversion e ao git.

O bloco do meio só aparece com `--diff3`, e é mais útil do que parece: sem ele
quem resolve o conflito vê o que os dois querem e não vê de onde os dois
partiram, que costuma ser a informação que falta para decidir.

## Por dentro

| arquivo | o que faz |
|---|---|
| `diferenca.js` | Myers com o ponto do meio — espaço linear, e o índice do caminho de trás que derruba quem o escreve |
| `fusao.js` | os quatro casos, o agrupamento, e as duas simplificações do git |
| `marcadores.js` | os marcadores, e a quebra de linha que faz parte da linha |
| `index.js` | a fachada, com a mesma assinatura do `git merge-file` |
| `cli.js` | a linha de comando |
| `ferramentas/placar.js` | o placar que conduziu o projeto |
| `testes/juiz.js` | roda o git de verdade e compara byte a byte |

## Rodar

Node 18 ou mais novo, e um `git` no caminho — para os testes, não para usar.
Zero dependências.

```
npm test
npm run placar
```

## A pegadinha da ordem dos argumentos

O ancestral comum fica no **meio**:

```
node merge.js meu base seu
```

É a ordem do `git merge-file`, que é a ordem do `diff3` do RCS, e confunde todo
mundo na primeira vez.

## O que ele não faz

Não funde binário, não tem as opções `--ours`/`--theirs`/`--union`, não ignora
espaço em branco e não faz detecção de renomeação — isso último nem é do
`merge-file`, é do `git merge`, uma camada acima. E não chega aos 100% de
concordância no corpus adversarial, pelo motivo dito lá em cima: onde há empate,
duas respostas estão certas e a escolha é uma convenção.

## Licença

MIT.
