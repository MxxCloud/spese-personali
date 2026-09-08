"""Server locale del tracker di spese personali."""

import json
import sqlite3
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "spese.db"
STATIC_DIR = BASE_DIR / "static"

HOST = "127.0.0.1"
PORT = 8000

CATEGORIE = ("Alimentari", "Casa", "Trasporti", "Salute", "Svago", "Altro")
IMPORTO_MASSIMO = 1_000_000

RISORSE_STATICHE = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}


def apri_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def inizializza_db():
    with apri_db() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS spese (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   data TEXT NOT NULL,
                   importo_cent INTEGER NOT NULL,
                   categoria TEXT NOT NULL,
                   descrizione TEXT NOT NULL DEFAULT ''
               )"""
        )


def elenca_spese():
    with apri_db() as conn:
        righe = conn.execute(
            "SELECT id, data, importo_cent, categoria, descrizione"
            " FROM spese ORDER BY data, id"
        ).fetchall()
    return [
        {
            "id": riga["id"],
            "data": riga["data"],
            "importo": riga["importo_cent"] / 100,
            "categoria": riga["categoria"],
            "descrizione": riga["descrizione"],
        }
        for riga in righe
    ]


def aggiungi_spesa(spesa):
    with apri_db() as conn:
        cursore = conn.execute(
            "INSERT INTO spese (data, importo_cent, categoria, descrizione)"
            " VALUES (?, ?, ?, ?)",
            (
                spesa["data"],
                spesa["importo_cent"],
                spesa["categoria"],
                spesa["descrizione"],
            ),
        )
        return cursore.lastrowid


def valida(payload):
    """Converte il payload in una spesa pronta per il database.

    Restituisce (spesa, errori): spesa è None se ci sono errori.
    """
    errori = []

    try:
        data_valida = date.fromisoformat(str(payload.get("data", "")).strip()).isoformat()
    except ValueError:
        data_valida = None
        errori.append("Indica una data valida nel formato AAAA-MM-GG.")

    importo_cent = None
    grezzo = str(payload.get("importo", "")).strip().replace(",", ".")
    try:
        importo = float(grezzo)
    except ValueError:
        errori.append("L'importo deve essere un numero.")
    else:
        if not importo > 0:
            errori.append("L'importo deve essere maggiore di zero.")
        elif importo > IMPORTO_MASSIMO:
            errori.append(f"L'importo non può superare {IMPORTO_MASSIMO} euro.")
        else:
            importo_cent = round(importo * 100)

    categoria = str(payload.get("categoria", "")).strip()
    if categoria not in CATEGORIE:
        errori.append("Scegli una categoria tra quelle disponibili.")

    if errori:
        return None, errori

    return {
        "data": data_valida,
        "importo_cent": importo_cent,
        "categoria": categoria,
        "descrizione": str(payload.get("descrizione", "")).strip()[:200],
    }, []


class Gestore(BaseHTTPRequestHandler):
    server_version = "SpesePersonali/0.1"
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if self.path == "/api/spese":
            spese = elenca_spese()
            self._json(
                200,
                {
                    "spese": spese,
                    "totale": round(sum(s["importo"] for s in spese), 2),
                    "categorie": list(CATEGORIE),
                },
            )
        elif self.path in RISORSE_STATICHE:
            self._statico(*RISORSE_STATICHE[self.path])
        else:
            self._json(404, {"errori": ["Risorsa non trovata."]})

    def do_POST(self):
        if self.path != "/api/spese":
            self._json(404, {"errori": ["Risorsa non trovata."]})
            return

        payload = self._leggi_json()
        if payload is None:
            self._json(400, {"errori": ["Richiesta non leggibile."]})
            return

        spesa, errori = valida(payload)
        if errori:
            self._json(400, {"errori": errori})
            return

        self._json(201, {"id": aggiungi_spesa(spesa)})

    def _leggi_json(self):
        lunghezza = int(self.headers.get("Content-Length") or 0)
        if not 0 < lunghezza <= 10_000:
            return None
        try:
            payload = json.loads(self.rfile.read(lunghezza))
        except (ValueError, UnicodeDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def _json(self, stato, corpo):
        self._rispondi(
            stato,
            json.dumps(corpo, ensure_ascii=False).encode("utf-8"),
            "application/json; charset=utf-8",
        )

    def _statico(self, nome, tipo):
        self._rispondi(200, (STATIC_DIR / nome).read_bytes(), tipo)

    def _rispondi(self, stato, dati, tipo):
        self.send_response(stato)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(dati)))
        self.end_headers()
        self.wfile.write(dati)


def main():
    inizializza_db()
    server = ThreadingHTTPServer((HOST, PORT), Gestore)
    print(f"Tracker spese in ascolto su http://{HOST}:{PORT}  (Ctrl+C per fermare)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArresto del server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
