import * as dati from "./dati.js";

const form = document.getElementById("form-spesa");
const titoloForm = document.getElementById("titolo-form");
const campoData = document.getElementById("data");
const campoImporto = document.getElementById("importo");
const campoDescrizione = document.getElementById("descrizione");
const selectCategoria = document.getElementById("categoria");
const bottoneInvia = document.getElementById("bottone-invia");
const bottoneAnnulla = document.getElementById("bottone-annulla");
const corpoTabella = document.getElementById("corpo-tabella");
const tabella = document.getElementById("tabella");
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

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const giorno = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const percentuale = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 });
const meseEsteso = new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric" });

let idInModifica = null;
let idFissaInModifica = null;

// --- filtri --------------------------------------------------------------

function filtriAttivi() {
  const filtri = {};
  if (filtroDa.value) filtri.da = filtroDa.value;
  if (filtroA.value) filtri.a = filtroA.value;
  if (filtroCategoria.value) filtri.categoria = filtroCategoria.value;
  if (filtroTesto.value.trim()) filtri.testo = filtroTesto.value.trim();
  return filtri;
}

function impostaPeriodo(periodo) {
  const adesso = new Date();
  const anno = adesso.getFullYear();
  const mese = adesso.getMonth();

  if (periodo === "azzera") {
    filtroDa.value = "";
    filtroA.value = "";
    filtroCategoria.value = "";
    filtroTesto.value = "";
  } else if (periodo === "mese") {
    filtroDa.value = dati.isoLocale(new Date(anno, mese, 1));
    filtroA.value = dati.isoLocale(new Date(anno, mese + 1, 0));
  } else if (periodo === "mese-scorso") {
    filtroDa.value = dati.isoLocale(new Date(anno, mese - 1, 1));
    filtroA.value = dati.isoLocale(new Date(anno, mese, 0));
  } else if (periodo === "anno") {
    filtroDa.value = dati.isoLocale(new Date(anno, 0, 1));
    filtroA.value = dati.isoLocale(new Date(anno, 11, 31));
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
  campoData.value = dati.oggiIso();
  titoloForm.textContent = "Nuova spesa";
  bottoneInvia.textContent = "Aggiungi spesa";
  bottoneAnnulla.hidden = true;
  document.querySelector("tr.in-modifica")?.classList.remove("in-modifica");
}

function iniziaModifica(spesa) {
  idInModifica = spesa.id;
  campoData.value = spesa.data;
  campoImporto.value = spesa.importo;
  selectCategoria.value = spesa.categoria;
  campoDescrizione.value = spesa.descrizione;
  titoloForm.textContent = "Modifica spesa";
  bottoneInvia.textContent = "Salva modifiche";
  bottoneAnnulla.hidden = false;
  mostraErrori([]);

  document.querySelector("tr.in-modifica")?.classList.remove("in-modifica");
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

function creaRiga(spesa) {
  const riga = document.createElement("tr");
  riga.id = `spesa-${spesa.id}`;

  const valori = [
    giorno.format(dataLocale(spesa.data)),
    spesa.categoria,
    spesa.descrizione || "—",
    euro.format(spesa.importo),
  ];
  valori.forEach((valore, indice) => {
    const cella = document.createElement("td");
    cella.textContent = valore;
    if (indice === valori.length - 1) cella.className = "num";
    riga.append(cella);
  });

  const azioni = document.createElement("td");
  azioni.className = "azioni";
  azioni.append(
    creaBottone("Modifica", "minimo", () => iniziaModifica(spesa)),
    creaBottone("Elimina", "minimo pericolo", () => eliminaSpesa(spesa))
  );
  riga.append(azioni);

  return riga;
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
  etichetta.textContent = voce.categoria;

  const traccia = document.createElement("span");
  traccia.className = "traccia";
  const riempimento = document.createElement("span");
  riempimento.className = "riempimento";
  riempimento.style.width = `${massimo ? (voce.totale / massimo) * 100 : 0}%`;
  traccia.append(riempimento);

  const valore = document.createElement("span");
  valore.className = "valore-barra";
  valore.textContent = `${euro.format(voce.totale)} · ${percentuale.format(voce.quota)}`;

  riga.append(etichetta, traccia, valore);
  return riga;
}

function creaColonnaMese(voce, massimo) {
  const colonna = document.createElement("li");

  const valore = document.createElement("span");
  valore.className = "valore-colonna";
  valore.textContent = euro.format(voce.totale);

  const asta = document.createElement("span");
  asta.className = "asta";
  asta.style.height = `${massimo ? (voce.totale / massimo) * 100 : 0}%`;

  const contenitore = document.createElement("span");
  contenitore.className = "contenitore-asta";
  contenitore.append(asta);

  const etichetta = document.createElement("span");
  etichetta.className = "etichetta-colonna";
  etichetta.textContent = meseLeggibile(voce.mese);

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
  corpoTabella.replaceChildren(...spese.map(creaRiga));

  totaleEl.textContent = euro.format(totaleCorrenti + totaleFisse);
  scomposizione.hidden = ricorrenze.length === 0;
  scomposizione.textContent =
    `${euro.format(totaleCorrenti)} di spese correnti` +
    ` + ${euro.format(totaleFisse)} di spese fisse` +
    ` su ${ricorrenze.length} mensilità`;

  const numero = spese.length;
  const singolare = numero === 1;
  conteggioEl.textContent = numero
    ? `su ${numero} ${singolare ? "spesa" : "spese"}` +
      (filtrato ? (singolare ? " filtrata" : " filtrate") : "")
    : "";

  const senzaSpese = numero === 0;
  esportazioni.hidden = senzaSpese;
  tabella.hidden = senzaSpese;
  vuotoEl.hidden = !senzaSpese;
  vuotoEl.textContent = filtrato
    ? "Nessuna spesa corrisponde ai filtri impostati."
    : "Nessuna spesa registrata finora.";

  if (idInModifica !== null) {
    document.getElementById(`spesa-${idInModifica}`)?.classList.add("in-modifica");
  }

  disegnaRiepilogo(filtri, conFisse);
  disegnaCategorie();
  disegnaFisse();
}

function disegnaRiepilogo(filtri, conFisse) {
  const riepilogo = dati.riepilogo(filtri, conFisse);

  kpiMedia.textContent = riepilogo.numero ? euro.format(riepilogo.media) : "—";
  kpiGiornaliera.textContent = riepilogo.numero
    ? euro.format(riepilogo.mediaGiornaliera)
    : "—";
  kpiGiorni.textContent = riepilogo.numero
    ? `${riepilogo.giorni} ${riepilogo.giorni === 1 ? "giorno" : "giorni"}`
    : "—";

  const massimoCategoria = Math.max(0, ...riepilogo.perCategoria.map((v) => v.totale));
  graficoCategorie.replaceChildren(
    ...(riepilogo.perCategoria.length
      ? riepilogo.perCategoria.map((voce) => creaBarraCategoria(voce, massimoCategoria))
      : [messaggioAssente("Nessuna spesa da riepilogare.")])
  );

  const massimoMese = Math.max(0, ...riepilogo.perMese.map((v) => v.totale));
  graficoMesi.replaceChildren(
    ...(riepilogo.perMese.length
      ? riepilogo.perMese.map((voce) => creaColonnaMese(voce, massimoMese))
      : [messaggioAssente("Nessuna spesa da riepilogare.")])
  );
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
let invitoInstallazione = null;

// Il browser offre l'installazione solo quando ritiene la app idonea: fino a
// quel momento il pulsante resta nascosto, per non proporre un'azione inerte.
window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  invitoInstallazione = evento;
  bottoneInstalla.hidden = false;
});

bottoneInstalla.addEventListener("click", async () => {
  if (!invitoInstallazione) return;
  bottoneInstalla.hidden = true;
  invitoInstallazione.prompt();
  await invitoInstallazione.userChoice;
  invitoInstallazione = null;
});

window.addEventListener("appinstalled", () => {
  bottoneInstalla.hidden = true;
  invitoInstallazione = null;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Senza service worker la app funziona lo stesso, solo non offline.
    });
  });
}

// --- avvio ---------------------------------------------------------------

try {
  includiFisse.checked = localStorage.getItem("includiFisse") !== "0";
} catch {
  // Resta il valore predefinito del documento.
}

await dati.inizializza();
tornaANuovaSpesa();
tornaANuovaFissa();
disegna();
