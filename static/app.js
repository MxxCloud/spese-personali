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
const kpiMedia = document.getElementById("kpi-media");
const kpiGiornaliera = document.getElementById("kpi-giornaliera");
const kpiGiorni = document.getElementById("kpi-giorni");
const graficoCategorie = document.getElementById("grafico-categorie");
const graficoMesi = document.getElementById("grafico-mesi");

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const giorno = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

let idInModifica = null;

function isoLocale(data) {
  const scostamento = data.getTimezoneOffset() * 60000;
  return new Date(data - scostamento).toISOString().slice(0, 10);
}

function oggiLocale() {
  return isoLocale(new Date());
}

function filtriAttivi() {
  const parametri = new URLSearchParams();
  if (filtroDa.value) parametri.set("da", filtroDa.value);
  if (filtroA.value) parametri.set("a", filtroA.value);
  if (filtroCategoria.value) parametri.set("categoria", filtroCategoria.value);
  if (filtroTesto.value.trim()) parametri.set("testo", filtroTesto.value.trim());
  if (includiFisse.checked) parametri.set("fisse", "1");
  return parametri;
}

function filtriSenzaModo(parametri) {
  const copia = new URLSearchParams(parametri);
  copia.delete("fisse");
  return copia;
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
    filtroDa.value = isoLocale(new Date(anno, mese, 1));
    filtroA.value = isoLocale(new Date(anno, mese + 1, 0));
  } else if (periodo === "mese-scorso") {
    filtroDa.value = isoLocale(new Date(anno, mese - 1, 1));
    filtroA.value = isoLocale(new Date(anno, mese, 0));
  } else if (periodo === "anno") {
    filtroDa.value = isoLocale(new Date(anno, 0, 1));
    filtroA.value = isoLocale(new Date(anno, 11, 31));
  }
}

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

function tornaANuovaSpesa() {
  idInModifica = null;
  form.reset();
  campoData.value = oggiLocale();
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

async function eliminaSpesa(spesa) {
  const descrizione = spesa.descrizione ? ` — ${spesa.descrizione}` : "";
  const confermato = await chiediConferma(
    "Eliminare la spesa?",
    `${giorno.format(dataLocale(spesa.data))}, ${spesa.categoria}, ${euro.format(spesa.importo)}${descrizione}`
  );
  if (!confermato) return;

  const risposta = await fetch(`/api/spese/${spesa.id}`, { method: "DELETE" });
  if (!risposta.ok) {
    mostraErrori(["Non è stato possibile eliminare la spesa."]);
    return;
  }
  if (idInModifica === spesa.id) tornaANuovaSpesa();
  await carica();
}

function dataLocale(iso) {
  return new Date(`${iso}T00:00:00`);
}

function creaBottone(testo, classe, azione) {
  const bottone = document.createElement("button");
  bottone.type = "button";
  bottone.className = classe;
  bottone.textContent = testo;
  bottone.addEventListener("click", azione);
  return bottone;
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
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      inviaCategoria(`/api/categorie/${categoria.id}`, "PUT", { nome: campo.value });
    } else if (evento.key === "Escape") {
      caricaCategorie();
    }
  });

  voce.replaceChildren(
    campo,
    creaBottone("Salva", "minimo", () =>
      inviaCategoria(`/api/categorie/${categoria.id}`, "PUT", { nome: campo.value })
    ),
    creaBottone("Annulla", "minimo", caricaCategorie)
  );
  campo.focus();
  campo.select();
}

async function eliminaCategoria(categoria) {
  const confermato = await chiediConferma("Eliminare la categoria?", categoria.nome);
  if (confermato) await inviaCategoria(`/api/categorie/${categoria.id}`, "DELETE");
}

async function inviaCategoria(url, metodo, corpo) {
  const opzioni = { method: metodo };
  if (corpo) {
    opzioni.headers = { "Content-Type": "application/json" };
    opzioni.body = JSON.stringify(corpo);
  }

  const risposta = await fetch(url, opzioni);
  if (!risposta.ok) {
    const errore = await risposta.json();
    mostraErrori(errore.errori ?? ["Errore imprevisto."]);
    await caricaCategorie();
    return false;
  }

  mostraErrori([]);
  await Promise.all([caricaCategorie(), carica()]);
  return true;
}

const percentuale = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 });
const meseEsteso = new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric" });

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
  etichetta.textContent = meseEsteso.format(new Date(`${voce.mese}-01T00:00:00`));

  colonna.append(valore, contenitore, etichetta);
  return colonna;
}

function messaggioAssente(testo) {
  const voce = document.createElement("li");
  voce.className = "senza-dati";
  voce.textContent = testo;
  return voce;
}

async function caricaRiepilogo() {
  const dati = await fetch(`/api/riepilogo?${filtriAttivi()}`).then((r) => r.json());

  kpiMedia.textContent = dati.numero ? euro.format(dati.media) : "—";
  kpiGiornaliera.textContent = dati.numero ? euro.format(dati.media_giornaliera) : "—";
  kpiGiorni.textContent = dati.numero
    ? `${dati.giorni} ${dati.giorni === 1 ? "giorno" : "giorni"}`
    : "—";

  const massimoCategoria = Math.max(0, ...dati.per_categoria.map((v) => v.totale));
  graficoCategorie.replaceChildren(
    ...(dati.per_categoria.length
      ? dati.per_categoria.map((voce) => creaBarraCategoria(voce, massimoCategoria))
      : [messaggioAssente("Nessuna spesa da riepilogare.")])
  );

  const massimoMese = Math.max(0, ...dati.per_mese.map((v) => v.totale));
  graficoMesi.replaceChildren(
    ...(dati.per_mese.length
      ? dati.per_mese.map((voce) => creaColonnaMese(voce, massimoMese))
      : [messaggioAssente("Nessuna spesa da riepilogare.")])
  );
}

