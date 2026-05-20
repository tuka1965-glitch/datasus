import { mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("datasus.db");
const MONTHS = [
  ["jan", "Jan"],
  ["fev", "Fev"],
  ["mar", "Mar"],
  ["abr", "Abr"],
  ["mai", "Mai"],
  ["jun", "Jun"],
  ["jul", "Jul"],
  ["ago", "Ago"],
  ["set", "Set"],
  ["out", "Out"],
  ["nov", "Nov"],
  ["dez", "Dez"],
];

function latestExport() {
  return db.prepare(`
    SELECT source_page, api_url, source_date, source_name, source_acronym, collected_at
    FROM datasus_exports
    ORDER BY collected_at DESC, id DESC
    LIMIT 1
  `).get();
}

function allRows(queryName) {
  return db.prepare(`
    SELECT *
    FROM datasus_rows
    WHERE query_name = ?
    ORDER BY year ASC, abrangencia_uid ASC, parameter_uid ASC
  `).all(queryName);
}

function latestRows(queryName) {
  const latestYear = db.prepare(`
    SELECT MAX(year) AS year
    FROM datasus_rows
    WHERE query_name = ?
  `).get(queryName).year;

  return {
    year: latestYear,
    rows: db.prepare(`
      SELECT *
      FROM datasus_rows
      WHERE query_name = ? AND year = ?
      ORDER BY ano DESC
    `).all(queryName, latestYear),
  };
}

function rowToMonthSeries(row) {
  return MONTHS.map(([key, label]) => ({
    month: label,
    value: row[key] ?? 0,
  }));
}

const exportInfo = latestExport();
const localityRows = allRows("localidade");
const nationalRows = localityRows.filter((row) => row.parameter_uid === 76);
const latestLocality = latestRows("localidade");
const latestSex = latestRows("sexo");
const latestNational = latestLocality.rows.find((row) => row.parameter_uid === 76);
const previousNational = nationalRows.at(-2);

const totalsByYear = nationalRows.map((row) => ({
  year: row.year,
  total: row.ano,
}));

const yearOverYear =
  latestNational && previousNational
    ? Number((((latestNational.ano - previousNational.ano) / previousNational.ano) * 100).toFixed(2))
    : null;

const payload = {
  generatedAt: new Date().toISOString(),
  title: "Mortalidade CID-10",
  source: {
    pageUrl: exportInfo.source_page,
    apiUrl: exportInfo.api_url,
    name: exportInfo.source_name,
    acronym: exportInfo.source_acronym,
    sourceDate: exportInfo.source_date,
  },
  filters: {
    local: "Obitos por residencia",
    indicator: "Obitos totais",
    statistic: "Numero de obitos",
  },
  totals: {
    latestYear: latestLocality.year,
    latestTotal: latestNational?.ano ?? null,
    previousYear: previousNational?.year ?? null,
    previousTotal: previousNational?.ano ?? null,
    yearOverYear,
  },
  totalsByYear,
  latestByLocality: latestLocality.rows.map((row) => ({
    uid: row.parameter_uid,
    name: row.parameter_name,
    scope: row.abrangencia_name,
    total: row.ano,
    months: rowToMonthSeries(row),
  })),
  latestBySex: latestSex.rows.map((row) => ({
    uid: row.parameter_uid,
    name: row.parameter_name,
    total: row.ano,
    months: rowToMonthSeries(row),
  })),
  nationalMonthly: nationalRows.flatMap((row) =>
    MONTHS.map(([key, label], index) => ({
      year: row.year,
      month: label,
      period: `${row.year}-${String(index + 1).padStart(2, "0")}`,
      value: row[key] ?? 0,
    })),
  ),
};

mkdirSync("docs/data", { recursive: true });
writeFileSync("docs/data/datasus_cid10.json", JSON.stringify(payload, null, 2));
db.close();
