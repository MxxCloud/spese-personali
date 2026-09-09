// Motore dati del tracker: archiviazione nel browser e regole di calcolo.
// Sostituisce il server Python; l'interfaccia in app.js parla solo con questo.

const NOME_ARCHIVIO = "spese-personali";
const VERSIONE_ARCHIVIO = 1;

export const CATEGORIE_INIZIALI = [
  "Alimentari",
  "Casa",
  "Trasporti",
  "Salute",
  "Svago",
  "Altro",
];

const IMPORTO_MASSIMO = 1_000_000;
const LUNGHEZZA_MASSIMA_NOME = 40;
const FORMATO_MESE = /^\d{4}-\d{2}$/;
const BOM_UTF8 = "\uFEFF";

const DIALETTI_CSV = {
  excel: { separatore: ";", decimale: ",", data: "italiana", bom: true },
  standard: { separatore: ",", decimale: ".", data: "iso", bom: false },
};

// I dati stanno in memoria e vengono riscritti su IndexedDB a ogni modifica:
// l'insieme è piccolo, e così filtri e aggregati restano codice sincrono.
const memoria = { spese: [], categorie: [], fisse: [] };
let archivio = null;

// --- archiviazione -------------------------------------------------------

function richiesta(operazione) {
  return new Promise((risolvi, rifiuta) => {
    operazione.onsuccess = () => risolvi(operazione.result);
    operazione.onerror = () => rifiuta(operazione.error);
  });
}

function apriArchivio() {
  return new Promise((risolvi, rifiuta) => {
    const apertura = indexedDB.open(NOME_ARCHIVIO, VERSIONE_ARCHIVIO);
    apertura.onupgradeneeded = () => {
      const db = apertura.result;
      for (const nome of ["spese", "categorie", "fisse"]) {
        if (!db.objectStoreNames.contains(nome)) {
          db.createObjectStore(nome, { keyPath: "id", autoIncrement: true });
        }
      }
    };
    apertura.onsuccess = () => risolvi(apertura.result);
    apertura.onerror = () => rifiuta(apertura.error);
  });
}

async function leggiTutto(deposito) {
  const transazione = archivio.transaction(deposito, "readonly");
  return richiesta(transazione.objectStore(deposito).getAll());
}

async function scrivi(deposito, record) {
  const transazione = archivio.transaction(deposito, "readwrite");
  const chiave = await richiesta(transazione.objectStore(deposito).put(record));
  return chiave;
}

async function rimuovi(deposito, id) {
  const transazione = archivio.transaction(deposito, "readwrite");
  await richiesta(transazione.objectStore(deposito).delete(id));
}

export async function inizializza() {
  archivio = await apriArchivio();
  memoria.spese = await leggiTutto("spese");
  memoria.categorie = await leggiTutto("categorie");
  memoria.fisse = await leggiTutto("fisse");

  if (memoria.categorie.length === 0) {
    for (const nome of CATEGORIE_INIZIALI) {
      const id = await scrivi("categorie", { nome });
      memoria.categorie.push({ id, nome });
    }
  }

  // Nessuna spesa deve restare orfana di una categoria non più in elenco.
  const presenti = new Set(memoria.categorie.map((c) => c.nome.toLowerCase()));
  const usate = new Set([
    ...memoria.spese.map((s) => s.categoria),
    ...memoria.fisse.map((f) => f.categoria),
  ]);
  for (const nome of usate) {
    if (!presenti.has(nome.toLowerCase())) {
      const id = await scrivi("categorie", { nome });
      memoria.categorie.push({ id, nome });
      presenti.add(nome.toLowerCase());
    }
  }
}

// --- date e mesi ---------------------------------------------------------

export function oggiIso() {
  return isoLocale(new Date());
}

export function isoLocale(data) {
  const scostamento = data.getTimezoneOffset() * 60000;
  return new Date(data - scostamento).toISOString().slice(0, 10);
}

export function meseCorrente() {
  return oggiIso().slice(0, 7);
}

function meseDi(iso) {
  return iso.slice(0, 7);
}

export function mesiTra(primo, ultimo) {
  const mesi = [];
  let [anno, mese] = primo.split("-").map(Number);
  let corrente = primo;
  while (corrente <= ultimo) {
    mesi.push(corrente);
    [anno, mese] = mese === 12 ? [anno + 1, 1] : [anno, mese + 1];
    corrente = `${String(anno).padStart(4, "0")}-${String(mese).padStart(2, "0")}`;
  }
  return mesi;
}

