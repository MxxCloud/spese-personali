const form = document.getElementById("form-spesa");
const campoData = document.getElementById("data");
const selectCategoria = document.getElementById("categoria");
const corpoTabella = document.getElementById("corpo-tabella");
const tabella = document.getElementById("tabella");
const elencoErrori = document.getElementById("errori");
const totaleEl = document.getElementById("totale");
const vuotoEl = document.getElementById("vuoto");

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const giorno = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

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

function creaRiga(spesa) {
  const riga = document.createElement("tr");
  const valori = [
    giorno.format(new Date(`${spesa.data}T00:00:00`)),
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
  return riga;
}

function popolaCategorie(categorie) {
  if (selectCategoria.options.length > 0) return;
  selectCategoria.replaceChildren(
    ...categorie.map((categoria) => {
      const opzione = document.createElement("option");
      opzione.value = categoria;
      opzione.textContent = categoria;
      return opzione;
    })
  );
}

async function carica() {
  const risposta = await fetch("/api/spese");
  const dati = await risposta.json();

  popolaCategorie(dati.categorie);
  corpoTabella.replaceChildren(...dati.spese.map(creaRiga));
  totaleEl.textContent = euro.format(dati.totale);

  const senzaSpese = dati.spese.length === 0;
  tabella.hidden = senzaSpese;
  vuotoEl.hidden = !senzaSpese;
}

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const risposta = await fetch("/api/spese", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(form))),
  });

  if (!risposta.ok) {
    const errore = await risposta.json();
    mostraErrori(errore.errori ?? ["Errore imprevisto."]);
    return;
  }

  mostraErrori([]);
  form.reset();
  campoData.value = oggiLocale();
  await carica();
});

campoData.value = oggiLocale();
carica();
