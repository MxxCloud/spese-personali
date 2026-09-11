import * as dati from "./dati.js";

const form = document.getElementById("form-spesa");
const titoloForm = document.getElementById("titolo-form");
const campoData = document.getElementById("data");
const campoImporto = document.getElementById("importo");
const campoDescrizione = document.getElementById("descrizione");
const selectCategoria = document.getElementById("categoria");
const bottoneInvia = document.getElementById("bottone-invia");
const bottoneAnnulla = document.getElementById("bottone-annulla");
const elencoSpese = document.getElementById("elenco-spese");
const elencoErrori = document.getElementById("errori");
const totaleEl = document.getElementById("totale");
const vuotoEl = document.getElementById("vuoto");
const dialogoConferma = document.getElementById("dialogo-conferma");
const titoloConferma = document.getElementById("titolo-conferma");
const dettaglioConferma = document.getElementById("dettaglio-conferma");
const formCategoria = document.getElementById("form-categoria");
const campoNuovaCategoria = document.getElementById("nuova-categoria");
const elencoCategorie = document.getElementById("elenco-categorie");
const conteggioEl = document.getElementById("conteggio");
const filtroDa = document.getElementById("filtro-da");
const filtroA = document.getElementById("filtro-a");
const filtroCategoria = document.getElementById("filtro-categoria");
const filtroTesto = document.getElementById("filtro-testo");
const scorciatoie = document.querySelector(".scorciatoie");
const esportazioni = document.getElementById("esportazioni");
const esportaExcel = document.getElementById("esporta-excel");
const esportaStandard = document.getElementById("esporta-standard");
const includiFisse = document.getElementById("includi-fisse");
const scomposizione = document.getElementById("scomposizione");
const formFissa = document.getElementById("form-fissa");
const fissaDescrizione = document.getElementById("fissa-descrizione");
const fissaImporto = document.getElementById("fissa-importo");
const fissaCategoria = document.getElementById("fissa-categoria");
const fissaInizio = document.getElementById("fissa-inizio");
const fissaFine = document.getElementById("fissa-fine");
const fissaInvia = document.getElementById("fissa-invia");
const fissaAnnulla = document.getElementById("fissa-annulla");
const elencoFisse = document.getElementById("elenco-fisse");
const fisseMeseEtichetta = document.getElementById("fisse-mese-etichetta");
const fisseMeseTotale = document.getElementById("fisse-mese-totale");
const kpiMedia = document.getElementById("kpi-media");
const kpiGiornaliera = document.getElementById("kpi-giornaliera");
const kpiGiorni = document.getElementById("kpi-giorni");
const graficoCategorie = document.getElementById("grafico-categorie");
const graficoMesi = document.getElementById("grafico-mesi");
const pilaCategorie = document.getElementById("pila-categorie");
const totaleMese = document.getElementById("totale-mese");
const etichettaMeseCorrente = document.getElementById("mese-corrente");
const mesePrecedente = document.getElementById("mese-precedente");
const meseSuccessivo = document.getElementById("mese-successivo");
const barraInferiore = document.querySelector(".barra-inferiore");
const apriNuova = document.getElementById("apri-nuova");
const apriFiltri = document.getElementById("apri-filtri");
const pannelloFiltri = document.getElementById("pannello-filtri");
const contaFiltri = document.getElementById("conta-filtri");
const chips = document.getElementById("chips");

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const giorno = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const percentuale = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 });
const meseEsteso = new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric" });
const meseLungo = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
const meseSolo = new Intl.DateTimeFormat("it-IT", { month: "short" });
const giornoEsteso = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });

let idInModifica = null;
let idFissaInModifica = null;
let vistaAttiva = "mese";
let meseVisualizzato = dati.meseCorrente();
let idSpesaAperta = null;

// --- colori delle categorie ----------------------------------------------

// L'assegnazione segue l'ordine stabile delle categorie, così un colore resta
// legato alla stessa categoria anche quando un filtro ne toglie altre di mezzo.
// Oltre la sesta si usa un neutro invece di riciclare una tinta già in uso.
function coloreCategoria(nome) {
  const posizione = dati.nomiCategorie().indexOf(nome);
  return posizione >= 0 && posizione < 6
    ? `var(--cat-${posizione + 1})`
    : "var(--cat-oltre)";
}

function creaPunto(categoria) {
  const punto = document.createElement("i");
  punto.className = "punto";
  punto.style.background = coloreCategoria(categoria);
  return punto;
}

// --- viste ---------------------------------------------------------------

