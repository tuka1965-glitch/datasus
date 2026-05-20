from __future__ import annotations

import argparse
import json
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_CONFIG = Path("datasus_config.json")
DEFAULT_DB = Path("datasus.db")
MONTH_KEYS = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez", "ano")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS datasus_exports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_name TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            year INTEGER NOT NULL,
            source_page TEXT NOT NULL,
            api_url TEXT NOT NULL,
            request_url TEXT NOT NULL UNIQUE,
            payload_json TEXT NOT NULL,
            source_date TEXT,
            source_name TEXT,
            source_acronym TEXT,
            collected_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS datasus_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            export_id INTEGER NOT NULL REFERENCES datasus_exports(id) ON DELETE CASCADE,
            query_name TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            year INTEGER NOT NULL,
            parameter_key TEXT NOT NULL,
            parameter_uid INTEGER NOT NULL,
            parameter_name TEXT NOT NULL,
            abrangencia_uid INTEGER,
            abrangencia_name TEXT,
            jan REAL,
            fev REAL,
            mar REAL,
            abr REAL,
            mai REAL,
            jun REAL,
            jul REAL,
            ago REAL,
            "set" REAL,
            out REAL,
            nov REAL,
            dez REAL,
            ano REAL
        );

        CREATE INDEX IF NOT EXISTS idx_datasus_rows_query_year
            ON datasus_rows(query_name, year);

        CREATE INDEX IF NOT EXISTS idx_datasus_rows_parameter
            ON datasus_rows(parameter_key, parameter_uid);
        """
    )


def load_config(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_url(api_url: str, endpoint: str, params: dict[str, Any]) -> str:
    base_url = urllib.parse.urljoin(api_url, f"exportar/{endpoint}")
    return f"{base_url}?{urllib.parse.urlencode(params)}"


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "datasus-cid10-collector/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def replace_export(
    connection: sqlite3.Connection,
    *,
    query_name: str,
    endpoint: str,
    year: int,
    source_page: str,
    api_url: str,
    request_url: str,
    payload: dict[str, Any],
) -> int:
    resumo = payload.get("resumo", {})
    connection.execute("DELETE FROM datasus_exports WHERE request_url = ?", (request_url,))
    cursor = connection.execute(
        """
        INSERT INTO datasus_exports (
            query_name,
            endpoint,
            year,
            source_page,
            api_url,
            request_url,
            payload_json,
            source_date,
            source_name,
            source_acronym,
            collected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            query_name,
            endpoint,
            year,
            source_page,
            api_url,
            request_url,
            json.dumps(payload, ensure_ascii=False),
            resumo.get("data"),
            resumo.get("fonte"),
            resumo.get("sigla"),
            utc_now(),
        ),
    )
    export_id = cursor.lastrowid
    insert_rows(connection, export_id, query_name, endpoint, year, payload)
    return len(payload.get("resultados", []))


def insert_rows(
    connection: sqlite3.Connection,
    export_id: int,
    query_name: str,
    endpoint: str,
    year: int,
    payload: dict[str, Any],
) -> None:
    parameter_key = payload.get("resumo", {}).get("parametro", endpoint)
    rows = []

    for result in payload.get("resultados", []):
        abrangencia = result.get("abrangencia") or {}
        rows.append(
            {
                "export_id": export_id,
                "query_name": query_name,
                "endpoint": endpoint,
                "year": year,
                "parameter_key": parameter_key,
                "parameter_uid": result["uid"],
                "parameter_name": result["nome"],
                "abrangencia_uid": abrangencia.get("uid"),
                "abrangencia_name": abrangencia.get("nome"),
                **{key: result.get(key) for key in MONTH_KEYS},
            }
        )

    connection.executemany(
        """
        INSERT INTO datasus_rows (
            export_id,
            query_name,
            endpoint,
            year,
            parameter_key,
            parameter_uid,
            parameter_name,
            abrangencia_uid,
            abrangencia_name,
            jan,
            fev,
            mar,
            abr,
            mai,
            jun,
            jul,
            ago,
            "set",
            out,
            nov,
            dez,
            ano
        ) VALUES (
            :export_id,
            :query_name,
            :endpoint,
            :year,
            :parameter_key,
            :parameter_uid,
            :parameter_name,
            :abrangencia_uid,
            :abrangencia_name,
            :jan,
            :fev,
            :mar,
            :abr,
            :mai,
            :jun,
            :jul,
            :ago,
            :set,
            :out,
            :nov,
            :dez,
            :ano
        )
        """,
        rows,
    )


def collect(db_path: Path, config_path: Path) -> None:
    config = load_config(config_path)
    source = config["source"]

    with sqlite3.connect(db_path) as connection:
        init_db(connection)

        total_rows = 0
        for query in config["queries"]:
            for year in query["years"]:
                params = {"ano": year, **query["params"]}
                request_url = build_url(source["api_url"], query["endpoint"], params)
                payload = fetch_json(request_url)
                row_count = replace_export(
                    connection,
                    query_name=query["name"],
                    endpoint=query["endpoint"],
                    year=year,
                    source_page=source["page_url"],
                    api_url=source["api_url"],
                    request_url=request_url,
                    payload=payload,
                )
                total_rows += row_count
                print(f'{query["name"]} {year}: {row_count} linhas')

        connection.commit()
        print(f"Total de linhas DataSUS coletadas: {total_rows}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Coleta dados do painel DataSUS/SIM CID-10 para SQLite.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Caminho do banco SQLite.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="Arquivo JSON de configuracao.")
    args = parser.parse_args()
    collect(args.db, args.config)


if __name__ == "__main__":
    main()
