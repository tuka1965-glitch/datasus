const DATASUS_COLORS = ["#0f766e", "#2563eb", "#b45309", "#be123c", "#6d28d9", "#4b5563"];
const STATE_UID_TO_UF = {
  11: "RO",
  12: "AC",
  13: "AM",
  14: "RR",
  15: "PA",
  16: "AP",
  17: "TO",
  21: "MA",
  22: "PI",
  23: "CE",
  24: "RN",
  25: "PB",
  26: "PE",
  27: "AL",
  28: "SE",
  29: "BA",
  31: "MG",
  32: "ES",
  33: "RJ",
  35: "SP",
  41: "PR",
  42: "SC",
  43: "RS",
  50: "MS",
  51: "MT",
  52: "GO",
  53: "DF",
};

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value ?? 0);
}

function formatPercent(value) {
  if (value === null || value === undefined) return "-";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderSummary(data) {
  const cards = [
    ["Ano mais recente", data.totals.latestYear],
    ["Obitos no Brasil", formatNumber(data.totals.latestTotal)],
    ["Var. anual", formatPercent(data.totals.yearOverYear)],
    ["Tendencia", data.analysis?.national?.trend ?? "-"],
    ["Top 5 UFs", formatPercent(data.analysis?.territorial?.topFiveShare)],
    ["Fonte", data.source.acronym],
    ["Extracao", data.source.sourceDate],
  ];

  document.querySelector("#datasus-summary").innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span>${label}</span>
          <strong>${value ?? "-"}</strong>
        </article>
      `,
    )
    .join("");
}

function renderAnalysis(data) {
  const national = data.analysis.national;
  const territorial = data.analysis.territorial;
  const anomalies = national.anomalies.length
    ? national.anomalies
        .slice(0, 3)
        .map((item) => `${item.period} (${item.type}, desvio ${formatNumber(item.z, 2)})`)
        .join(", ")
    : "nenhum ponto ultrapassou 2 desvios-padrao na serie nacional";
  const highMonths = national.seasonality.highest
    .map((item) => `${item.month} (${formatNumber(item.average)})`)
    .join(", ");
  const lowMonths = national.seasonality.lowest
    .map((item) => `${item.month} (${formatNumber(item.average)})`)
    .join(", ");

  document.querySelector("#datasus-analysis").innerHTML = [
    `A serie nacional cobre <strong>${national.periods} meses</strong>, de ${national.firstPeriod} a ${national.lastPeriod}. No periodo completo, a variacao acumulada foi de <strong>${formatPercent(national.accumulatedChange)}</strong>, com inclinacao media estimada de ${formatNumber(national.monthlyAverageChange)} obitos por mes.`,
    `Na comparacao anual, ${data.totals.latestYear} registra ${formatNumber(data.totals.latestTotal)} obitos, ${formatPercent(data.totals.yearOverYear)} em relacao a ${data.totals.previousYear}. Entre as UFs, ${territorial.statesFalling} caem e ${territorial.statesIncreasing} sobem frente ao ano anterior; a mediana estadual e ${formatPercent(territorial.medianChange)}.`,
    `A sazonalidade mensal mostra medias mais altas em ${highMonths}; as menores medias aparecem em ${lowMonths}. Como no analisador temporal original, essa leitura ajuda a evitar comparar meses de padroes sazonais diferentes como se fossem equivalentes.`,
    `Atipicidade nacional: ${anomalies}. Esses pontos devem ser tratados como pistas para auditoria substantiva, pois podem refletir mudancas epidemiologicas, atraso de registro ou revisoes na base.`,
  ]
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");
}

function renderYearChart(data) {
  new Chart(document.querySelector("#datasus-year-chart"), {
    type: "bar",
    data: {
      labels: data.totalsByYear.map((row) => row.year),
      datasets: [
        {
          label: "Obitos",
          data: data.totalsByYear.map((row) => row.total),
          backgroundColor: DATASUS_COLORS[0],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatNumber(value),
          },
        },
      },
    },
  });
}

function renderMonthChart(data) {
  new Chart(document.querySelector("#datasus-month-chart"), {
    type: "line",
    data: {
      labels: data.nationalMonthly.map((row) => row.period),
      datasets: [
        {
          label: "Obitos",
          data: data.nationalMonthly.map((row) => row.value),
          borderColor: DATASUS_COLORS[1],
          backgroundColor: DATASUS_COLORS[1],
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatNumber(value),
          },
        },
      },
    },
  });
}

function renderForecast(data) {
  document.querySelector("#datasus-forecast-body").innerHTML = data.analysis.national.forecast
    .map(
      (row) => `
        <tr>
          <td>${row.period}</td>
          <td>${formatNumber(row.value)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderLocalityTable(data) {
  document.querySelector("#datasus-locality-body").innerHTML = data.latestByLocality
    .map(
      (row) => `
        <tr>
          <td>${row.name}</td>
          <td>${row.scope ?? "-"}</td>
          <td>${formatNumber(row.total)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderSexTable(data) {
  const total = data.latestBySex.find((row) => row.name === "Todos")?.total ?? data.totals.latestTotal;
  document.querySelector("#datasus-sex-body").innerHTML = data.latestBySex
    .map((row) => ({
      ...row,
      percentage: total ? (row.total / total) * 100 : null,
    }))
    .map(
      (row) => `
        <tr>
          <td>${row.name}</td>
          <td>${formatNumber(row.total)}</td>
          <td>${formatPercent(row.percentage)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderStateShare(data) {
  const territorial = data.analysis.territorial;
  const top = territorial.rows
    .slice(0, 5)
    .map((row) => `${row.name} (${formatPercent(row.share)})`)
    .join(", ");
  document.querySelector("#datasus-territorial-text").innerHTML = `
    <p>As cinco UFs de maior peso concentram <strong>${formatPercent(territorial.topFiveShare)}</strong> dos obitos: ${top}. Compare essa concentracao com a variacao estadual para saber se a tendencia nacional esta dispersa ou puxada por poucos territorios.</p>
  `;
  document.querySelector("#datasus-state-share-body").innerHTML = territorial.rows
    .map(
      (row) => `
        <tr>
          <td>${row.name}</td>
          <td>${formatNumber(row.total)}</td>
          <td>${formatPercent(row.share)}</td>
          <td>${formatPercent(row.change)}</td>
        </tr>
      `,
    )
    .join("");
}

function parsePopulationCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  const header = rows.shift().split(",");
  return rows.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
}

async function loadPopulation() {
  const response = await fetch("./data/populacao_uf_ano.csv", { cache: "no-store" });
  if (!response.ok) return [];
  return parsePopulationCsv(await response.text());
}

function renderRates(data, populationRows) {
  const populationByUfYear = new Map(
    populationRows.map((row) => [`${row.uf}-${row.ano}`, Number(row.populacao)]),
  );
  const rows = data.latestByState
    .map((row) => {
      const uf = STATE_UID_TO_UF[row.uid];
      const population = populationByUfYear.get(`${uf}-${data.totals.latestYear}`);
      return {
        ...row,
        uf,
        population,
        rate: population ? (row.total / population) * 100000 : null,
      };
    })
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

  document.querySelector("#datasus-rate-body").innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.uf} - ${row.name}</td>
          <td>${formatNumber(row.total)}</td>
          <td>${row.population ? formatNumber(row.population) : "-"}</td>
          <td>${row.rate === null ? "-" : formatNumber(row.rate, 2)}</td>
        </tr>
      `,
    )
    .join("");
}

function calculateStateAnomalies(data) {
  const byState = new Map();
  for (const row of data.localityMonthly.filter((item) => item.scope === "Unidade da federação")) {
    const list = byState.get(row.uid) ?? [];
    list.push(row);
    byState.set(row.uid, list);
  }

  const anomalies = [];
  for (const [uid, rows] of byState.entries()) {
    const values = rows.map((row) => row.value);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    if (!sd) continue;
    for (const row of rows) {
      const z = (row.value - mean) / sd;
      if (Math.abs(z) >= 2) {
        anomalies.push({
          uid,
          uf: STATE_UID_TO_UF[uid],
          name: row.name,
          period: row.period,
          value: row.value,
          z,
        });
      }
    }
  }

  return anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 30);
}

function renderStateAnomalies(data) {
  const anomalies = calculateStateAnomalies(data);
  const text = anomalies.length
    ? `Foram encontrados ${anomalies.length} pontos estaduais com pelo menos 2 desvios-padrao em relacao a serie mensal da propria UF. Os maiores desvios aparecem em ${anomalies
        .slice(0, 5)
        .map((row) => `${row.uf} ${row.period}`)
        .join(", ")}.`
    : "Nenhum ponto estadual ultrapassou o limiar de 2 desvios-padrao.";
  document.querySelector("#datasus-anomaly-text").innerHTML = `<p>${text}</p>`;
  document.querySelector("#datasus-anomaly-body").innerHTML = anomalies
    .map(
      (row) => `
        <tr>
          <td>${row.uf} - ${row.name}</td>
          <td>${row.period}</td>
          <td>${formatNumber(row.value)}</td>
          <td>${formatNumber(row.z, 2)}</td>
        </tr>
      `,
    )
    .join("");
}

async function main() {
  const [dataResponse, populationRows] = await Promise.all([
    fetch("./data/datasus_cid10.json", { cache: "no-store" }),
    loadPopulation().catch(() => []),
  ]);
  const data = await dataResponse.json();

  document.querySelector("#datasus-title").textContent = data.title;
  document.querySelector("#datasus-source").textContent = `${data.source.acronym} - ${data.source.name}`;
  document.querySelector("#datasus-generated-at").textContent = `Atualizado em ${formatDateTime(data.generatedAt)}`;

  renderSummary(data);
  renderAnalysis(data);
  renderYearChart(data);
  renderMonthChart(data);
  renderForecast(data);
  renderLocalityTable(data);
  renderSexTable(data);
  renderStateShare(data);
  renderRates(data, populationRows);
  renderStateAnomalies(data);
}

main();