function mostraVista(nome) {
  vistaAttiva = nome;
  document.body.dataset.vista = nome;
  for (const vista of document.querySelectorAll(".vista")) {
    vista.classList.toggle("attiva", vista.id === `vista-${nome}`);
  }
  for (const voce of barraInferiore.querySelectorAll(".voce-nav")) {
    const attiva = voce.dataset.vista === nome;
    voce.toggleAttribute("aria-current", attiva);
    if (attiva) voce.setAttribute("aria-current", "page");
  }
  window.scrollTo({ top: 0 });
}

// --- filtri --------------------------------------------------------------

function filtriAttivi() {
  const filtri = {};
  if (filtroDa.value) filtri.da = filtroDa.value;
  if (filtroA.value) filtri.a = filtroA.value;
  if (filtroCategoria.value) filtri.categoria = filtroCategoria.value;
  if (filtroTesto.value.trim()) filtri.testo = filtroTesto.value.trim();
  return filtri;
}

function intervalloPeriodo(periodo) {
  const adesso = new Date();
  const anno = adesso.getFullYear();
  const mese = adesso.getMonth();

  if (periodo === "mese") {
    return [
      dati.isoLocale(new Date(anno, mese, 1)),
      dati.isoLocale(new Date(anno, mese + 1, 0)),
    ];
  }
  if (periodo === "mese-scorso") {
    return [
      dati.isoLocale(new Date(anno, mese - 1, 1)),
      dati.isoLocale(new Date(anno, mese, 0)),
    ];
  }
  if (periodo === "anno") {
    return [
      dati.isoLocale(new Date(anno, 0, 1)),
      dati.isoLocale(new Date(anno, 11, 31)),
    ];
  }
  return ["", ""];
}

function impostaPeriodo(periodo) {
  const [da, a] = intervalloPeriodo(periodo);
  filtroDa.value = da;
  filtroA.value = a;

  if (periodo === "azzera") {
    filtroCategoria.value = "";
    filtroTesto.value = "";
  }
}

// --- utilità di interfaccia ---------------------------------------------

function mostraErrori(messaggi) {
  elencoErrori.replaceChildren(
    ...messaggi.map((messaggio) => {
      const voce = document.createElement("li");
      voce.textContent = messaggio;
      return voce;
    })
  );
  elencoErrori.hidden = messaggi.length === 0;
}

function dataLocale(iso) {
  return new Date(`${iso}T00:00:00`);
}

function meseLeggibile(mese) {
  return meseEsteso.format(new Date(`${mese}-01T00:00:00`));
}

function creaBottone(testo, classe, azione) {
  const bottone = document.createElement("button");
  bottone.type = "button";
  bottone.className = classe;
  bottone.textContent = testo;
  bottone.addEventListener("click", azione);
  return bottone;
}

function messaggioAssente(testo) {
  const voce = document.createElement("li");
  voce.className = "senza-dati";
  voce.textContent = testo;
  return voce;
}

function chiediConferma(titolo, dettaglio) {
  titoloConferma.textContent = titolo;
  dettaglioConferma.textContent = dettaglio;
  dialogoConferma.showModal();
  return new Promise((risolvi) => {
    dialogoConferma.addEventListener(
      "close",
      () => risolvi(dialogoConferma.returnValue === "conferma"),
      { once: true }
    );
  });
}

/** Applica il risultato di una modifica: mostra gli errori oppure ridisegna. */
async function applica(errori) {
  mostraErrori(errori);
  if (errori.length) {
    await disegna();
    return false;
  }
  await disegna();
  return true;
}

// --- spese ---------------------------------------------------------------

function tornaANuovaSpesa() {
  idInModifica = null;
  form.reset();
  form.hidden = true;
  campoData.value = dati.oggiIso();
  titoloForm.textContent = "Nuova spesa";
  bottoneInvia.textContent = "Aggiungi spesa";
  document.querySelector(".in-modifica")?.classList.remove("in-modifica");
}

