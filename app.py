"""Server locale del tracker di spese personali."""

import csv
import io
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
PERCORSO_FISSA = re.compile(r"^/api/fisse/(\d+)$")
PERCORSO_ECCEZIONE = re.compile(r"^/api/fisse/(\d+)/eccezioni/(\d{4}-\d{2})$")
FORMATO_MESE = re.compile(r"^\d{4}-\d{2}$")

# Excel in locale italiana usa la virgola per i decimali, quindi separa i campi
# con il punto e virgola e non legge l'UTF-8 senza BOM.
DIALETTI_CSV = {
    "excel": {"separatore": ";", "decimale": ",", "data": "italiana", "bom": True},
    "standard": {"separatore": ",", "decimale": ".", "data": "iso", "bom": False},
}

RISORSE_STATICHE = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}


def apri_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Serve a far valere ON DELETE CASCADE sulle eccezioni: in SQLite le chiavi
    # esterne sono disattivate per impostazione predefinita.
    conn.execute("PRAGMA foreign_keys = ON")
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
        conn.execute(
            """CREATE TABLE IF NOT EXISTS spese_fisse (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   descrizione TEXT NOT NULL,
                   importo_cent INTEGER NOT NULL,
                   categoria TEXT NOT NULL,
                   inizio TEXT NOT NULL,
                   fine TEXT
               )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS eccezioni_fisse (
                   spesa_fissa_id INTEGER NOT NULL
                       REFERENCES spese_fisse(id) ON DELETE CASCADE,
                   mese TEXT NOT NULL,
                   importo_cent INTEGER NOT NULL,
                   PRIMARY KEY (spesa_fissa_id, mese)
               )"""
        )
        if not conn.execute("SELECT COUNT(*) FROM categorie").fetchone()[0]:
            conn.executemany(
                "INSERT INTO categorie (nome) VALUES (?)",
                [(nome,) for nome in CATEGORIE_INIZIALI],
            )
        # Nessuna spesa deve restare orfana di una categoria non più in elenco.
        conn.execute(
            "INSERT OR IGNORE INTO categorie (nome)"
            " SELECT DISTINCT categoria FROM spese"
            " UNION SELECT DISTINCT categoria FROM spese_fisse"
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


def fisse_incluse(query):
    return (parse_qs(query).get("fisse") or [""])[0] == "1"


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


def spese_in_csv(filtri, formato, con_fisse=False):
    """Rende le spese filtrate come file CSV, nel dialetto richiesto.

    Con con_fisse il file accoglie anche le ricorrenze fisse e guadagna la
    colonna «Tipo», senza la quale non si distinguerebbero dalle occasionali.
    """
    dialetto = DIALETTI_CSV.get(formato, DIALETTI_CSV["excel"])

    voci = [dict(spesa, tipo="Occasionale") for spesa in elenca_spese(filtri)]
    if con_fisse:
        voci += [dict(voce, tipo="Fissa") for voce in occorrenze_fisse(filtri)]
        voci.sort(key=lambda voce: (voce["data"], voce["tipo"], voce["descrizione"]))

    buffer = io.StringIO(newline="")
    scrittore = csv.writer(
        buffer, delimiter=dialetto["separatore"], lineterminator="\r\n"
    )

    colonne = ["Data", "Importo", "Categoria", "Descrizione"]
    scrittore.writerow(colonne + ["Tipo"] if con_fisse else colonne)

    for voce in voci:
        riga = [
            data_nel_dialetto(voce["data"], dialetto),
            f"{voce['importo']:.2f}".replace(".", dialetto["decimale"]),
            voce["categoria"],
            voce["descrizione"],
        ]
        scrittore.writerow(riga + [voce["tipo"]] if con_fisse else riga)

    return buffer.getvalue().encode("utf-8-sig" if dialetto["bom"] else "utf-8")


def data_nel_dialetto(iso, dialetto):
    if dialetto["data"] == "iso":
        return iso
    return date.fromisoformat(iso).strftime("%d/%m/%Y")


def nome_file_csv(filtri):
    if filtri.get("da") or filtri.get("a"):
        return f"spese_{filtri.get('da', 'inizio')}_{filtri.get('a', 'oggi')}.csv"
    return f"spese_{date.today().isoformat()}.csv"


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


def mese_di(iso):
    return iso[:7]


def mese_corrente():
    return date.today().strftime("%Y-%m")


def mesi_tra(primo, ultimo):
    """Elenca i mesi «AAAA-MM» da primo a ultimo, estremi inclusi."""
    mesi = []
    anno, mese = (int(parte) for parte in primo.split("-"))
    corrente = primo
    while corrente <= ultimo:
        mesi.append(corrente)
        anno, mese = (anno + 1, 1) if mese == 12 else (anno, mese + 1)
        corrente = f"{anno:04d}-{mese:02d}"
    return mesi


def occorrenze_fisse(filtri=None):
    """Espande le spese fisse nelle singole ricorrenze mensili del periodo.

    Ogni ricorrenza è datata al primo del mese e viene poi filtrata sulla data
    esatta, così si comporta come una spesa normale. Il periodo non supera mai
    il mese corrente: i mesi futuri non sono ancora stati spesi.
    """
    filtri = filtri or {}
    da, a = filtri.get("da"), filtri.get("a")
    limite_alto = min(mese_di(a), mese_corrente()) if a else mese_corrente()
    categoria = filtri.get("categoria")
    testo = (filtri.get("testo") or "").lower()

    with apri_db() as conn:
        fisse = conn.execute(
            "SELECT id, descrizione, importo_cent, categoria, inizio, fine"
            " FROM spese_fisse"
        ).fetchall()
        eccezioni = {
            (riga["spesa_fissa_id"], riga["mese"]): riga["importo_cent"]
            for riga in conn.execute(
                "SELECT spesa_fissa_id, mese, importo_cent FROM eccezioni_fisse"
            )
        }

    ricorrenze = []
    for fissa in fisse:
        if categoria and fissa["categoria"] != categoria:
            continue
        if testo and testo not in fissa["descrizione"].lower():
            continue

        primo = max(fissa["inizio"], mese_di(da)) if da else fissa["inizio"]
        ultimo = min(fissa["fine"], limite_alto) if fissa["fine"] else limite_alto

        for mese in mesi_tra(primo, ultimo):
            giorno = f"{mese}-01"
            if (da and giorno < da) or (a and giorno > a):
                continue
            centesimi = eccezioni.get((fissa["id"], mese), fissa["importo_cent"])
            ricorrenze.append(
                {
                    "id_fissa": fissa["id"],
                    "data": giorno,
                    "mese": mese,
                    "importo": centesimi / 100,
                    "categoria": fissa["categoria"],
                    "descrizione": fissa["descrizione"],
                }
            )

    ricorrenze.sort(key=lambda voce: (voce["data"], voce["descrizione"]))
    return ricorrenze


def elenca_spese_fisse():
    with apri_db() as conn:
        righe = conn.execute(
            "SELECT id, descrizione, importo_cent, categoria, inizio, fine"
            " FROM spese_fisse ORDER BY descrizione COLLATE NOCASE"
        ).fetchall()
        eccezioni = conn.execute(
            "SELECT spesa_fissa_id, mese, importo_cent FROM eccezioni_fisse"
            " ORDER BY mese"
        ).fetchall()

    per_fissa = {}
    for riga in eccezioni:
        per_fissa.setdefault(riga["spesa_fissa_id"], []).append(
            {"mese": riga["mese"], "importo": riga["importo_cent"] / 100}
        )

    return [
        {
            "id": riga["id"],
            "descrizione": riga["descrizione"],
            "importo": riga["importo_cent"] / 100,
            "categoria": riga["categoria"],
            "inizio": riga["inizio"],
            "fine": riga["fine"],
            "eccezioni": per_fissa.get(riga["id"], []),
        }
        for riga in righe
    ]


def aggiungi_spesa_fissa(fissa):
    with apri_db() as conn:
        return conn.execute(
            "INSERT INTO spese_fisse (descrizione, importo_cent, categoria, inizio, fine)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                fissa["descrizione"],
                fissa["importo_cent"],
                fissa["categoria"],
                fissa["inizio"],
                fissa["fine"],
            ),
        ).lastrowid


