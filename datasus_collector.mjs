import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_CONFIG = "datasus_config.json";
const DEFAULT_DB = "datasus.db";
const MONTH_KEYS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez", "ano"];

function parseArgs() {
  const args = { config: DEFAULT_CONFIG, db: DEFAULT_DB };
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--config") args.config = process.argv[++index];
    if (arg === "--db") args.db = process.argv[++index];
  }
  return args;
}

function initDb(db) {
  db.exec(`
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
  `);
}

function buildUrl(apiUrl, endpoint, params) {
  const url = new URL(`exportar/${endpoint}`, apiUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "datasus-cid10-collector/1.0" },
  });
  if (!response.ok) {
    throw new Error(`DataSUS respondeu ${response.status} para ${url}`);
  }
  return response.json();
}

function insertRows(db, exportId, queryName, endpoint, year, payload) {
  const parameterKey = payload.resumo?.parametro ?? endpoint;
  const statement = db.prepare(`
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
  `);

  for (const result of payload.resultados ?? []) {
    const abrangencia = result.abrangencia ?? {};
    statement.run({
      export_id: exportId,
      query_name: queryName,
      endpoint,
      year,
      parameter_key: parameterKey,
      parameter_uid: result.uid,
      parameter_name: result.nome,
      abrangencia_uid: abrangencia.uid ?? null,
      abrangencia_name: abrangencia.nome ?? null,
      ...Object.fromEntries(MONTH_KEYS.map((key) => [key, result[key] ?? null])),
    });
  }
}

function replaceExport(db, queryName, endpoint, year, source, requestUrl, payload) {
  const resumo = payload.resumo ?? {};
  db.prepare("DELETE FROM datasus_exports WHERE request_url = ?").run(requestUrl);
  const result = db.prepare(`
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
  `).run(
    queryName,
    endpoint,
    year,
    source.page_url,
    source.api_url,
    requestUrl,
    JSON.stringify(payload),
    resumo.data ?? null,
    resumo.fonte ?? null,
    resumo.sigla ?? null,
    new Date().toISOString(),
  );
  insertRows(db, result.lastInsertRowid, queryName, endpoint, year, payload);
  return payload.resultados?.length ?? 0;
}

async function main() {
  const args = parseArgs();
  const config = JSON.parse(readFileSync(args.config, "utf8"));
  const db = new DatabaseSync(args.db);
  initDb(db);

  let totalRows = 0;
  for (const query of config.queries) {
    for (const year of query.years) {
      const params = { ano: year, ...query.params };
      const requestUrl = buildUrl(config.source.api_url, query.endpoint, params);
      const payload = await fetchJson(requestUrl);
      const rowCount = replaceExport(db, query.name, query.endpoint, year, config.source, requestUrl, payload);
      totalRows += rowCount;
      console.log(`${query.name} ${year}: ${rowCount} linhas`);
    }
  }

  db.close();
  console.log(`Total de linhas DataSUS coletadas: ${totalRows}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