function apriFoglioNuova() {
  mostraVista("spese");
  form.hidden = false;
  campoImporto.focus();
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function iniziaModifica(spesa) {
  idInModifica = spesa.id;
  mostraVista("spese");
  form.hidden = false;
  campoData.value = spesa.data;
  campoImporto.value = spesa.importo;
  selectCategoria.value = spesa.categoria;
  campoDescrizione.value = spesa.descrizione;
  titoloForm.textContent = "Modifica spesa";
  bottoneInvia.textContent = "Salva modifiche";
  mostraErrori([]);

  document.querySelector(".in-modifica")?.classList.remove("in-modifica");
  document.getElementById(`spesa-${spesa.id}`)?.classList.add("in-modifica");
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function eliminaSpesa(spesa) {
  const descrizione = spesa.descrizione ? ` — ${spesa.descrizione}` : "";
  const confermato = await chiediConferma(
    "Eliminare la spesa?",
    `${giorno.format(dataLocale(spesa.data))}, ${spesa.categoria}, ${euro.format(spesa.importo)}${descrizione}`
  );
  if (!confermato) return;
  if (idInModifica === spesa.id) tornaANuovaSpesa();
  await applica(await dati.eliminaSpesa(spesa.id));
}

function creaSpesa(spesa) {
  const voce = document.createElement("li");
  voce.id = `spesa-${spesa.id}`;
  voce.className = "spesa";
  if (spesa.id === idSpesaAperta) voce.classList.add("aperta");

  const corpo = document.createElement("span");
  corpo.className = "corpo-spesa";
  const titolo = document.createElement("b");
  titolo.textContent = spesa.descrizione || spesa.categoria;
  const sotto = document.createElement("small");
  sotto.textContent = spesa.descrizione
    ? spesa.categoria
    : giorno.format(dataLocale(spesa.data));
  corpo.append(titolo, sotto);

  const importo = document.createElement("span");
  importo.className = "importo-spesa";
  importo.textContent = euro.format(spesa.importo);

  const azioni = document.createElement("span");
  azioni.className = "azioni-spesa";
  azioni.append(
    creaBottone("Modifica", "minimo", () => iniziaModifica(spesa)),
    creaBottone("Elimina", "minimo pericolo", () => eliminaSpesa(spesa))
  );

  voce.append(creaPunto(spesa.categoria), corpo, importo, azioni);

  // Su telefono le azioni non stanno in riga senza sacrificare l'importo,
  // quindi un tocco sulla spesa le apre invece di tenerle sempre visibili.
  voce.addEventListener("click", (evento) => {
    if (evento.target.closest("button")) return;
    idSpesaAperta = idSpesaAperta === spesa.id ? null : spesa.id;
    voce.classList.toggle("aperta", idSpesaAperta === spesa.id);
    for (const altra of elencoSpese.querySelectorAll(".spesa.aperta")) {
      if (altra !== voce) altra.classList.remove("aperta");
    }
  });

  return voce;
}

function creaTestaGiorno(iso) {
  const testa = document.createElement("li");
  testa.className = "giorno";
  const data = dataLocale(iso);
  testa.textContent =
    iso === dati.oggiIso() ? `Oggi · ${giornoEsteso.format(data)}` : giornoEsteso.format(data);
  return testa;
}

// Raggruppa per giorno, dal più recente: leggere un estratto conto
// significa scorrere i giorni, non una sequenza indistinta di righe.
function vociElenco(spese) {
  const voci = [];
  let giornoPrecedente = null;
  for (const spesa of [...spese].reverse()) {
    if (spesa.data !== giornoPrecedente) {
      voci.push(creaTestaGiorno(spesa.data));
      giornoPrecedente = spesa.data;
    }
    voci.push(creaSpesa(spesa));
  }
  return voci;
}

// --- categorie -----------------------------------------------------------

function opzioniCategoria(categorie) {
  return categorie.map((categoria) => {
    const opzione = document.createElement("option");
    opzione.value = categoria;
    opzione.textContent = categoria;
    return opzione;
  });
}

function popolaCategorie(categorie) {
  const selezione = selectCategoria.value;
  selectCategoria.replaceChildren(...opzioniCategoria(categorie));
  if (categorie.includes(selezione)) selectCategoria.value = selezione;

  const selezioneFissa = fissaCategoria.value;
  fissaCategoria.replaceChildren(...opzioniCategoria(categorie));
  if (categorie.includes(selezioneFissa)) fissaCategoria.value = selezioneFissa;

  const selezioneFiltro = filtroCategoria.value;
  const tutte = document.createElement("option");
  tutte.value = "";
  tutte.textContent = "Tutte";
  filtroCategoria.replaceChildren(tutte, ...opzioniCategoria(categorie));
  if (categorie.includes(selezioneFiltro)) filtroCategoria.value = selezioneFiltro;
}

function creaVoceCategoria(categoria) {
  const voce = document.createElement("li");

  const nome = document.createElement("span");
  nome.className = "nome-categoria";
  nome.textContent = categoria.nome;

  const usi = document.createElement("span");
  usi.className = "usi-categoria";
  usi.textContent =
    categoria.usi === 0 ? "non usata" : `${categoria.usi} ${categoria.usi === 1 ? "spesa" : "spese"}`;

  const azioni = document.createElement("span");
  azioni.className = "azioni";
  azioni.append(
    creaBottone("Rinomina", "minimo", () => avviaRinomina(voce, categoria)),
    creaBottone("Elimina", "minimo pericolo", () => eliminaCategoria(categoria))
  );

  voce.append(nome, usi, azioni);
  return voce;
}

function avviaRinomina(voce, categoria) {
  const campo = document.createElement("input");
  campo.type = "text";
  campo.value = categoria.nome;
  campo.maxLength = 40;
  campo.className = "campo-rinomina";

  const salva = async () => applica(await dati.rinominaCategoria(categoria.id, campo.value));

  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      salva();
    } else if (evento.key === "Escape") {
      disegna();
    }
  });

  voce.replaceChildren(
    campo,
    creaBottone("Salva", "minimo", salva),
    creaBottone("Annulla", "minimo", disegna)
  );
  campo.focus();
  campo.select();
}