def aggiorna_spesa_fissa(id_fissa, fissa):
    with apri_db() as conn:
        return (
            conn.execute(
                "UPDATE spese_fisse SET descrizione = ?, importo_cent = ?,"
                " categoria = ?, inizio = ?, fine = ? WHERE id = ?",
                (
                    fissa["descrizione"],
                    fissa["importo_cent"],
                    fissa["categoria"],
                    fissa["inizio"],
                    fissa["fine"],
                    id_fissa,
                ),
            ).rowcount
            > 0
        )


def elimina_spesa_fissa(id_fissa):
    with apri_db() as conn:
        return (
            conn.execute("DELETE FROM spese_fisse WHERE id = ?", (id_fissa,)).rowcount > 0
        )


def imposta_eccezione(id_fissa, mese, centesimi):
    with apri_db() as conn:
        if not conn.execute(
            "SELECT 1 FROM spese_fisse WHERE id = ?", (id_fissa,)
        ).fetchone():
            return False, "La spesa fissa non esiste."
        conn.execute(
            "INSERT INTO eccezioni_fisse (spesa_fissa_id, mese, importo_cent)"
            " VALUES (?, ?, ?)"
            " ON CONFLICT (spesa_fissa_id, mese) DO UPDATE SET importo_cent = excluded.importo_cent",
            (id_fissa, mese, centesimi),
        )
        return True, None


