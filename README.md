# DataSUS Mortalidade CID-10

Coletor e painel estatico para dados do painel publico DataSUS/SIM de
mortalidade CID-10.

Fonte:
https://svs.aids.gov.br/daent/centrais-de-conteudos/paineis-de-monitoramento/mortalidade/cid10/

## Uso

```powershell
node .\datasus_collector.mjs
node .\export_datasus_dashboard_data.mjs
```

O coletor le `datasus_config.json`, consulta a API publica usada pelo painel
oficial, grava os dados em `datasus.db` e gera `docs/data/datasus_cid10.json`.

A pagina estatica principal fica em:

```text
docs/index.html
```

Por padrao, a configuracao coleta obitos totais por residencia para Brasil,
regioes e UFs, alem da distribuicao por sexo, nos anos de 2020 a 2025.

## Analises incluidas

O painel segue a mesma logica analitica do projeto `analisador-temporal`,
adaptada para mortalidade CID-10:

- serie anual e serie mensal nacional;
- texto automatico com tendencia, variacao acumulada, sazonalidade e pontos
  atipicos;
- comparacao com o ano anterior;
- projecao linear simples dos proximos tres meses;
- participacao dos estados no total nacional;
- taxas por 100 mil habitantes usando `docs/data/populacao_uf_ano.csv`;
- atipicidade mensal por UF com criterio de dois desvios-padrao.

As taxas usam a mesma base populacional estadual de referencia do analisador
temporal: Projecao da Populacao do IBGE/SIDRA, tabela 7358, edicao 2018.
