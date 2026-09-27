/**
 * BIBLIOGRAFIA - zjednotenie tvaru mien a poradia.
 *
 * Ciel: v bloku "Zdroje a literatura" ma autor tvar `Priezvisko I.:`, zaznamy
 * su zoradene podla priezviska a odkazy stoja az na konci.
 *
 * CO SA NEDOTYKA (a preco):
 *  - clanky s cislovanymi poznamkami (1., 2., 3. ...) - to nie je bibliografia,
 *    ale poznamkovy aparat, v ktorom je poradie nositelom vyznamu;
 *  - clanky, kde sa do zdrojov rozsypalo telo clanku (znamy defekt migracie);
 *  - zaznamy s viacerymi autormi - tie sa len zaraduju podla prveho
 *    priezviska, text ostava slovo za slovom taky, aky bol;
 *  - cokolvek, co sa nepodari bezpecne rozobrat - ostava doslovne.
 *
 * POZOR NA SPATNE LOMITKA. V bezretazcovom zapise ich JS zhltne ('\s' je len
 * "s") a vyraz potom ticho porovnava nieco ine - pri prvom pokuse to z mena
 * MALEC spravilo "Lec". Preto su tu vsetky triedy zapisane bez lomitok:
 * namiesto \s je [ ], namiesto \. je [.].
 */

var VELKE = 'A-Z' + 'ÁÄČĎÉÍĹĽŇÓÔŔŘŠŤÚÝŽ' + 'ÀÂÈÊËÎÏÖÕŐÜŰÛÅÆØĄĘŁŚŹŻĆÑĖĪŪĒŃŘÇ';
var MALE = 'a-z' + 'áäčďéíĺľňóôŕřšťúýž' + 'àâèêëîïöõőüűûåæøąęłśźżćñėīūēńßçě';
var MEDZERA = '[  ]';
var POMLCKY = '–—-';

var TITULY = new RegExp('^((Bc|Mgr|PhDr|RNDr|Ing|Dr|prof|doc|PaedDr|MUDr|JUDr)[.]' + MEDZERA + '*)+', 'i');

var APOSTROFY = String.fromCharCode(8217) + String.fromCharCode(39);
var P = '[' + VELKE + '][' + MALE + VELKE + ']+(?:[-' + APOSTROFY + '][' + VELKE + ']?[' + MALE + VELKE + ']+)*';
var I = '[' + VELKE + ']';

function naTvarMena(s) {
  return String(s).replace(new RegExp('[' + VELKE + '][' + VELKE + ']+', 'g'),
    function (m) { return m.charAt(0) + m.slice(1).toLowerCase(); });
}

function jeAdresa(t) {
  return new RegExp('^(https?://|www[.])[^ ]*$', 'i').test(String(t).trim());
}

function viacAutorov(t) {
  var text = String(t);
  var dvojbodka = text.indexOf(':');
  /* Hlava = menna cast zaznamu. Bez nej by sa do testov dostal nazov diela:
     lomitko v "Slovenska archeologia VII/1959" vyzeralo ako spoluautori
     a zaznam sa potom neprepisal, hoci mal jedneho autora. */
  var hlava = dvojbodka >= 0 ? text.slice(0, dvojbodka) : text.slice(0, 45);
  var prvyToken = text.split(/[ ,]/)[0] || '';
  if (prvyToken.indexOf('/') >= 0) return true;
  if (new RegExp(MEDZERA + '[' + POMLCKY + ']' + MEDZERA + '*[' + VELKE + ']').test(text.slice(0, 45))) return true;
  if (new RegExp('a kolektív|a kol[.]|et al[.]', 'i').test(hlava)) return true;
  var menoTvar = new RegExp('^[' + VELKE + '][' + MALE + VELKE + ']{2,}$');
  var mena = hlava.split(/[,;]/).slice(0, 4).map(function (x) { return x.trim(); })
    .filter(function (x) { return menoTvar.test(x) && !/^(In|Ed|Zost|Red)$/i.test(x); });
  return mena.length >= 3;
}

