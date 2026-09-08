# Spese personali

Tracker di spese personali: applicazione web che gira in locale, senza dipendenze
esterne. Usa solo la libreria standard di Python (`http.server` e `sqlite3`).

## Avvio

```
python app.py
```

Poi apri <http://127.0.0.1:8000> nel browser. Per fermare il server: `Ctrl+C`.

## Dati

Le spese sono salvate in `spese.db`, un database SQLite creato automaticamente al
primo avvio nella cartella del progetto. Il file non è tracciato da git.