let idFissaInModifica = null;

function meseLeggibile(mese) {
  return meseEsteso.format(new Date(`${mese}-01T00:00:00`));
}

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
  await inviaFissa(`/api/fisse/${fissa.id}`, "DELETE");
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

  const salva = () =>
    inviaFissa(`/api/fisse/${fissa.id}/eccezioni/${mese.value}`, "PUT", {
      importo: importo.value,
    });

  const modulo = document.createElement("div");
  modulo.className = "modulo-eccezione";
  modulo.append(
    mese,
    importo,
    creaBottone("Salva", "minimo", salva),
    creaBottone("Annulla", "minimo", caricaFisse)
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
    creaBottone("Rimuovi", "minimo pericolo", () =>
      inviaFissa(`/api/fisse/${fissa.id}/eccezioni/${eccezione.mese}`, "DELETE")
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

async function inviaFissa(url, metodo, corpo) {
  const opzioni = { method: metodo };
  if (corpo) {
    opzioni.headers = { "Content-Type": "application/json" };
    opzioni.body = JSON.stringify(corpo);
  }

  const risposta = await fetch(url, opzioni);
  if (!risposta.ok) {
    const errore = await risposta.json();
    mostraErrori(errore.errori ?? ["Errore imprevisto."]);
    await caricaFisse();
    return false;
  }

  mostraErrori([]);
  await Promise.all([caricaFisse(), caricaCategorie(), carica()]);
  return true;
}

async function caricaFisse() {
  const dati = await fetch("/api/fisse").then((risposta) => risposta.json());
  elencoFisse.replaceChildren(
    ...(dati.fisse.length
      ? dati.fisse.map(creaVoceFissa)
      : [messaggioAssente("Nessuna spesa fissa registrata.")])
  );
}

async function caricaCategorie() {
  const dati = await fetch("/api/categorie").then((risposta) => risposta.json());
  elencoCategorie.replaceChildren(...dati.categorie.map(creaVoceCategoria));
}

async function carica() {
  const parametri = filtriAttivi();
  const filtrato = [...filtriSenzaModo(parametri)].length > 0;
  const dati = await fetch(`/api/spese?${parametri}`).then((risposta) => risposta.json());

  popolaCategorie(dati.categorie);
  corpoTabella.replaceChildren(...dati.spese.map(creaRiga));

  totaleEl.textContent = euro.format(dati.totale + dati.totale_fisse);
  scomposizione.hidden = dati.numero_fisse === 0;
  scomposizione.textContent =
    `${euro.format(dati.totale)} di spese correnti` +
    ` + ${euro.format(dati.totale_fisse)} di spese fisse` +
    ` su ${dati.numero_fisse} mensilità`;

  const numero = dati.spese.length;
  const singolare = numero === 1;
  conteggioEl.textContent = numero
    ? `su ${numero} ${singolare ? "spesa" : "spese"}` +
      (filtrato ? (singolare ? " filtrata" : " filtrate") : "")
    : "";

  for (const [collegamento, formato] of [
    [esportaExcel, "excel"],
    [esportaStandard, "standard"],
  ]) {
    const query = new URLSearchParams(parametri);
    query.set("formato", formato);
    collegamento.href = `/api/spese.csv?${query}`;
  }

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

  await caricaRiepilogo();
}

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const modifica = idInModifica !== null;
  const risposta = await fetch(modifica ? `/api/spese/${idInModifica}` : "/api/spese", {
    method: modifica ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(form))),
  });

  if (!risposta.ok) {
    const errore = await risposta.json();
    mostraErrori(errore.errori ?? ["Errore imprevisto."]);
    return;
  }

  mostraErrori([]);
  tornaANuovaSpesa();
  await carica();
});

formCategoria.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const riuscito = await inviaCategoria("/api/categorie", "POST", {
    nome: campoNuovaCategoria.value,
  });
  if (riuscito) formCategoria.reset();
});

for (const campo of [filtroDa, filtroA, filtroCategoria]) {
  campo.addEventListener("change", carica);
}

let attesaRicerca;
filtroTesto.addEventListener("input", () => {
  clearTimeout(attesaRicerca);
  attesaRicerca = setTimeout(carica, 250);
});

scorciatoie.addEventListener("click", (evento) => {
  const periodo = evento.target.dataset.periodo;
  if (!periodo) return;
  impostaPeriodo(periodo);
  carica();
});

formFissa.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const modifica = idFissaInModifica !== null;
  const riuscito = await inviaFissa(
    modifica ? `/api/fisse/${idFissaInModifica}` : "/api/fisse",
    modifica ? "PUT" : "POST",
    Object.fromEntries(new FormData(formFissa))
  );
  if (riuscito) tornaANuovaFissa();
});

fissaAnnulla.addEventListener("click", tornaANuovaFissa);

includiFisse.addEventListener("change", () => {
  try {
    localStorage.setItem("includiFisse", includiFisse.checked ? "1" : "0");
  } catch {
    // La preferenza non è essenziale: se il browser blocca l'archiviazione si prosegue.
  }
  carica();
});

bottoneAnnulla.addEventListener("click", tornaANuovaSpesa);

try {
  includiFisse.checked = localStorage.getItem("includiFisse") !== "0";
} catch {
  // Resta il valore predefinito del documento.
}

tornaANuovaSpesa();
tornaANuovaFissa();
carica();
caricaCategorie();
caricaFisse();
