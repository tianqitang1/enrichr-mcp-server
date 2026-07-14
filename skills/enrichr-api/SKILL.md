---
name: enrichr-api
description: Direct access to the Enrichr REST API for work the enrichr_analysis MCP tool cannot do — reverse gene lookup (which gene sets contain a gene), downloading a whole library as GMT, unfiltered result tables including non-significant terms, batch enrichment over many gene lists (e.g. per single-cell cluster), and shareable Enrichr web links. Use when the user asks for any of those, or hits a limit of the MCP tool. Do NOT use for ordinary enrichment of a single gene list — the MCP tool is better at that.
---

# Enrichr REST API

## Use the MCP tool first

For "run enrichment on these genes", call the **`enrichr_analysis` MCP tool**. It
filters to significant terms, formats for reading, handles background correction,
and manages token budget. Reach for the raw API only when you need something it
does not expose:

| You need | Use |
|---|---|
| Enrichment of one gene list | `enrichr_analysis` tool |
| Which libraries suit a topic | `suggest_libraries` tool |
| **Which gene sets contain gene X** | this skill — `genemap` |
| **A whole library as GMT** | this skill — `download` |
| **All terms, including non-significant** | this skill — `enrich` |
| **Many gene lists at once** (per-cluster) | this skill — `enrich_batch` |
| **A shareable Enrichr web link** | this skill — `add_list` returns `shortId` |

## The script

`scripts/enrichr.py` — no dependencies beyond the standard library.

```bash
python scripts/enrichr.py libraries                    # every live library + term count
python scripts/enrichr.py genemap TP53                 # TP53 appears in 214 libraries
python scripts/enrichr.py download KEGG_2026 kegg.gmt  # 352 terms as GMT
python scripts/enrichr.py enrich genes.txt KEGG_2026   # unfiltered JSON table
python scripts/enrichr.py enrich genes.txt KEGG_2026 --background bg.txt
```

Import it for batch work:

```python
from enrichr import enrich_batch, enrich, genemap, download_library

clusters = {"cluster_0": [...], "cluster_1": [...]}   # e.g. Seurat/scanpy markers
results = enrich_batch(clusters, "KEGG_2026")          # {name: [term, ...] | None}
```

## Endpoints

Base: `https://maayanlab.cloud/Enrichr`. Background correction lives on a
*different* service: `https://maayanlab.cloud/speedrichr/api`.

| Endpoint | Purpose |
|---|---|
| `POST /addList` | Submit genes → `userListId` + `shortId` |
| `GET /enrich?userListId=&backgroundType=<library>` | Enrichment, all terms |
| `GET /export?userListId=&backgroundType=&filename=` | Same, as TSV |
| `GET /view?userListId=` | Read back a submitted list |
| `GET /genemap?gene=<sym>&json=true` | Reverse lookup: gene → libraries/terms |
| `GET /geneSetLibrary?mode=text&libraryName=<lib>` | Whole library as GMT |
| `GET /datasetStatistics` | Every live library. **The only source of truth.** |
| `POST speedrichr/addList`, `/addbackground`, `/backgroundenrich` | Background-corrected enrichment |

A `shortId` from `addList` is a shareable web page — good for collaborators and
methods sections:
`https://maayanlab.cloud/Enrichr/enrich?dataset=<shortId>`

## Traps

These are the reason this skill exists. Each one has bitten this repo.

**A retired library returns `{}`, not an error.** Enrichr retires libraries
constantly and the API does not tell you — `/enrich` just answers with an empty
object, which reads as "no enrichment" rather than "that library is gone". Never
trust a hardcoded or remembered library name. Check `datasetStatistics`. As of
2026-07 there are 228 live libraries, and names drift in ways that look like typos
(`BioPlanet_2019` is live, `Bioplanet_2019` is dead).

**Prefer the current vintage.** Many libraries ship a dozen years of snapshots
(`GO_Biological_Process_2013` … `_2026`). Use the newest unless the user is
reproducing an old analysis. Current generation: `GO_Biological_Process_2026`,
`GO_Cellular_Component_2026`, `GO_Molecular_Function_2026`, `KEGG_2026`,
`Reactome_Pathways_2024`, `GWAS_Catalog_2025`.

**Enrichr emits bare `Infinity`, which is not valid JSON.** The odds ratio is
infinite whenever every one of a term's background genes is in your gene list —
with a custom background that is *routine*, not rare (36 of 82 terms in a real
run). Consequences by language:

- **JavaScript**: `JSON.parse` throws outright. You must sanitize the text first.
- **Python**: `json.loads` accepts it silently — so you will not notice — and then
  `json.dump` writes `Infinity` straight back out, producing an invalid JSON file
  that breaks whatever reads it next. `allow_nan=False` does not save you; it
  raises instead of converting. Replace non-finite floats with `None` before
  encoding. `scripts/enrichr.py` does this in `finite()`.

**Background correction is a different service, and its 500s are ambiguous.**
Custom backgrounds are not available on `/Enrichr/enrich` at all — you must go
through `speedrichr` (`addList` → `addbackground` → `backgroundenrich`). An HTTP
500 from `backgroundenrich` means one of two very different things:

1. *You used the wrong `userListId`.* The two services keep **separate ID
   namespaces**, and submitting your genes to `/Enrichr/addList` and then passing
   that id to `backgroundenrich` fails with a 500 every time — not a 400, not a
   helpful message. Submit to `speedrichr/addList` instead. (Verified: a classic
   id 500s on all retries where a speedrichr id returns 82 terms. The ranges even
   look different — classic ids are ~1.3e8, speedrichr ~2.0e9.)
2. *The service is having a moment.* It also throws genuinely transient 500s that
   clear on retry, sometimes across a whole library family at once, which can look
   convincingly like "this library doesn't support backgrounds". It does. Retry.

So: check your id namespace first, then retry. Do not fall through to the
uncorrected endpoint without saying so loudly.

**Background correction changes the answer enormously.** It is not a refinement.
For a 16-gene DNA-damage list against `KEGG_2026`, whole-genome gives 50
significant terms with a top adjusted p of 8.5e-19; a 40-gene background gives 14
significant terms with a top adjusted p of 1.6e-4. If the gene list came from a
restricted universe — expressed genes, a targeted panel, detected proteins — the
whole-genome default is simply the wrong test and will overstate significance.
The background must be the universe the list was drawn *from*, not the list itself.

**Enrichr rate-limits (HTTP 429).** You will hit this within a handful of requests
once you start looping — which is exactly what batch work does. Pace the loop and
back off on 429. `scripts/enrichr.py` sleeps between lists and retries 429s.

**`/enrich` and `/export` return every term with any overlap, not just significant
ones.** A 16-gene list against `KEGG_2026` returns 82 terms, of which 50 are
significant. That is a feature when you want to compute your own FDR or plot the
full p-value distribution, and a token disaster if you paste it into context
unfiltered. Filter before showing results to anyone.

## Interpreting results

Each term is a 7-tuple, mapped to names in `scripts/enrichr.py`:

`rank, term, p_value, odds_ratio, combined_score, genes, adj_p_value`

Use **`adj_p_value`** (Benjamini-Hochberg), not `p_value`, for significance;
`< 0.05` is the usual cut. `combined_score` is Enrichr's own ranking heuristic
(`ln(p) × z`) and is fine for ordering but is not a statistic anyone will accept in
a paper. Report the adjusted p-value and the overlap.