async function eliminaCategoria(categoria) {
  const confermato = await chiediConferma("Eliminare la categoria?", categoria.nome);
  if (confermato) await applica(await dati.eliminaCategoria(categoria.id));
}

// --- spese fisse ---------------------------------------------------------

function periodoLeggibile(fissa) {
  const dal = `da ${meseLeggibile(fissa.inizio)}`;
  return fissa.fine ? `${dal} a ${meseLeggibile(fissa.fine)}` : `${dal}, in corso`;
}

function tornaANuovaFissa() {
  idFissaInModifica = null;
  formFissa.reset();
  fissaInvia.textContent = "Aggiungi spesa fissa";
  fissaAnnulla.hidden = true;
}

function iniziaModificaFissa(fissa) {
  idFissaInModifica = fissa.id;
  fissaDescrizione.value = fissa.descrizione;
  fissaImporto.value = fissa.importo;
  fissaCategoria.value = fissa.categoria;
  fissaInizio.value = fissa.inizio;
  fissaFine.value = fissa.fine ?? "";
  fissaInvia.textContent = "Salva modifiche";
  fissaAnnulla.hidden = false;
  mostraErrori([]);
  formFissa.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function eliminaFissa(fissa) {
  const confermato = await chiediConferma(
    "Eliminare la spesa fissa?",
    `${fissa.descrizione} — ${euro.format(fissa.importo)} al mese, ${periodoLeggibile(fissa)}`
  );
  if (!confermato) return;
  if (idFissaInModifica === fissa.id) tornaANuovaFissa();
  await applica(await dati.eliminaFissa(fissa.id));
}

function avviaEccezione(voce, fissa) {
  const mese = document.createElement("input");
  mese.type = "month";
  mese.className = "campo-eccezione";
  mese.value = fissa.inizio;

  const importo = document.createElement("input");
  importo.type = "number";
  importo.step = "0.01";
  importo.min = "0.01";
  importo.className = "campo-eccezione";
  importo.placeholder = "importo del mese";

  const salva = async () =>
    applica(await dati.impostaEccezione(fissa.id, mese.value, importo.value));

  const modulo = document.createElement("div");
  modulo.className = "modulo-eccezione";
  modulo.append(
    mese,
    importo,
    creaBottone("Salva", "minimo", salva),
    creaBottone("Annulla", "minimo", disegna)
  );
  voce.append(modulo);
  importo.focus();
}

function creaVoceEccezione(fissa, eccezione) {
  const voce = document.createElement("li");

  const testo = document.createElement("span");
  testo.textContent = `${meseLeggibile(eccezione.mese)}: ${euro.format(eccezione.importo)}`;

  voce.append(
    testo,
    creaBottone("Rimuovi", "minimo pericolo", async () =>
      applica(await dati.eliminaEccezione(fissa.id, eccezione.mese))
    )
  );
  return voce;
}

function creaVoceFissa(fissa) {
  const voce = document.createElement("li");

  const nome = document.createElement("span");
  nome.className = "nome-fissa";
  nome.textContent = fissa.descrizione;

  const dettaglio = document.createElement("span");
  dettaglio.className = "dettaglio-fissa";
  dettaglio.textContent = `${euro.format(fissa.importo)} al mese · ${fissa.categoria} · ${periodoLeggibile(fissa)}`;

  const azioni = document.createElement("span");
  azioni.className = "azioni";
  azioni.append(
    creaBottone("Modifica", "minimo", () => iniziaModificaFissa(fissa)),
    creaBottone("Mese diverso", "minimo", () => avviaEccezione(voce, fissa)),
    creaBottone("Elimina", "minimo pericolo", () => eliminaFissa(fissa))
  );

  const riga = document.createElement("div");
  riga.className = "riga-fissa";
  riga.append(nome, dettaglio, azioni);
  voce.append(riga);

  if (fissa.eccezioni.length) {
    const eccezioni = document.createElement("ul");
    eccezioni.className = "eccezioni";
    eccezioni.replaceChildren(
      ...fissa.eccezioni.map((eccezione) => creaVoceEccezione(fissa, eccezione))
    );
    voce.append(eccezioni);
  }

  return voce;
}

// --- riepilogo -----------------------------------------------------------

function creaBarraCategoria(voce, massimo) {
  const riga = document.createElement("li");

  const etichetta = document.createElement("span");
  etichetta.className = "etichetta-barra";
  etichetta.append(creaPunto(voce.categoria), voce.categoria);

  const traccia = document.createElement("span");
  traccia.className = "traccia";
  const riempimento = document.createElement("span");
  riempimento.className = "riempimento";
  riempimento.style.width = `${massimo ? (voce.totale / massimo) * 100 : 0}%`;
  riempimento.style.background = coloreCategoria(voce.categoria);
  traccia.append(riempimento);

  const valore = document.createElement("span");
  valore.className = "valore-barra";
  valore.textContent = `${euro.format(voce.totale)} · ${percentuale.format(voce.quota)}`;

  riga.append(etichetta, traccia, valore);
  return riga;
}

function creaColonnaMese(voce, massimo, etichettato = true) {
  const colonna = document.createElement("li");
  if (voce.mese === meseVisualizzato) colonna.className = "mese-mostrato";

  const valore = document.createElement("span");
  valore.className = "valore-colonna";
  valore.textContent = etichettato ? euro.format(voce.totale) : "";

  const asta = document.createElement("span");
  asta.className = "asta";
  // Un mese senza spese resta vuoto: una barra minima direbbe il falso.
  asta.style.height = voce.totale > 0 ? `${(voce.totale / massimo) * 100}%` : "0";

  const contenitore = document.createElement("span");
  contenitore.className = "contenitore-asta";
  contenitore.append(asta);

  const etichetta = document.createElement("span");
  etichetta.className = "etichetta-colonna";
  // Solo il mese: l'anno è già nell'intestazione del cruscotto, e ripeterlo
  // qui fa troncare l'etichetta su schermo stretto ("mag 20…").
  etichetta.textContent = meseSolo.format(dataLocale(`${voce.mese}-01`));

  colonna.append(valore, contenitore, etichetta);
  return colonna;
}

// --- esportazione --------------------------------------------------------

function scaricaCsv(formato) {
  const filtri = filtriAttivi();
  scarica(
    dati.speseInCsv(filtri, formato, includiFisse.checked),
    dati.nomeFileCsv(filtri),
    "text/csv;charset=utf-8"
  );
}

// --- disegno complessivo -------------------------------------------------

function disegna() {
  const filtri = filtriAttivi();
  const filtrato = Object.keys(filtri).length > 0;
  const conFisse = includiFisse.checked;

  const spese = dati.elencaSpese(filtri);
  const ricorrenze = conFisse ? dati.occorrenzeFisse(filtri) : [];
  const totaleCorrenti = spese.reduce((somma, s) => somma + s.importo, 0);
  const totaleFisse = ricorrenze.reduce((somma, r) => somma + r.importo, 0);

  popolaCategorie(dati.nomiCategorie());
  elencoSpese.replaceChildren(...vociElenco(spese));

  totaleEl.textContent = euro.format(totaleCorrenti + totaleFisse);

  const numero = spese.length;
  const singolare = numero === 1;
  conteggioEl.textContent = numero
    ? `su ${numero} ${singolare ? "spesa" : "spese"}` +
      (filtrato ? (singolare ? " filtrata" : " filtrate") : "")
    : "";

  const senzaSpese = numero === 0;
  esportazioni.hidden = senzaSpese;
  elencoSpese.hidden = senzaSpese;
  vuotoEl.hidden = !senzaSpese;
  vuotoEl.textContent = filtrato
    ? "Nessuna spesa corrisponde ai filtri impostati."
    : "Nessuna spesa registrata finora.";

  aggiornaChips(filtri);

  if (idInModifica !== null) {
    document.getElementById(`spesa-${idInModifica}`)?.classList.add("in-modifica");
  }

  disegnaMese();
  disegnaCategorie();
  disegnaFisse();
}

// Il cruscotto guarda un mese alla volta, indipendente dai filtri
// dell'elenco: le due viste rispondono a due domande diverse.
function disegnaMese() {
  const conFisse = includiFisse.checked;
  const [da, a] = dati.estremiDelMese(meseVisualizzato);
  const riepilogo = dati.riepilogo({ da, a }, conFisse);

  etichettaMeseCorrente.textContent = capitalizza(
    meseLungo.format(dataLocale(`${meseVisualizzato}-01`))
  );
  meseSuccessivo.disabled = meseVisualizzato >= dati.meseCorrente();

  totaleMese.textContent = euro.format(riepilogo.totale);

  const correnti = dati.elencaSpese({ da, a }).reduce((s, v) => s + v.importo, 0);
  const fisse = riepilogo.totale - correnti;
  scomposizione.hidden = !conFisse || fisse <= 0;
  scomposizione.textContent = `${euro.format(fisse)} di fisse + ${euro.format(correnti)} di correnti`;

  kpiMedia.textContent = riepilogo.numero ? euro.format(riepilogo.media) : "—";
  kpiGiornaliera.textContent = riepilogo.numero
    ? euro.format(riepilogo.mediaGiornaliera)
    : "—";
  kpiGiorni.textContent = riepilogo.numero
    ? `${riepilogo.giorni} ${riepilogo.giorni === 1 ? "giorno" : "giorni"}`
    : "—";

  pilaCategorie.replaceChildren(
    ...riepilogo.perCategoria.map((voce) => {
      const segmento = document.createElement("span");
      segmento.style.flex = `${voce.totale} 0 0`;
      segmento.style.background = coloreCategoria(voce.categoria);
      return segmento;
    })
  );

  const massimoCategoria = Math.max(0, ...riepilogo.perCategoria.map((v) => v.totale));
  graficoCategorie.replaceChildren(
    ...(riepilogo.perCategoria.length
      ? riepilogo.perCategoria.map((voce) => creaBarraCategoria(voce, massimoCategoria))
      : [messaggioAssente("Nessuna spesa in questo mese.")])
  );

  disegnaUltimiMesi(conFisse);
}

// Sei mesi fino a quello mostrato: entrano in larghezza su un telefono
// senza scorrimento orizzontale, e bastano a far vedere un andamento.
function disegnaUltimiMesi(conFisse) {
  const totali = ultimiMesi(meseVisualizzato, 6).map((mese) => {
    const [da, a] = dati.estremiDelMese(mese);
    return { mese, totale: dati.riepilogo({ da, a }, conFisse).totale };
  });

  const massimo = Math.max(0, ...totali.map((v) => v.totale));
  // Un numero su ogni colonna è rumore: si etichettano solo il mese mostrato
  // e quello più alto, che sono le due colonne che si vanno a cercare.
  const daEtichettare = new Set([
    meseVisualizzato,
    totali.find((v) => v.totale === massimo)?.mese,
  ]);

  graficoMesi.replaceChildren(
    ...(massimo > 0
      ? totali.map((voce) => creaColonnaMese(voce, massimo, daEtichettare.has(voce.mese)))
      : [messaggioAssente("Nessuna spesa da riepilogare.")])
  );
}

function ultimiMesi(ultimo, quanti) {
  const mesi = [];
  let [anno, mese] = ultimo.split("-").map(Number);
  for (let i = 0; i < quanti; i += 1) {
    mesi.unshift(`${String(anno).padStart(4, "0")}-${String(mese).padStart(2, "0")}`);
    [anno, mese] = mese === 1 ? [anno - 1, 12] : [anno, mese - 1];
  }
  return mesi;
}

function capitalizza(testo) {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

// Il pallino sul chip dei filtri dice che una selezione è attiva anche
// quando il pannello è chiuso: altrimenti un totale filtrato sembra sbagliato.
function aggiornaChips(filtri) {
  contaFiltri.hidden = Object.keys(filtri).length === 0;
  for (const chip of chips.querySelectorAll("[data-periodo]")) {
    chip.setAttribute("aria-pressed", String(chip.dataset.periodo === periodoAttivo(filtri)));
  }
}

function periodoAttivo(filtri) {
  if (!filtri.da || !filtri.a || filtri.categoria || filtri.testo) return null;
  for (const periodo of ["mese", "mese-scorso", "anno"]) {
    const [da, a] = intervalloPeriodo(periodo);
    if (da === filtri.da && a === filtri.a) return periodo;
  }
  return null;
}

function disegnaCategorie() {
  elencoCategorie.replaceChildren(...dati.elencaCategorie().map(creaVoceCategoria));
}

function disegnaFisse() {
  const fisse = dati.elencaFisse();
  elencoFisse.replaceChildren(
    ...(fisse.length
      ? fisse.map(creaVoceFissa)
      : [messaggioAssente("Nessuna spesa fissa registrata.")])
  );

  const mese = dati.meseCorrente();
  const delMese = dati.fisseDelMese(mese);
  const totale = delMese.reduce((somma, voce) => somma + voce.importo, 0);

  fisseMeseEtichetta.textContent = delMese.length
    ? `${meseLeggibile(mese)} · ${delMese.length} ${delMese.length === 1 ? "voce attiva" : "voci attive"}`
    : `${meseLeggibile(mese)} · nessuna voce attiva`;
  fisseMeseTotale.textContent = euro.format(totale);
}

// --- eventi --------------------------------------------------------------

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  const errori =
    idInModifica === null
      ? await dati.aggiungiSpesa(payload)
      : await dati.aggiornaSpesa(idInModifica, payload);

  if (await applica(errori)) tornaANuovaSpesa();
});