export function estremiDelMese(mese) {
  const [anno, numero] = mese.split("-").map(Number);
  // Giorno 0 del mese successivo è l'ultimo di questo, senza aritmetica sulle ore.
  return [`${mese}-01`, isoLocale(new Date(anno, numero, 0))];
}

function dataValida(grezzo) {
  const testo = String(grezzo ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return null;
  const data = new Date(`${testo}T00:00:00`);
  return Number.isNaN(data.getTime()) || isoLocale(data) !== testo ? null : testo;
}

function meseValido(grezzo) {
  const mese = String(grezzo ?? "").trim();
  if (!FORMATO_MESE.test(mese)) return null;
  const numero = Number(mese.slice(5));
  return numero >= 1 && numero <= 12 ? mese : null;
}

// --- validazione ---------------------------------------------------------

export function importoInCentesimi(grezzo) {
  const testo = String(grezzo ?? "").trim().replace(",", ".");
  const importo = testo === "" ? NaN : Number(testo);
  if (!Number.isFinite(importo)) return [null, "L'importo deve essere un numero."];
  if (!(importo > 0)) return [null, "L'importo deve essere maggiore di zero."];
  if (importo > IMPORTO_MASSIMO) {
    return [null, `L'importo non può superare ${IMPORTO_MASSIMO} euro.`];
  }
  return [Math.round(importo * 100), null];
}

export function valida(payload) {
  const errori = [];

  const data = dataValida(payload.data);
  if (data === null) errori.push("Indica una data valida nel formato AAAA-MM-GG.");

  const [importoCent, erroreImporto] = importoInCentesimi(payload.importo);
  if (erroreImporto) errori.push(erroreImporto);

  const categoria = nomeCategoriaCanonico(payload.categoria);
  if (categoria === null) errori.push("Scegli una categoria tra quelle disponibili.");

  if (errori.length) return [null, errori];
  return [
    {
      data,
      importoCent,
      categoria,
      descrizione: String(payload.descrizione ?? "").trim().slice(0, 200),
    },
    [],
  ];
}

export function validaFissa(payload) {
  const errori = [];

  const descrizione = String(payload.descrizione ?? "").trim().slice(0, 200);
  if (!descrizione) errori.push("Indica una descrizione: è il nome della spesa fissa.");

  const [importoCent, erroreImporto] = importoInCentesimi(payload.importo);
  if (erroreImporto) errori.push(erroreImporto);

  const categoria = nomeCategoriaCanonico(payload.categoria);
  if (categoria === null) errori.push("Scegli una categoria tra quelle disponibili.");

  const inizio = meseValido(payload.inizio);
  if (inizio === null) errori.push("Indica il mese di inizio nel formato AAAA-MM.");

  let fine = null;
  const grezzoFine = String(payload.fine ?? "").trim();
  if (grezzoFine) {
    fine = meseValido(grezzoFine);
    if (fine === null) errori.push("Il mese di fine deve essere nel formato AAAA-MM.");
    else if (inizio && fine < inizio) {
      errori.push("Il mese di fine non può precedere quello di inizio.");
    }
  }

  if (errori.length) return [null, errori];
  return [{ descrizione, importoCent, categoria, inizio, fine }, []];
}

function validaNomeCategoria(grezzo) {
  const nome = String(grezzo ?? "").trim();
  if (!nome) return [null, ["Il nome della categoria non può essere vuoto."]];
  if (nome.length > LUNGHEZZA_MASSIMA_NOME) {
    return [null, [`Il nome non può superare ${LUNGHEZZA_MASSIMA_NOME} caratteri.`]];
  }
  return [nome, []];
}

// --- categorie -----------------------------------------------------------

function nomeCategoriaCanonico(grezzo) {
  const cercato = String(grezzo ?? "").trim().toLowerCase();
  const trovata = memoria.categorie.find((c) => c.nome.toLowerCase() === cercato);
  return trovata ? trovata.nome : null;
}

export function nomiCategorie() {
  return memoria.categorie
    .map((c) => c.nome)
    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
}

export function elencaCategorie() {
  return memoria.categorie
    .map((categoria) => ({
      id: categoria.id,
      nome: categoria.nome,
      usi:
        memoria.spese.filter((s) => s.categoria === categoria.nome).length +
        memoria.fisse.filter((f) => f.categoria === categoria.nome).length,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it", { sensitivity: "base" }));
}

export async function aggiungiCategoria(grezzo) {
  const [nome, errori] = validaNomeCategoria(grezzo);
  if (errori.length) return errori;
  if (nomeCategoriaCanonico(nome) !== null) {
    return ["Esiste già una categoria con questo nome."];
  }
  const id = await scrivi("categorie", { nome });
  memoria.categorie.push({ id, nome });
  return [];
}

export async function rinominaCategoria(id, grezzo) {
  const [nome, errori] = validaNomeCategoria(grezzo);
  if (errori.length) return errori;

  const categoria = memoria.categorie.find((c) => c.id === id);
  if (!categoria) return ["La categoria non esiste."];

  const omonima = memoria.categorie.find(
    (c) => c.id !== id && c.nome.toLowerCase() === nome.toLowerCase()
  );
  if (omonima) return ["Esiste già una categoria con questo nome."];

  const precedente = categoria.nome;
  categoria.nome = nome;
  await scrivi("categorie", { id, nome });

  // Rinominare senza aggiornare i riferimenti lascerebbe spese senza categoria.
  for (const spesa of memoria.spese.filter((s) => s.categoria === precedente)) {
    spesa.categoria = nome;
    await scrivi("spese", spesa);
  }
  for (const fissa of memoria.fisse.filter((f) => f.categoria === precedente)) {
    fissa.categoria = nome;
    await scrivi("fisse", fissa);
  }
  return [];
}

export async function eliminaCategoria(id) {
  const categoria = memoria.categorie.find((c) => c.id === id);
  if (!categoria) return ["La categoria non esiste."];

  const occasionali = memoria.spese.filter((s) => s.categoria === categoria.nome).length;
  const fisse = memoria.fisse.filter((f) => f.categoria === categoria.nome).length;

  const parti = [];
  if (occasionali) parti.push(`${occasionali} ${occasionali === 1 ? "spesa" : "spese"}`);
  if (fisse) parti.push(`${fisse} ${fisse === 1 ? "spesa fissa" : "spese fisse"}`);
  if (parti.length) {
    return [`«${categoria.nome}» è usata da ${parti.join(" e ")}: riassegnale prima di eliminarla.`];
  }

  await rimuovi("categorie", id);
  memoria.categorie = memoria.categorie.filter((c) => c.id !== id);
  return [];
}

// --- spese ---------------------------------------------------------------

function superaFiltri(voce, filtri = {}) {
  if (filtri.da && voce.data < filtri.da) return false;
  if (filtri.a && voce.data > filtri.a) return false;
  if (filtri.categoria && voce.categoria !== filtri.categoria) return false;
  if (filtri.testo) {
    const cercato = filtri.testo.toLowerCase();
    if (!voce.descrizione.toLowerCase().includes(cercato)) return false;
  }
  return true;
}

function inEuro(spesa) {
  return {
    id: spesa.id,
    data: spesa.data,
    importo: spesa.importoCent / 100,
    categoria: spesa.categoria,
    descrizione: spesa.descrizione,
  };
}

export function elencaSpese(filtri = {}) {
  return memoria.spese
    .map(inEuro)
    .filter((spesa) => superaFiltri(spesa, filtri))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
}

export async function aggiungiSpesa(payload) {
  const [spesa, errori] = valida(payload);
  if (errori.length) return errori;
  const id = await scrivi("spese", spesa);
  memoria.spese.push({ id, ...spesa });
  return [];
}

export async function aggiornaSpesa(id, payload) {
  const [spesa, errori] = valida(payload);
  if (errori.length) return errori;
  const esistente = memoria.spese.find((s) => s.id === id);
  if (!esistente) return ["La spesa da modificare non esiste."];
  Object.assign(esistente, spesa);
  await scrivi("spese", esistente);
  return [];
}

export async function eliminaSpesa(id) {
  if (!memoria.spese.some((s) => s.id === id)) return ["La spesa da eliminare non esiste."];
  await rimuovi("spese", id);
  memoria.spese = memoria.spese.filter((s) => s.id !== id);
  return [];
}

// --- spese fisse ---------------------------------------------------------

export function elencaFisse() {
  return memoria.fisse
    .map((fissa) => ({
      id: fissa.id,
      descrizione: fissa.descrizione,
      importo: fissa.importoCent / 100,
      categoria: fissa.categoria,
      inizio: fissa.inizio,
      fine: fissa.fine,
      eccezioni: Object.entries(fissa.eccezioni ?? {})
        .map(([mese, centesimi]) => ({ mese, importo: centesimi / 100 }))
        .sort((a, b) => a.mese.localeCompare(b.mese)),
    }))
    .sort((a, b) => a.descrizione.localeCompare(b.descrizione, "it", { sensitivity: "base" }));
}

export async function aggiungiFissa(payload) {
  const [fissa, errori] = validaFissa(payload);
  if (errori.length) return errori;
  const record = { ...fissa, eccezioni: {} };
  const id = await scrivi("fisse", record);
  memoria.fisse.push({ id, ...record });
  return [];
}

export async function aggiornaFissa(id, payload) {
  const [fissa, errori] = validaFissa(payload);
  if (errori.length) return errori;
  const esistente = memoria.fisse.find((f) => f.id === id);
  if (!esistente) return ["La spesa fissa da modificare non esiste."];
  Object.assign(esistente, fissa);
  await scrivi("fisse", esistente);
  return [];
}

export async function eliminaFissa(id) {
  if (!memoria.fisse.some((f) => f.id === id)) {
    return ["La spesa fissa da eliminare non esiste."];
  }
  await rimuovi("fisse", id);
  memoria.fisse = memoria.fisse.filter((f) => f.id !== id);
  return [];
}

export async function impostaEccezione(id, grezzoMese, grezzoImporto) {
  const fissa = memoria.fisse.find((f) => f.id === id);
  if (!fissa) return ["La spesa fissa non esiste."];

  const mese = meseValido(grezzoMese);
  if (mese === null) return ["Indica il mese nel formato AAAA-MM."];

  const [centesimi, errore] = importoInCentesimi(grezzoImporto);
  if (errore) return [errore];

  fissa.eccezioni = { ...(fissa.eccezioni ?? {}), [mese]: centesimi };
  await scrivi("fisse", fissa);
  return [];
}

export async function eliminaEccezione(id, mese) {
  const fissa = memoria.fisse.find((f) => f.id === id);
  if (!fissa || !(mese in (fissa.eccezioni ?? {}))) return ["L'eccezione non esiste."];
  delete fissa.eccezioni[mese];
  await scrivi("fisse", fissa);
  return [];
}

export function occorrenzeFisse(filtri = {}) {
  const { da, a } = filtri;
  // Mai oltre il mese corrente: i mesi futuri non sono ancora stati spesi.
  const limiteAlto = a ? [meseDi(a), meseCorrente()].sort()[0] : meseCorrente();

  const ricorrenze = [];
  for (const fissa of memoria.fisse) {
    if (filtri.categoria && fissa.categoria !== filtri.categoria) continue;
    if (
      filtri.testo &&
      !fissa.descrizione.toLowerCase().includes(filtri.testo.toLowerCase())
    ) {
      continue;
    }

    const primo = da ? [fissa.inizio, meseDi(da)].sort().at(-1) : fissa.inizio;
    const ultimo = fissa.fine ? [fissa.fine, limiteAlto].sort()[0] : limiteAlto;

    for (const mese of mesiTra(primo, ultimo)) {
      const giorno = `${mese}-01`;
      if ((da && giorno < da) || (a && giorno > a)) continue;
      const centesimi = fissa.eccezioni?.[mese] ?? fissa.importoCent;
      ricorrenze.push({
        idFissa: fissa.id,
        data: giorno,
        mese,
        importo: centesimi / 100,
        categoria: fissa.categoria,
        descrizione: fissa.descrizione,
      });
    }
  }

  return ricorrenze.sort(
    (x, y) => x.data.localeCompare(y.data) || x.descrizione.localeCompare(y.descrizione)
  );
}

export function fisseDelMese(mese = meseCorrente()) {
  const [primo, ultimo] = estremiDelMese(mese);
  return occorrenzeFisse({ da: primo, a: ultimo });
}

// --- riepilogo -----------------------------------------------------------

function giorniCoperti(filtri, prima, ultima) {
  const inizio = filtri.da || prima;
  const fine = filtri.a || ultima;
  if (!inizio || !fine) return 1;
  const ampiezza =
    Math.round(
      (new Date(`${fine}T00:00:00`) - new Date(`${inizio}T00:00:00`)) / 86400000
    ) + 1;
  return Math.max(ampiezza, 1);
}

export function riepilogo(filtri = {}, conFisse = false) {
  const spese = elencaSpese(filtri);
  const ricorrenze = conFisse ? occorrenzeFisse(filtri) : [];

  const categorie = new Map();
  const mesi = new Map();
  let somma = 0;

  for (const voce of [...spese, ...ricorrenze]) {
    const centesimi = Math.round(voce.importo * 100);
    somma += centesimi;
    const mese = meseDi(voce.data);
    categorie.set(voce.categoria, (categorie.get(voce.categoria) ?? 0) + centesimi);
    mesi.set(mese, (mesi.get(mese) ?? 0) + centesimi);
  }

  const numero = spese.length + ricorrenze.length;
  const date = [...spese, ...ricorrenze].map((v) => v.data).sort();
  const giorni = giorniCoperti(filtri, date[0], date.at(-1));

  return {
    totale: somma / 100,
    numero,
    media: numero ? somma / numero / 100 : 0,
    mediaGiornaliera: somma / 100 / giorni,
    giorni,
    perCategoria: [...categorie.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([categoria, valore]) => ({
        categoria,
        totale: valore / 100,
        quota: somma ? valore / somma : 0,
      })),
    perMese: [...mesi.entries()]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([mese, valore]) => ({ mese, totale: valore / 100 })),
  };
}

// --- esportazione CSV ----------------------------------------------------

function campoCsv(valore, separatore) {
  const testo = String(valore);
  // Virgolette, separatore e a capo obbligano a racchiudere il campo.
  if (!/["\r\n]/.test(testo) && !testo.includes(separatore)) return testo;
  return `"${testo.replaceAll('"', '""')}"`;
}

function dataNelDialetto(iso, dialetto) {
  if (dialetto.data === "iso") return iso;
  const [anno, mese, giorno] = iso.split("-");
  return `${giorno}/${mese}/${anno}`;
}

export function speseInCsv(filtri = {}, formato = "excel", conFisse = false) {
  const dialetto = DIALETTI_CSV[formato] ?? DIALETTI_CSV.excel;

  const voci = elencaSpese(filtri).map((spesa) => ({ ...spesa, tipo: "Occasionale" }));
  if (conFisse) {
    voci.push(...occorrenzeFisse(filtri).map((voce) => ({ ...voce, tipo: "Fissa" })));
    voci.sort(
      (x, y) =>
        x.data.localeCompare(y.data) ||
        x.tipo.localeCompare(y.tipo) ||
        x.descrizione.localeCompare(y.descrizione)
    );
  }

  const colonne = ["Data", "Importo", "Categoria", "Descrizione"];
  const righe = [conFisse ? [...colonne, "Tipo"] : colonne];
  for (const voce of voci) {
    const riga = [
      dataNelDialetto(voce.data, dialetto),
      voce.importo.toFixed(2).replace(".", dialetto.decimale),
      voce.categoria,
      voce.descrizione,
    ];
    righe.push(conFisse ? [...riga, voce.tipo] : riga);
  }

  const testo = righe
    .map((riga) => riga.map((campo) => campoCsv(campo, dialetto.separatore)).join(dialetto.separatore))
    .join("\r\n");

  // Senza BOM Excel legge l'UTF-8 come ANSI e storpia le lettere accentate.
  return (dialetto.bom ? BOM_UTF8 : "") + testo + "\r\n";
}

// --- backup completo -----------------------------------------------------

const FORMATO_BACKUP = "spese-personali";
const VERSIONE_BACKUP = 1;

export function esportaBackup() {
  return {
    formato: FORMATO_BACKUP,
    versione: VERSIONE_BACKUP,
    esportato: new Date().toISOString(),
    categorie: memoria.categorie.map((c) => c.nome),
    spese: memoria.spese.map((s) => ({
      data: s.data,
      importo: s.importoCent / 100,
      categoria: s.categoria,
      descrizione: s.descrizione,
    })),
    fisse: memoria.fisse.map((f) => ({
      descrizione: f.descrizione,
      importo: f.importoCent / 100,
      categoria: f.categoria,
      inizio: f.inizio,
      fine: f.fine,
      eccezioni: Object.fromEntries(
        Object.entries(f.eccezioni ?? {}).map(([mese, cent]) => [mese, cent / 100])
      ),
    })),
  };
}

export function nomeFileBackup() {
  return `backup-spese_${oggiIso()}.json`;
}

async function svuotaTutto() {
  const transazione = archivio.transaction(["spese", "categorie", "fisse"], "readwrite");
  for (const deposito of ["spese", "categorie", "fisse"]) {
    await richiesta(transazione.objectStore(deposito).clear());
  }
  memoria.spese = [];
  memoria.categorie = [];
  memoria.fisse = [];
}

/**
 * Sostituisce l'intero archivio con il contenuto del backup.
 * Il file arriva dall'esterno, quindi ogni record passa dalle stesse
 * validazioni dell'inserimento manuale: restituisce l'elenco degli errori,
 * e in tal caso non tocca nulla.
 */
export async function importaBackup(contenuto) {
  if (!contenuto || typeof contenuto !== "object") {
    return ["Il file non contiene un backup leggibile."];
  }
  if (contenuto.formato !== FORMATO_BACKUP) {
    return ["Questo file non è un backup del tracker di spese."];
  }
  if (contenuto.versione !== VERSIONE_BACKUP) {
    return [`Il backup è in versione ${contenuto.versione}, non riconosciuta.`];
  }

  const categorie = Array.isArray(contenuto.categorie) ? contenuto.categorie : [];
  const spese = Array.isArray(contenuto.spese) ? contenuto.spese : [];
  const fisse = Array.isArray(contenuto.fisse) ? contenuto.fisse : [];

  // Le categorie citate dalle voci devono esistere, altrimenti la validazione
  // le rifiuterebbe: si ricavano dal backup stesso prima di controllare il resto.
  const nomi = new Set(categorie.map((n) => String(n).trim()).filter(Boolean));
  for (const voce of [...spese, ...fisse]) {
    const nome = String(voce?.categoria ?? "").trim();
    if (nome) nomi.add(nome);
  }

  const precedenti = memoria.categorie;
  memoria.categorie = [...nomi].map((nome, indice) => ({ id: -1 - indice, nome }));

  const errori = [];
  const speseValide = [];
  spese.forEach((voce, indice) => {
    const [spesa, suoi] = valida(voce ?? {});
    if (suoi.length) errori.push(`Spesa ${indice + 1}: ${suoi.join(" ")}`);
    else speseValide.push(spesa);
  });

  const fisseValide = [];
  fisse.forEach((voce, indice) => {
    const [fissa, suoi] = validaFissa(voce ?? {});
    if (suoi.length) {
      errori.push(`Spesa fissa ${indice + 1}: ${suoi.join(" ")}`);
      return;
    }
    const eccezioni = {};
    for (const [mese, importo] of Object.entries(voce.eccezioni ?? {})) {
      const meseOk = meseValido(mese);
      const [cent, errore] = importoInCentesimi(importo);
      if (!meseOk || errore) {
        errori.push(`Spesa fissa ${indice + 1}: eccezione «${mese}» non valida.`);
      } else {
        eccezioni[meseOk] = cent;
      }
    }
    fisseValide.push({ ...fissa, eccezioni });
  });

  if (errori.length) {
    memoria.categorie = precedenti;
    return errori.slice(0, 10);
  }

  await svuotaTutto();
  for (const nome of nomi) {
    const id = await scrivi("categorie", { nome });
    memoria.categorie.push({ id, nome });
  }
  for (const spesa of speseValide) {
    const id = await scrivi("spese", spesa);
    memoria.spese.push({ id, ...spesa });
  }
  for (const fissa of fisseValide) {
    const id = await scrivi("fisse", fissa);
    memoria.fisse.push({ id, ...fissa });
  }
  return [];
}

export function nomeFileCsv(filtri = {}) {
  if (filtri.da || filtri.a) {
    return `spese_${filtri.da ?? "inizio"}_${filtri.a ?? "oggi"}.csv`;
  }
  return `spese_${oggiIso()}.csv`;
}