def elimina_eccezione(id_fissa, mese):
    with apri_db() as conn:
        eliminata = conn.execute(
            "DELETE FROM eccezioni_fisse WHERE spesa_fissa_id = ? AND mese = ?",
            (id_fissa, mese),
        ).rowcount
    return (True, None) if eliminata else (False, "L'eccezione non esiste.")


def riepilogo(filtri=None, con_fisse=False):
    """Aggregati sulle spese che superano i filtri: per categoria e per mese.

    Con con_fisse le ricorrenze delle spese fisse confluiscono negli stessi
    aggregati, come se fossero spese datate al primo del mese.
    """
    filtri = filtri or {}
    dove, parametri = condizioni_filtro(filtri)

    with apri_db() as conn:
        totali = conn.execute(
            "SELECT COUNT(*) AS numero, COALESCE(SUM(importo_cent), 0) AS somma,"
            f" MIN(data) AS prima, MAX(data) AS ultima FROM spese{dove}",
            parametri,
        ).fetchone()

        per_categoria = conn.execute(
            "SELECT categoria, SUM(importo_cent) AS somma"
            f" FROM spese{dove} GROUP BY categoria",
            parametri,
        ).fetchall()

        per_mese = conn.execute(
            "SELECT substr(data, 1, 7) AS mese, SUM(importo_cent) AS somma"
            f" FROM spese{dove} GROUP BY mese",
            parametri,
        ).fetchall()

    categorie = {riga["categoria"]: riga["somma"] for riga in per_categoria}
    mesi = {riga["mese"]: riga["somma"] for riga in per_mese}
    somma = totali["somma"]
    numero = totali["numero"]

    ricorrenze = occorrenze_fisse(filtri) if con_fisse else []
    for voce in ricorrenze:
        centesimi = round(voce["importo"] * 100)
        somma += centesimi
        numero += 1
        categorie[voce["categoria"]] = categorie.get(voce["categoria"], 0) + centesimi
        mesi[voce["mese"]] = mesi.get(voce["mese"], 0) + centesimi

    date_note = [giorno for giorno in (totali["prima"], totali["ultima"]) if giorno]
    if ricorrenze:
        date_note += [ricorrenze[0]["data"], ricorrenze[-1]["data"]]
    giorni = giorni_coperti(
        filtri, min(date_note, default=None), max(date_note, default=None)
    )

    return {
        "totale": somma / 100,
        "numero": numero,
        "media": (somma / numero / 100) if numero else 0,
        "media_giornaliera": somma / 100 / giorni,
        "giorni": giorni,
        "per_categoria": [
            {
                "categoria": nome,
                "totale": valore / 100,
                "quota": valore / somma if somma else 0,
            }
            for nome, valore in sorted(categorie.items(), key=lambda voce: -voce[1])
        ],
        "per_mese": [
            {"mese": mese, "totale": valore / 100}
            for mese, valore in sorted(mesi.items())
        ],
    }


