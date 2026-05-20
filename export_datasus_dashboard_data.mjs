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
const STATE_SCOPE = "Unidade da federação";

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

function rowToMonthlyRows(row) {
  return MONTHS.map(([key, label], index) => ({
    uid: row.parameter_uid,
    name: row.parameter_name,
    scope: row.abrangencia_name,
    year: row.year,
    month: label,
    monthIndex: index + 1,
    period: `${row.year}-${String(index + 1).padStart(2, "0")}`,
    value: row[key] ?? 0,
  }));
}

function linearRegression(points) {
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function buildNationalAnalysis(nationalMonthly, totalsByYear) {
  const points = nationalMonthly.map((row, index) => ({ x: index, y: row.value, ...row }));
  const model = linearRegression(points);
  const first = points[0];
  const last = points.at(-1);
  const accumulatedChange = first?.y ? ((last.y - first.y) / first.y) * 100 : null;
  const monthlyAverageChange = model ? model.slope : null;
  const mean = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const sd = Math.sqrt(points.reduce((sum, point) => sum + (point.y - mean) ** 2, 0) / points.length);
  const anomalies = points
    .map((point) => ({
      period: point.period,
      value: point.y,
      z: sd ? Number(((point.y - mean) / sd).toFixed(2)) : 0,
      type: point.y >= mean ? "pico" : "queda",
    }))
    .filter((point) => Math.abs(point.z) >= 2)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const yearChanges = totalsByYear.slice(1).map((row, index) => {
    const previous = totalsByYear[index];
    return {
      year: row.year,
      value: row.total,
      previous: previous.total,
      change: previous.total ? Number((((row.total - previous.total) / previous.total) * 100).toFixed(2)) : null,
    };
  });
  const forecast = model
    ? [1, 2, 3].map((step) => {
        const x = points.length + step - 1;
        const date = new Date(Date.UTC(last.year, last.monthIndex - 1 + step, 1));
        return {
          period: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
          value: Math.max(0, Math.round(model.intercept + model.slope * x)),
        };
      })
    : [];

  const monthAverages = MONTHS.map(([key, label], index) => {
    const rows = nationalMonthly.filter((row) => row.monthIndex === index + 1);
    return {
      month: label,
      average: rows.reduce((sum, row) => sum + row.value, 0) / rows.length,
    };
  }).sort((a, b) => b.average - a.average);

  return {
    periods: points.length,
    firstPeriod: first?.period ?? null,
    lastPeriod: last?.period ?? null,
    accumulatedChange: accumulatedChange === null ? null : Number(accumulatedChange.toFixed(2)),
    monthlyAverageChange: monthlyAverageChange === null ? null : Math.round(monthlyAverageChange),
    trend: monthlyAverageChange === null ? "indefinida" : monthlyAverageChange > 0 ? "alta" : monthlyAverageChange < 0 ? "queda" : "estavel",
    anomalies: anomalies.slice(0, 10),
    yearChanges,
    seasonality: {
      highest: monthAverages.slice(0, 3),
      lowest: monthAverages.slice(-3).reverse(),
    },
    forecast,
  };
}

function buildTerritorialAnalysis(latestStateRows, previousStateRows, latestTotal) {
  const previousByUid = new Map(previousStateRows.map((row) => [row.parameter_uid, row]));
  const rows = latestStateRows
    .map((row) => {
      const previous = previousByUid.get(row.parameter_uid);
      const change = previous?.ano ? ((row.ano - previous.ano) / previous.ano) * 100 : null;
      return {
        uid: row.parameter_uid,
        name: row.parameter_name,
        total: row.ano,
        previousTotal: previous?.ano ?? null,
        change: change === null ? null : Number(change.toFixed(2)),
        share: latestTotal ? Number(((row.ano / latestTotal) * 100).toFixed(2)) : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const topFiveShare = Number(rows.slice(0, 5).reduce((sum, row) => sum + (row.share ?? 0), 0).toFixed(2));
  const changes = rows.map((row) => row.change).filter((value) => value !== null).sort((a, b) => a - b);
  const medianChange = changes.length ? changes[Math.floor(changes.length / 2)] : null;
  const statesIncreasing = rows.filter((row) => (row.change ?? 0) > 0).length;
  const statesFalling = rows.filter((row) => (row.change ?? 0) < 0).length;

  return {
    rows,
    topFiveShare,
    medianChange,
    statesIncreasing,
    statesFalling,
  };
}

const exportInfo = latestExport();
const localityRows = allRows("localidade");
const nationalRows = localityRows.filter((row) => row.parameter_uid === 76);
const latestLocality = latestRows("localidade");
const latestSex = latestRows("sexo");
const latestNational = latestLocality.rows.find((row) => row.parameter_uid === 76);
const previousNational = nationalRows.at(-2);
const latestStateRows = latestLocality.rows.filter((row) => row.abrangencia_name === STATE_SCOPE);
const previousStateRows = localityRows.filter(
  (row) => row.abrangencia_name === STATE_SCOPE && row.year === previousNational?.year,
);

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
  latestByState: latestStateRows.map((row) => ({
    uid: row.parameter_uid,
    name: row.parameter_name,
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
  localityMonthly: localityRows.flatMap(rowToMonthlyRows),
};

payload.analysis = {
  national: buildNationalAnalysis(payload.nationalMonthly, totalsByYear),
  territorial: buildTerritorialAnalysis(latestStateRows, previousStateRows, latestNational?.ano ?? null),
};

mkdirSync("docs/data", { recursive: true });
writeFileSync("docs/data/datasus_cid10.json", JSON.stringify(payload, null, 2));
db.close();
