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

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const giorno = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

let idInModifica = null;

function oggiLocale() {
  const adesso = new Date();
  const scostamento = adesso.getTimezoneOffset() * 60000;
  return new Date(adesso - scostamento).toISOString().slice(0, 10);
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

function popolaCategorie(categorie) {
  const selezione = selectCategoria.value;
  selectCategoria.replaceChildren(
    ...categorie.map((categoria) => {
      const opzione = document.createElement("option");
      opzione.value = categoria;
      opzione.textContent = categoria;
      return opzione;
    })
  );
  if (categorie.includes(selezione)) selectCategoria.value = selezione;
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

async function caricaCategorie() {
  const dati = await fetch("/api/categorie").then((risposta) => risposta.json());
  elencoCategorie.replaceChildren(...dati.categorie.map(creaVoceCategoria));
}

async function carica() {
  const dati = await fetch("/api/spese").then((risposta) => risposta.json());

  popolaCategorie(dati.categorie);
  corpoTabella.replaceChildren(...dati.spese.map(creaRiga));
  totaleEl.textContent = euro.format(dati.totale);

  const senzaSpese = dati.spese.length === 0;
  tabella.hidden = senzaSpese;
  vuotoEl.hidden = !senzaSpese;

  if (idInModifica !== null) {
    document.getElementById(`spesa-${idInModifica}`)?.classList.add("in-modifica");
  }
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

bottoneAnnulla.addEventListener("click", tornaANuovaSpesa);

tornaANuovaSpesa();
carica();
caricaCategorie();