var VZORY = [
  /* Dvojslovne priezviska: castica (Le, Van, De...) alebo dve mena spojene
     pomlckou. Text sa needituje, ide len o spravne zaradenie do abecedy. */
  { re: new RegExp('^((?:Le|La|Van|Von|De|Del|Della|Da|Di|Du|Mac|Mc|Saint|St)[ ]' + P + '),' + MEDZERA + '*(' + I + ')[.]'), p: 1, i: 2, neprepisovat: true },
  { re: new RegExp('^(' + P + MEDZERA + '*[' + POMLCKY + ']' + MEDZERA + '*' + P + '),' + MEDZERA + '*(' + I + ')[.]'), p: 1, i: 2, neprepisovat: true },

  // Priezvisko I. rok: ...  (uz zjednoteny tvar s rokom)
  /* Rok ostava v zvysku - keby ho vzor zhltol, prepis by ho zmazal. */
  { re: new RegExp('^(' + P + ')' + MEDZERA + '+(' + I + ')[.]?(?=[,]?' + MEDZERA + '+[0-9]{4})'), p: 1, i: 2 },

  // Priezvisko rok - I. Priezvisko: ...  (skrateny odkaz, text sa needituje)
  { re: new RegExp('^(' + P + ')' + MEDZERA + '+[0-9]{4}[a-z]?' + MEDZERA + '*[' + POMLCKY + ']'), p: 1, i: 0 },
  // Priezvisko I. J. rok: ...  (dve iniciALY)
  { re: new RegExp('^(' + P + ')' + MEDZERA + '+(' + I + ')[.]' + MEDZERA + '*' + I + '[.](?=' + MEDZERA + ')'), p: 1, i: 2 , neprepisovat: true },
  // Priezvisko I. a kol.: ...
  { re: new RegExp('^(' + P + ')' + MEDZERA + '+(' + I + ')[.]?' + MEDZERA + '+a' + MEDZERA + '+kol'), p: 1, i: 2 },

  { re: new RegExp('^(' + P + '),' + MEDZERA + '*(' + I + ')[.]?(?=[ ,:])'), p: 1, i: 2 },
  { re: new RegExp('^(' + P + '),' + MEDZERA + '*(' + I + ')[' + MALE + ']+(?=[ ,:])'), p: 1, i: 2 },
  { re: new RegExp('^(' + I + ')[.]' + MEDZERA + '*(' + P + ')(?=[ ,:])'), p: 2, i: 1 },
  { re: new RegExp('^(' + I + ')[' + MALE + ']+' + MEDZERA + '+(' + P + ')' + MEDZERA + '+a' + MEDZERA + '+kol'), p: 2, i: 1 },
  { re: new RegExp('^(' + I + ')[' + MALE + ']+' + MEDZERA + '+(' + P + ')' + MEDZERA + '*(?=:)'), p: 2, i: 1 },
  { re: new RegExp('^(' + P + ')' + MEDZERA + '+(' + I + ')[.]?(?=' + MEDZERA + '*:)'), p: 1, i: 2 },
  { re: new RegExp('^(' + P + ')/'), p: 1, i: 0 },
  { re: new RegExp('^(' + P + ')' + MEDZERA + '*(?=:)'), p: 1, i: 0 }
];

function rozober(povodny) {
  var t = String(povodny).replace(TITULY, '').trim();
  for (var k = 0; k < VZORY.length; k++) {
    var v = VZORY[k];
    var m = t.match(v.re);
    if (!m) continue;
    var priezvisko = naTvarMena(m[v.p]);
    var iniciala = v.i ? naTvarMena(m[v.i]).charAt(0) : '';
    if (priezvisko.length < 3) continue;
    return { priezvisko: priezvisko, iniciala: iniciala, zvysok: t.slice(m[0].length), vzor: k, neprepisovat: !!v.neprepisovat };
  }
  return null;
}

var POPISKY = new RegExp('^(Foto|Fotografie|Fotografia|Obrázky|Obrázok|Mapa|Mapy|Video|Preklad|Text|Kresba|Autor fotografií|Autorka fotografií|Zdroj produktov|Literatúra|Lit)' + MEDZERA + '*:', 'i');

function zatried(item) {
  var text = String(item.text || '').trim();
  var url = String(item.url || '').trim();
  if (!text && !url) return { druh: 'prazdne', text: text, url: url };
  if (url || jeAdresa(text)) return { druh: 'odkaz', text: text, url: url };
  if (POPISKY.test(text)) return { druh: 'poznamka', text: text, url: url };

  var rozbor = rozober(text);
  if (!rozbor) return { druh: 'poznamka', text: text, url: url };

  var vela = viacAutorov(text);
  var navrh = rozbor.iniciala ? rozbor.priezvisko + ' ' + rozbor.iniciala + '.' + rozbor.zvysok : text;
  var novyText = (vela || rozbor.neprepisovat || !rozbor.iniciala) ? text : navrh;
  return {
    druh: 'autor', kluc: rozbor.priezvisko, vzor: rozbor.vzor,
    text: text, url: url, novyText: novyText, prepisane: novyText !== text
  };
}

module.exports = { zatried: zatried, rozober: rozober, jeAdresa: jeAdresa, naTvarMena: naTvarMena, viacAutorov: viacAutorov, VZORY: VZORY };
