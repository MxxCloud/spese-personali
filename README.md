# Spese personali

Tracker di spese personali: una app web installabile che funziona anche senza
rete. Non ha server né dipendenze da installare — è HTML, CSS e JavaScript, e i
dati restano nel dispositivo di chi la usa.

## Funzionalità

**Spese.** Registrazione di data, importo, categoria e descrizione facoltativa.
Ogni spesa si può correggere o eliminare dall'elenco, che è sempre in ordine
cronologico crescente indipendentemente dall'ordine di inserimento.

**Categorie.** Si aggiungono, rinominano ed eliminano dal pannello "Gestisci
categorie". Rinominare una categoria aggiorna anche le spese collegate, mentre
eliminarne una ancora in uso viene impedito, così nessuna spesa resta senza
categoria.

**Spese fisse.** Canoni ricorrenti noti in anticipo (l'affitto, il condominio)
si registrano una volta sola, con importo mensile, categoria, mese di inizio e
mese di fine facoltativo. Non compaiono nell'elenco: formano la base su cui si
sommano le spese occasionali, e la sezione mostra quanto ammontano nel mese in
corso. Per un singolo mese si può registrare un importo diverso dal canone. Un
interruttore le include o esclude da totali, riepiloghi ed esportazione, per
misurare la spesa corrente in entrambi i modi.

**Filtri.** L'elenco si restringe per intervallo di date, categoria e testo
della descrizione, con scorciatoie per questo mese, il mese scorso e l'anno
corrente.

**Riepiloghi.** Media per spesa, media giornaliera e ampiezza del periodo, più i
totali per categoria e per mese come grafici a barre. Filtri, riepilogo ed
elenco mostrano sempre la stessa selezione di spese.

**Esportazione CSV.** Due formati: uno per Excel in locale italiana (separatore
`;`, decimali a virgola, date `gg/mm/aaaa`) e uno standard internazionale per
LibreOffice, Fogli Google e strumenti di analisi. L'esportazione contiene le
spese filtrate: per scaricarle tutte, azzera prima i filtri.

**Backup e ripristino.** Un file JSON con l'intero archivio, che si riporta
dentro quando serve. Il ripristino sostituisce tutto il contenuto e rifiuta il
file se anche un solo record non è valido.

## Dove stanno i dati

Nell'archivio del browser (IndexedDB), sul singolo dispositivo. Non vengono
inviati da nessuna parte e nessuno oltre a chi usa il dispositivo può leggerli.

Questo ha due conseguenze:

- **Telefono e computer hanno archivi separati.** Non si sincronizzano: una
  spesa segnata sul telefono non compare sul computer.
- **Svuotare i dati del browser cancella tutto.** Il backup è l'unico modo per
  riaverli, ed è anche il modo per spostarli da un dispositivo all'altro.

## Uso locale

Non basta aprire `index.html` con un doppio clic: il browser blocca i moduli
JavaScript caricati da file locali. Serve un server statico qualsiasi, per
esempio:

```
python -m http.server 8001
```

Poi apri <http://127.0.0.1:8001>.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | struttura della pagina |
| `style.css` | aspetto, con tema chiaro e scuro |
| `dati.js` | archiviazione e regole di calcolo |
| `app.js` | interfaccia ed eventi |
| `sw.js` | copia locale per il funzionamento offline |
| `manifest.webmanifest` | dati per l'installazione |

Modificando i file dell'applicazione va aggiornata anche la costante `VERSIONE`
in `sw.js`, altrimenti chi ha già visitato la app continua a vedere la copia
precedente.
