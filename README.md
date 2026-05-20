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