bottoneAnnulla.addEventListener("click", tornaANuovaSpesa);

formCategoria.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const errori = await dati.aggiungiCategoria(campoNuovaCategoria.value);
  if (await applica(errori)) formCategoria.reset();
});

formFissa.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const payload = Object.fromEntries(new FormData(formFissa));
  const errori =
    idFissaInModifica === null
      ? await dati.aggiungiFissa(payload)
      : await dati.aggiornaFissa(idFissaInModifica, payload);

  if (await applica(errori)) tornaANuovaFissa();
});

fissaAnnulla.addEventListener("click", tornaANuovaFissa);

for (const campo of [filtroDa, filtroA, filtroCategoria]) {
  campo.addEventListener("change", disegna);
}

let attesaRicerca;
filtroTesto.addEventListener("input", () => {
  clearTimeout(attesaRicerca);
  attesaRicerca = setTimeout(disegna, 250);
});

scorciatoie.addEventListener("click", (evento) => {
  const periodo = evento.target.dataset.periodo;
  if (!periodo) return;
  impostaPeriodo(periodo);
  disegna();
});

chips.addEventListener("click", (evento) => {
  const chip = evento.target.closest("[data-periodo]");
  if (!chip) return;
  // Un secondo tocco sullo stesso periodo lo toglie: senza, per tornare a
  // vedere tutto bisognerebbe aprire i filtri.
  impostaPeriodo(chip.getAttribute("aria-pressed") === "true" ? "azzera" : chip.dataset.periodo);
  disegna();
});

