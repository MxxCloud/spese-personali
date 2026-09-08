"""Server locale del tracker di spese personali."""

import json
import re
import sqlite3
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "spese.db"
STATIC_DIR = BASE_DIR / "static"

HOST = "127.0.0.1"
PORT = 8000

CATEGORIE_INIZIALI = ("Alimentari", "Casa", "Trasporti", "Salute", "Svago", "Altro")
IMPORTO_MASSIMO = 1_000_000
LUNGHEZZA_MASSIMA_NOME = 40

PERCORSO_SPESA = re.compile(r"^/api/spese/(\d+)$")
PERCORSO_CATEGORIA = re.compile(r"^/api/categorie/(\d+)$")

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
        conn.execute(
            """CREATE TABLE IF NOT EXISTS categorie (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   nome TEXT NOT NULL UNIQUE COLLATE NOCASE
               )"""
        )
        if not conn.execute("SELECT COUNT(*) FROM categorie").fetchone()[0]:
            conn.executemany(
                "INSERT INTO categorie (nome) VALUES (?)",
                [(nome,) for nome in CATEGORIE_INIZIALI],
            )
        # Nessuna spesa deve restare orfana di una categoria non più in elenco.
        conn.execute(
            "INSERT OR IGNORE INTO categorie (nome) SELECT DISTINCT categoria FROM spese"
        )


def filtri_da_query(query):
    """Estrae i filtri dalla query string, scartando i valori non validi."""
    parametri = parse_qs(query)

    def primo(nome):
        valori = parametri.get(nome, [])
        return valori[0].strip() if valori else ""

    filtri = {}
    for chiave in ("da", "a"):
        try:
            filtri[chiave] = date.fromisoformat(primo(chiave)).isoformat()
        except ValueError:
            pass

    if categoria := primo("categoria"):
        filtri["categoria"] = categoria
    if testo := primo("testo"):
        filtri["testo"] = testo[:100]

    return filtri


