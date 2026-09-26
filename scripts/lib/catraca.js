'use strict';

/**
 * B7 - "Quando o teste me atrapalha, eu tenho vontade de mexer no medidor."
 *
 * A autoavaliacao nomeou esta falha e exigiu o mecanismo: "detectar teste+baseline
 * no mesmo diff do codigo; subir baseline e decisao humana". O desenho da v1 §12
 * adiou o item, marcando-o como "primeiro candidato a entrar se sobrar folego".
 * Ficou 25 dias sem entrar. Entra aqui.
 *
 * O QUE ESTE MODULO NAO FAZ, e por que: nao acusa "teste e codigo mudaram no mesmo
 * turno". TDD faz exatamente isso, sempre, e um portao que nega TDD seria negado
 * de volta no primeiro dia. O sinal verdadeiro nao e tocar nos dois - e AFROUXAR
 * a regua. E isso que se detecta: o numero da catraca andando para o lado que
 * deixa passar mais.
 *
 * As duas familias, porque a direcao do afrouxamento e oposta:
 *   TETO  (teto, limite, maximo, tolerancia...)  afrouxa quando SOBE
 *   PISO  (minimo, piso, cobertura, exigido...)  afrouxa quando DESCE
 */

const TETO = ['teto', 'limite', 'limiar', 'baseline', 'threshold', 'maximo', 'max', 'tolerancia', 'maxwarnings', 'maxerrors'];
const PISO = ['minimo', 'min', 'piso', 'cobertura', 'coverage', 'exigido', 'aprovacao'];

/** Tira acento para o padrao pegar "máximo" e "maximo" do mesmo jeito. */
function semAcento(t) {
  return String(t == null ? '' : t)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Acha pares "<palavra de catraca> <numero>" - com ate 12 caracteres de
 * separador entre os dois, o que cobre `teto: 200`, `"teto" = 200`,
 * `tetoDeInstrucoes: 200` e `--max-warnings 0`, sem atravessar a linha.
 */
function pares(texto) {
  const achados = Object.create(null);
  const linhas = semAcento(texto).toLowerCase().split(/\r?\n/);
  // Da mais longa para a mais curta: "maximo" reivindica a posicao antes de
  // "max", e a mesma ocorrencia nao e contada duas vezes com nomes diferentes.
  const todas = TETO.concat(PISO).slice().sort(function (a, b) { return b.length - a.length; });
  for (const linha of linhas) {
    const tomadas = [];
    for (const palavra of todas) {
      // O \b e o que separa "max" de "climax". Sem ele qualquer palavra que
      // CONTENHA uma palavra de catraca vira catraca, e o portao passa a negar
      // edicao honesta - que e o jeito mais rapido de um portao ser desligado.
      const re = new RegExp('\\b' + palavra + '[a-z_-]*["\'\\s:=>_-]{0,12}?(-?\\d+(?:\\.\\d+)?)', 'g');
      let m;
      while ((m = re.exec(linha)) !== null) {
        const valor = Number(m[1]);
        if (!isFinite(valor)) continue;
        if (tomadas.indexOf(m.index) !== -1) continue;
        tomadas.push(m.index);
        if (!achados[palavra]) achados[palavra] = [];
        achados[palavra].push(valor);
      }
    }
  }
  return achados;
}

function familia(palavra) {
  return TETO.indexOf(palavra) !== -1 ? 'teto' : 'piso';
}

/**
 * Compara o antes e o depois de uma edicao. Devolve os afrouxamentos.
 *
 * Conservador de proposito: so acusa quando a MESMA palavra de catraca aparece
 * nos dois lados e o numero andou para o lado que deixa passar mais. Palavra que
 * so existe depois e criacao, nao afrouxamento - e criar catraca nova e o
 * contrario do que esta falha descreve.
 */
function afrouxou(antes, depois) {
  const a = pares(antes);
  const d = pares(depois);
  const achados = [];
  for (const palavra of Object.keys(d)) {
    if (!a[palavra]) continue;
    const fam = familia(palavra);
    // O extremo de cada lado e o que manda: subir o maior teto e afrouxar,
    // mesmo que outro teto na mesma edicao tenha descido.
    const antesV = fam === 'teto' ? Math.max.apply(null, a[palavra]) : Math.min.apply(null, a[palavra]);
    const depoisV = fam === 'teto' ? Math.max.apply(null, d[palavra]) : Math.min.apply(null, d[palavra]);
    if (fam === 'teto' ? depoisV > antesV : depoisV < antesV) {
      achados.push({ palavra: palavra, familia: fam, de: antesV, para: depoisV });
    }
  }
  return achados;
}

function motivo(alvo, achados) {
  const linhas = [
    'esquadro: NEGADO - isto sobe a catraca, e subir catraca e decisao humana.',
    '',
    'Arquivo: ' + alvo
  ];
  for (const a of achados) {
    linhas.push('  ' + a.palavra + ': ' + a.de + ' -> ' + a.para +
      (a.familia === 'teto' ? '  (teto subiu: passa a deixar passar mais)' : '  (piso desceu: passa a exigir menos)'));
  }
  linhas.push('');
  linhas.push('A falha de origem: quando o teste atrapalha, a vontade e mexer no medidor.');
  linhas.push('Remover a causa e a saida. Se a regua estiver mesmo errada, quem decide e o dono,');
  linhas.push('e a decisao fica registrada - nao sai no meio de uma correcao.');
  return linhas.join('\n');
}

module.exports = { TETO, PISO, semAcento, pares, familia, afrouxou, motivo };