barraInferiore.addEventListener("click", (evento) => {
  const voce = evento.target.closest(".voce-nav");
  if (voce) mostraVista(voce.dataset.vista);
});

apriNuova.addEventListener("click", apriFoglioNuova);

apriFiltri.addEventListener("click", () => {
  const aperto = apriFiltri.getAttribute("aria-expanded") === "true";
  apriFiltri.setAttribute("aria-expanded", String(!aperto));
  pannelloFiltri.hidden = aperto;
});

mesePrecedente.addEventListener("click", () => {
  meseVisualizzato = spostaMese(meseVisualizzato, -1);
  disegnaMese();
});

meseSuccessivo.addEventListener("click", () => {
  meseVisualizzato = spostaMese(meseVisualizzato, 1);
  disegnaMese();
});

function spostaMese(mese, passo) {
  const [anno, numero] = mese.split("-").map(Number);
  const spostato = new Date(anno, numero - 1 + passo, 1);
  return dati.isoLocale(spostato).slice(0, 7);
}

includiFisse.addEventListener("change", () => {
  try {
    localStorage.setItem("includiFisse", includiFisse.checked ? "1" : "0");
  } catch {
    // La preferenza non è essenziale: se il browser blocca l'archiviazione si prosegue.
  }
  disegna();
});