def condizioni_filtro(filtri):
    """Traduce i filtri in clausole SQL e relativi parametri."""
    clausole = []
    parametri = []

    if filtri.get("da"):
        clausole.append("data >= ?")
        parametri.append(filtri["da"])
    if filtri.get("a"):
        clausole.append("data <= ?")
        parametri.append(filtri["a"])
    if filtri.get("categoria"):
        clausole.append("categoria = ?")
        parametri.append(filtri["categoria"])
    if filtri.get("testo"):
        # I caratteri jolly di LIKE vanno neutralizzati: qui sono testo cercato.
        termine = (
            filtri["testo"].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        clausole.append("descrizione LIKE ? ESCAPE '\\'")
        parametri.append(f"%{termine}%")

    return (" WHERE " + " AND ".join(clausole) if clausole else ""), parametri


def elenca_spese(filtri=None):
    dove, parametri = condizioni_filtro(filtri or {})
    with apri_db() as conn:
        righe = conn.execute(
            "SELECT id, data, importo_cent, categoria, descrizione"
            f" FROM spese{dove} ORDER BY data, id",
            parametri,
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


def aggiorna_spesa(id_spesa, spesa):
    with apri_db() as conn:
        cursore = conn.execute(
            "UPDATE spese SET data = ?, importo_cent = ?, categoria = ?, descrizione = ?"
            " WHERE id = ?",
            (
                spesa["data"],
                spesa["importo_cent"],
                spesa["categoria"],
                spesa["descrizione"],
                id_spesa,
            ),
        )
        return cursore.rowcount > 0


def elimina_spesa(id_spesa):
    with apri_db() as conn:
        return conn.execute("DELETE FROM spese WHERE id = ?", (id_spesa,)).rowcount > 0


def elenca_categorie():
    with apri_db() as conn:
        righe = conn.execute(
            "SELECT c.id, c.nome,"
            " (SELECT COUNT(*) FROM spese s WHERE s.categoria = c.nome) AS usi"
            " FROM categorie c ORDER BY c.nome COLLATE NOCASE"
        ).fetchall()
    return [{"id": r["id"], "nome": r["nome"], "usi": r["usi"]} for r in righe]


def aggiungi_categoria(nome):
    with apri_db() as conn:
        try:
            return conn.execute(
                "INSERT INTO categorie (nome) VALUES (?)", (nome,)
            ).lastrowid, None
        except sqlite3.IntegrityError:
            return None, "Esiste già una categoria con questo nome."


def rinomina_categoria(id_categoria, nome):
    with apri_db() as conn:
        riga = conn.execute(
            "SELECT nome FROM categorie WHERE id = ?", (id_categoria,)
        ).fetchone()
        if riga is None:
            return False, "La categoria non esiste."
        try:
            conn.execute(
                "UPDATE categorie SET nome = ? WHERE id = ?", (nome, id_categoria)
            )
        except sqlite3.IntegrityError:
            return False, "Esiste già una categoria con questo nome."
        conn.execute(
            "UPDATE spese SET categoria = ? WHERE categoria = ?", (nome, riga["nome"])
        )
        return True, None


def elimina_categoria(id_categoria):
    with apri_db() as conn:
        riga = conn.execute(
            "SELECT nome FROM categorie WHERE id = ?", (id_categoria,)
        ).fetchone()
        if riga is None:
            return False, "La categoria non esiste."

        usi = conn.execute(
            "SELECT COUNT(*) FROM spese WHERE categoria = ?", (riga["nome"],)
        ).fetchone()[0]
        if usi:
            return False, (
                f"«{riga['nome']}» è usata da {usi} "
                f"{'spesa' if usi == 1 else 'spese'}: riassegnale prima di eliminarla."
            )

        conn.execute("DELETE FROM categorie WHERE id = ?", (id_categoria,))
        return True, None


def nome_categoria_canonico(nome):
    """Restituisce il nome come registrato in tabella, o None se non esiste."""
    with apri_db() as conn:
        riga = conn.execute(
            "SELECT nome FROM categorie WHERE nome = ?", (nome,)
        ).fetchone()
    return riga["nome"] if riga else None


def valida_nome_categoria(payload):
    nome = str(payload.get("nome", "")).strip()
    if not nome:
        return None, ["Il nome della categoria non può essere vuoto."]
    if len(nome) > LUNGHEZZA_MASSIMA_NOME:
        return None, [
            f"Il nome non può superare {LUNGHEZZA_MASSIMA_NOME} caratteri."
        ]
    return nome, []


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

    categoria = nome_categoria_canonico(str(payload.get("categoria", "")).strip())
    if categoria is None:
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
        indirizzo = urlparse(self.path)

        if indirizzo.path == "/api/spese":
            spese = elenca_spese(filtri_da_query(indirizzo.query))
            self._json(
                200,
                {
                    "spese": spese,
                    "totale": round(sum(s["importo"] for s in spese), 2),
                    "categorie": [c["nome"] for c in elenca_categorie()],
                },
            )
        elif indirizzo.path == "/api/categorie":
            self._json(200, {"categorie": elenca_categorie()})
        elif indirizzo.path in RISORSE_STATICHE:
            self._statico(*RISORSE_STATICHE[indirizzo.path])
        else:
            self._non_trovato()

    def do_POST(self):
        if self.path == "/api/spese":
            spesa = self._spesa_dal_corpo()
            if spesa is not None:
                self._json(201, {"id": aggiungi_spesa(spesa)})
        elif self.path == "/api/categorie":
            nome = self._nome_categoria_dal_corpo()
            if nome is not None:
                id_categoria, errore = aggiungi_categoria(nome)
                if errore:
                    self._json(400, {"errori": [errore]})
                else:
                    self._json(201, {"id": id_categoria})
        else:
            self._non_trovato()

    def do_PUT(self):
        spesa_da_modificare = PERCORSO_SPESA.match(self.path)
        categoria_da_rinominare = PERCORSO_CATEGORIA.match(self.path)

        if spesa_da_modificare:
            spesa = self._spesa_dal_corpo()
            if spesa is None:
                return
            if aggiorna_spesa(int(spesa_da_modificare.group(1)), spesa):
                self._json(200, {"ok": True})
            else:
                self._non_trovato("La spesa da modificare non esiste.")
        elif categoria_da_rinominare:
            nome = self._nome_categoria_dal_corpo()
            if nome is None:
                return
            self._esito(rinomina_categoria(int(categoria_da_rinominare.group(1)), nome))
        else:
            self._non_trovato()

    def do_DELETE(self):
        spesa_da_eliminare = PERCORSO_SPESA.match(self.path)
        categoria_da_eliminare = PERCORSO_CATEGORIA.match(self.path)

        if spesa_da_eliminare:
            if elimina_spesa(int(spesa_da_eliminare.group(1))):
                self._json(200, {"ok": True})
            else:
                self._non_trovato("La spesa da eliminare non esiste.")
        elif categoria_da_eliminare:
            self._esito(elimina_categoria(int(categoria_da_eliminare.group(1))))
        else:
            self._non_trovato()

    def _esito(self, risultato):
        riuscito, errore = risultato
        self._json(200 if riuscito else 400, {"ok": True} if riuscito else {"errori": [errore]})

    def _nome_categoria_dal_corpo(self):
        payload = self._leggi_json()
        if payload is None:
            self._json(400, {"errori": ["Richiesta non leggibile."]})
            return None

        nome, errori = valida_nome_categoria(payload)
        if errori:
            self._json(400, {"errori": errori})
            return None
        return nome

    def _spesa_dal_corpo(self):
        """Legge e valida il corpo della richiesta; risponde da sé in caso di errore."""
        payload = self._leggi_json()
        if payload is None:
            self._json(400, {"errori": ["Richiesta non leggibile."]})
            return None

        spesa, errori = valida(payload)
        if errori:
            self._json(400, {"errori": errori})
            return None
        return spesa

    def _non_trovato(self, messaggio="Risorsa non trovata."):
        self._json(404, {"errori": [messaggio]})

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
