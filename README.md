# Spese personali

Tracker di spese personali: applicazione web che gira in locale, senza dipendenze
esterne. Usa solo la libreria standard di Python (`http.server` e `sqlite3`).

## Funzionalità

**Spese.** Registrazione di data, importo, categoria e descrizione facoltativa.
Ogni spesa si può correggere o eliminare dall'elenco, che è sempre in ordine
cronologico crescente indipendentemente dall'ordine di inserimento.

**Categorie.** Si aggiungono, rinominano ed eliminano dal pannello "Gestisci
categorie". Rinominare una categoria aggiorna anche le spese collegate, mentre
eliminarne una ancora in uso viene impedito, così nessuna spesa resta senza
categoria.

**Filtri.** L'elenco si restringe per intervallo di date, categoria e testo della
descrizione, con scorciatoie per questo mese, il mese scorso e l'anno corrente.

**Riepiloghi.** Media per spesa, media giornaliera e ampiezza del periodo, più i
totali per categoria e per mese come grafici a barre. Filtri, riepilogo ed
elenco mostrano sempre la stessa selezione di spese.

## Avvio

```
python app.py
```

Poi apri <http://127.0.0.1:8000> nel browser. Per fermare il server: `Ctrl+C`.

## Dati

Le spese sono salvate in `spese.db`, un database SQLite creato automaticamente al
primo avvio nella cartella del progetto. Il file non è tracciato da git.