esportaExcel.addEventListener("click", () => scaricaCsv("excel"));
esportaStandard.addEventListener("click", () => scaricaCsv("standard"));

// --- backup e ripristino -------------------------------------------------

const scaricaBackup = document.getElementById("scarica-backup");
const caricaBackup = document.getElementById("carica-backup");

function scarica(testo, nomeFile, tipo) {
  const indirizzo = URL.createObjectURL(new Blob([testo], { type: tipo }));
  const collegamento = document.createElement("a");
  collegamento.href = indirizzo;
  collegamento.download = nomeFile;
  collegamento.click();
  URL.revokeObjectURL(indirizzo);
}

scaricaBackup.addEventListener("click", () => {
  scarica(
    JSON.stringify(dati.esportaBackup(), null, 2),
    dati.nomeFileBackup(),
    "application/json"
  );
});

caricaBackup.addEventListener("change", async () => {
  const file = caricaBackup.files?.[0];
  if (!file) return;

  const confermato = await chiediConferma(
    "Ripristinare dal backup?",
    `«${file.name}» sostituirà tutte le spese, le categorie e le spese fisse registrate ora.`
  );
  if (!confermato) {
    caricaBackup.value = "";
    return;
  }

  let contenuto = null;
  try {
    contenuto = JSON.parse(await file.text());
  } catch {
    mostraErrori(["Il file non è leggibile: non contiene dati in formato JSON."]);
    caricaBackup.value = "";
    return;
  }

  const errori = await dati.importaBackup(contenuto);
  caricaBackup.value = "";
  tornaANuovaSpesa();
  tornaANuovaFissa();
  await applica(errori);
});

