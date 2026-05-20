const DATASUS_COLORS = ["#0f766e", "#2563eb", "#b45309", "#be123c", "#6d28d9", "#4b5563"];

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
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
    ["Ano anterior", data.totals.previousYear],
    ["Variacao anual", formatPercent(data.totals.yearOverYear)],
    ["Fonte", data.source.acronym],
    ["Extracao", data.source.sourceDate],
    ["Filtro", data.filters.indicator],
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

async function main() {
  const response = await fetch("./data/datasus_cid10.json", { cache: "no-store" });
  const data = await response.json();

  document.querySelector("#datasus-title").textContent = data.title;
  document.querySelector("#datasus-source").textContent = `${data.source.acronym} - ${data.source.name}`;
  document.querySelector("#datasus-generated-at").textContent = `Atualizado em ${formatDateTime(data.generatedAt)}`;

  renderSummary(data);
  renderYearChart(data);
  renderMonthChart(data);
  renderLocalityTable(data);
  renderSexTable(data);
}

main();