def giorni_coperti(filtri, prima, ultima):
    """Ampiezza in giorni del periodo osservato, mai inferiore a 1.

    Con un intervallo impostato conta i giorni richiesti, altrimenti quelli
    effettivamente coperti dalle spese: una media giornaliera calcolata su un
    periodo diverso da quello mostrato sarebbe fuorviante.
    """
    inizio = filtri.get("da") or prima
    fine = filtri.get("a") or ultima
    if not inizio or not fine:
        return 1
    ampiezza = (date.fromisoformat(fine) - date.fromisoformat(inizio)).days + 1
    return max(ampiezza, 1)


def elenca_categorie():
    with apri_db() as conn:
        righe = conn.execute(
            "SELECT c.id, c.nome,"
            " (SELECT COUNT(*) FROM spese s WHERE s.categoria = c.nome)"
            " + (SELECT COUNT(*) FROM spese_fisse f WHERE f.categoria = c.nome) AS usi"
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
        for tabella in ("spese", "spese_fisse"):
            conn.execute(
                f"UPDATE {tabella} SET categoria = ? WHERE categoria = ?",
                (nome, riga["nome"]),
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
            "SELECT (SELECT COUNT(*) FROM spese WHERE categoria = :nome) AS occasionali,"
            " (SELECT COUNT(*) FROM spese_fisse WHERE categoria = :nome) AS fisse",
            {"nome": riga["nome"]},
        ).fetchone()

        parti = []
        if usi["occasionali"]:
            parti.append(
                f"{usi['occasionali']} {'spesa' if usi['occasionali'] == 1 else 'spese'}"
            )
        if usi["fisse"]:
            parti.append(
                f"{usi['fisse']} {'spesa fissa' if usi['fisse'] == 1 else 'spese fisse'}"
            )
        if parti:
            return False, (
                f"«{riga['nome']}» è usata da {' e '.join(parti)}:"
                " riassegnale prima di eliminarla."
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


def importo_in_centesimi(grezzo):
    """Converte un importo in euro nei centesimi da salvare.

    Restituisce (centesimi, errore): centesimi è None se l'importo non va bene.
    """
    try:
        importo = float(str(grezzo).strip().replace(",", "."))
    except ValueError:
        return None, "L'importo deve essere un numero."
    if not importo > 0:
        return None, "L'importo deve essere maggiore di zero."
    if importo > IMPORTO_MASSIMO:
        return None, f"L'importo non può superare {IMPORTO_MASSIMO} euro."
    return round(importo * 100), None


def valida_fissa(payload):
    """Converte il payload in una spesa fissa pronta per il database."""
    errori = []

    descrizione = str(payload.get("descrizione", "")).strip()[:200]
    if not descrizione:
        errori.append("Indica una descrizione: è il nome della spesa fissa.")

    importo_cent, errore_importo = importo_in_centesimi(payload.get("importo"))
    if errore_importo:
        errori.append(errore_importo)

    categoria = nome_categoria_canonico(str(payload.get("categoria", "")).strip())
    if categoria is None:
        errori.append("Scegli una categoria tra quelle disponibili.")

    inizio = mese_valido(payload.get("inizio"))
    if inizio is None:
        errori.append("Indica il mese di inizio nel formato AAAA-MM.")

    fine = None
    grezzo_fine = str(payload.get("fine") or "").strip()
    if grezzo_fine:
        fine = mese_valido(grezzo_fine)
        if fine is None:
            errori.append("Il mese di fine deve essere nel formato AAAA-MM.")
        elif inizio and fine < inizio:
            errori.append("Il mese di fine non può precedere quello di inizio.")

    if errori:
        return None, errori

    return {
        "descrizione": descrizione,
        "importo_cent": importo_cent,
        "categoria": categoria,
        "inizio": inizio,
        "fine": fine,
    }, []


def mese_valido(grezzo):
    """Restituisce il mese «AAAA-MM» se valido, altrimenti None."""
    mese = str(grezzo or "").strip()
    if not FORMATO_MESE.match(mese):
        return None
    try:
        date.fromisoformat(f"{mese}-01")
    except ValueError:
        return None
    return mese


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

    importo_cent, errore_importo = importo_in_centesimi(payload.get("importo"))
    if errore_importo:
        errori.append(errore_importo)

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

        filtri = filtri_da_query(indirizzo.query)
        con_fisse = fisse_incluse(indirizzo.query)

        if indirizzo.path == "/api/spese":
            spese = elenca_spese(filtri)
            ricorrenze = occorrenze_fisse(filtri) if con_fisse else []
            self._json(
                200,
                {
                    "spese": spese,
                    "totale": round(sum(s["importo"] for s in spese), 2),
                    "totale_fisse": round(sum(r["importo"] for r in ricorrenze), 2),
                    "numero_fisse": len(ricorrenze),
                    "categorie": [c["nome"] for c in elenca_categorie()],
                },
            )
        elif indirizzo.path == "/api/spese.csv":
            formato = (parse_qs(indirizzo.query).get("formato") or [""])[0]
            self._csv(
                spese_in_csv(filtri, formato, con_fisse), nome_file_csv(filtri)
            )
        elif indirizzo.path == "/api/riepilogo":
            self._json(200, riepilogo(filtri, con_fisse))
        elif indirizzo.path == "/api/fisse":
            self._json(200, {"fisse": elenca_spese_fisse()})
        elif indirizzo.path == "/api/categorie":
            self._json(200, {"categorie": elenca_categorie()})
        elif indirizzo.path in RISORSE_STATICHE:
            self._statico(*RISORSE_STATICHE[indirizzo.path])
        else:
            self._non_trovato()

    def do_POST(self):
        if self.path == "/api/spese":
            spesa = self._dal_corpo(valida)
            if spesa is not None:
                self._json(201, {"id": aggiungi_spesa(spesa)})
        elif self.path == "/api/fisse":
            fissa = self._dal_corpo(valida_fissa)
            if fissa is not None:
                self._json(201, {"id": aggiungi_spesa_fissa(fissa)})
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
        fissa_da_modificare = PERCORSO_FISSA.match(self.path)
        eccezione = PERCORSO_ECCEZIONE.match(self.path)

        if spesa_da_modificare:
            spesa = self._dal_corpo(valida)
            if spesa is None:
                return
            if aggiorna_spesa(int(spesa_da_modificare.group(1)), spesa):
                self._json(200, {"ok": True})
            else:
                self._non_trovato("La spesa da modificare non esiste.")
        elif eccezione:
            payload = self._leggi_json()
            if payload is None:
                self._json(400, {"errori": ["Richiesta non leggibile."]})
                return
            centesimi, errore = importo_in_centesimi(payload.get("importo"))
            if errore:
                self._json(400, {"errori": [errore]})
                return
            self._esito(
                imposta_eccezione(
                    int(eccezione.group(1)), eccezione.group(2), centesimi
                )
            )
        elif fissa_da_modificare:
            fissa = self._dal_corpo(valida_fissa)
            if fissa is None:
                return
            if aggiorna_spesa_fissa(int(fissa_da_modificare.group(1)), fissa):
                self._json(200, {"ok": True})
            else:
                self._non_trovato("La spesa fissa da modificare non esiste.")
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
        fissa_da_eliminare = PERCORSO_FISSA.match(self.path)
        eccezione = PERCORSO_ECCEZIONE.match(self.path)

        if spesa_da_eliminare:
            if elimina_spesa(int(spesa_da_eliminare.group(1))):
                self._json(200, {"ok": True})
            else:
                self._non_trovato("La spesa da eliminare non esiste.")
        elif eccezione:
            self._esito(elimina_eccezione(int(eccezione.group(1)), eccezione.group(2)))
        elif fissa_da_eliminare:
            if elimina_spesa_fissa(int(fissa_da_eliminare.group(1))):
                self._json(200, {"ok": True})
            else:
                self._non_trovato("La spesa fissa da eliminare non esiste.")
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

    def _dal_corpo(self, validatore):
        """Legge e valida il corpo della richiesta; risponde da sé in caso di errore."""
        payload = self._leggi_json()
        if payload is None:
            self._json(400, {"errori": ["Richiesta non leggibile."]})
            return None

        valore, errori = validatore(payload)
        if errori:
            self._json(400, {"errori": errori})
            return None
        return valore

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

    def _csv(self, dati, nome_file):
        self._rispondi(
            200,
            dati,
            "text/csv; charset=utf-8",
            (("Content-Disposition", f'attachment; filename="{nome_file}"'),),
        )

    def _statico(self, nome, tipo):
        self._rispondi(200, (STATIC_DIR / nome).read_bytes(), tipo)

    def _rispondi(self, stato, dati, tipo, intestazioni=()):
        self.send_response(stato)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(dati)))
        for nome, valore in intestazioni:
            self.send_header(nome, valore)
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