// --- installazione e funzionamento offline -------------------------------

const bottoneInstalla = document.getElementById("installa");
const istruzioniInstalla = document.getElementById("istruzioni-installa");
let invitoInstallazione = null;
let statoOffline = "non supportato da questo browser";

// La registrazione va tentata subito: aspettare il caricamento completo la
// ritarda senza motivo, e il browser valuta l'idoneità all'installazione solo
// dopo che un service worker è attivo.
if ("serviceWorker" in navigator) {
  statoOffline = "registrazione in corso";
  navigator.serviceWorker
    .register("./sw.js")
    .then((registrazione) => {
      statoOffline = registrazione.active ? "attivo" : "in attivazione";
    })
    .catch((errore) => {
      // L'errore va mostrato: silenziarlo rende impossibile capire perché la
      // app non risulta installabile né funziona offline.
      statoOffline = `non riuscita (${errore.message})`;
    });
}

// Alcuni browser non lanciano mai l'invito automatico. Il pulsante resta
// comunque visibile e spiega la strada manuale, invece di sparire in silenzio.
window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  invitoInstallazione = evento;
  istruzioniInstalla.hidden = true;
});

bottoneInstalla.addEventListener("click", async () => {
  if (invitoInstallazione) {
    bottoneInstalla.hidden = true;
    invitoInstallazione.prompt();
    await invitoInstallazione.userChoice;
    invitoInstallazione = null;
    return;
  }

  istruzioniInstalla.textContent =
    'Dal menu del browser scegli "Installa app" oppure "Aggiungi a schermata Home". ' +
    `Se la voce non c'è, riporta questa riga: ${await diagnosi()}`;
  istruzioniInstalla.hidden = false;
});

/** Stato dei requisiti che il browser controlla prima di offrire l'installazione. */
async function diagnosi() {
  const voci = [`offline ${statoOffline}`];

  voci.push(
    navigator.serviceWorker?.controller ? "pagina controllata" : "pagina NON controllata"
  );

  try {
    const nomi = await caches.keys();
    const deposito = nomi.length ? await caches.open(nomi[0]) : null;
    const quante = deposito ? (await deposito.keys()).length : 0;
    voci.push(`cache ${nomi.join(",") || "assente"} con ${quante} risorse`);
  } catch (errore) {
    voci.push(`cache non leggibile (${errore.name})`);
  }

  try {
    const risposta = await fetch("manifest.webmanifest");
    const manifest = await risposta.json();
    voci.push(`manifesto ${risposta.status}, ${manifest.icons.length} icone`);
  } catch (errore) {
    voci.push(`manifesto non leggibile (${errore.name})`);
  }

  voci.push(`invito automatico ${invitoInstallazione ? "ricevuto" : "mai arrivato"}`);
  return voci.join(" · ");
}

function nascondiSeGiaInstallata() {
  const avviata = window.matchMedia("(display-mode: standalone)").matches;
  bottoneInstalla.hidden = avviata;
  if (avviata) istruzioniInstalla.hidden = true;
}

window.addEventListener("appinstalled", () => {
  bottoneInstalla.hidden = true;
  istruzioniInstalla.hidden = true;
  invitoInstallazione = null;
});

nascondiSeGiaInstallata();

// --- avvio ---------------------------------------------------------------

try {
  includiFisse.checked = localStorage.getItem("includiFisse") !== "0";
} catch {
  // Resta il valore predefinito del documento.
}

await dati.inizializza();
mostraVista("spese");
tornaANuovaSpesa();
tornaANuovaFissa();
disegna();
