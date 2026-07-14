#!/usr/bin/env python3
"""
Minimal Enrichr client for the things the enrichr_analysis MCP tool does not do:
reverse gene lookup, whole-library download, unfiltered result tables, and batch
enrichment over many gene lists.

Every function here is a thin wrapper over a real endpoint. The value is in the
traps it handles — see the module docstring in SKILL.md, but briefly:

  * A retired library returns {} from /enrich, not an error. We raise instead of
    silently reporting zero enriched terms.
  * Background-corrected enrichment lives on a different service (speedrichr) and
    returns sporadic 500s that clear on retry. We retry rather than quietly
    handing back uncorrected whole-genome p-values, which are far more significant.
  * Enrichr emits bare `Infinity` for the odds ratio. Python's json accepts it on
    the way IN (so this is easy to miss), but json.dump will happily write it back
    out as invalid JSON. Use dump_json() here, not json.dump, for anything another
    tool has to read.

Usage as a CLI:
    python enrichr.py libraries                       # list live libraries
    python enrichr.py genemap TP53                    # which gene sets contain TP53
    python enrichr.py download KEGG_2026 out.gmt      # whole library as GMT
    python enrichr.py enrich genes.txt KEGG_2026      # unfiltered result table
    python enrichr.py enrich genes.txt KEGG_2026 --background bg.txt
"""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request

ENRICHR = "https://maayanlab.cloud/Enrichr"
SPEEDRICHR = "https://maayanlab.cloud/speedrichr/api"

TIMEOUT = 60
RETRIES = 4
RETRY_BACKOFF = 0.75      # seconds, multiplied by attempt number
RATE_LIMIT_PAUSE = 3.0    # seconds to wait out an HTTP 429
BATCH_DELAY = 0.5         # seconds between gene lists, to stay under the rate limit


def _request(url, data=None, files=None, retries=RETRIES):
    """HTTP with retry on 5xx and 429. Raises on persistent failure — never
    returns junk.

    Enrichr rate-limits (HTTP 429), and you will hit it as soon as you loop over
    more than a handful of gene lists — which is the main reason to be using this
    script at all. 429 is retried with a longer backoff than a 5xx.
    """
    last = None
    for attempt in range(retries):
        if attempt:
            time.sleep(RETRY_BACKOFF * attempt)
        try:
            if files:
                body, headers = _multipart(files)
                req = urllib.request.Request(url, data=body, headers=headers)
            elif data:
                req = urllib.request.Request(
                    url, data=urllib.parse.urlencode(data).encode()
                )
            else:
                req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read().decode()
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code == 429:  # rate limited — back off hard and try again
                time.sleep(RATE_LIMIT_PAUSE * (attempt + 1))
                continue
            if e.code < 500:  # our fault; retrying will not help
                raise RuntimeError(f"{url} -> {last}") from e
        except Exception as e:  # noqa: BLE001 - surface anything else immediately
            last = str(e)
    raise RuntimeError(f"{url} failed after {retries} attempts: {last}")


def _multipart(fields):
    """Enrichr's addList/addbackground want multipart/form-data."""
    boundary = "----enrichr-skill-boundary"
    parts = []
    for name, value in fields.items():
        parts.append(f"--{boundary}")
        parts.append(f'Content-Disposition: form-data; name="{name}"')
        parts.append("")
        parts.append(value)
    parts.append(f"--{boundary}--")
    parts.append("")
    body = "\r\n".join(parts).encode()
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    return body, headers


def finite(obj):
    """Replace Infinity/NaN with None, recursively.

    Enrichr returns an infinite odds ratio whenever a term's every background gene
    is in the gene list — routine with a custom background. Python parses that
    happily, then `json.dump` writes it back out as a bare `Infinity` literal,
    which is NOT valid JSON and will break whatever reads the file next. Setting
    allow_nan=False does not save you either: it raises instead of converting.
    So the values have to be replaced before they reach the encoder.
    """
    if isinstance(obj, float):
        return obj if obj == obj and obj not in (float("inf"), float("-inf")) else None
    if isinstance(obj, dict):
        return {k: finite(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [finite(v) for v in obj]
    return obj


def dump_json(obj, fp):
    """json.dump that cannot emit the invalid JSON Enrichr tempts you into."""
    json.dump(finite(obj), fp, allow_nan=False, indent=2)


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


def libraries():
    """Every library Enrichr currently serves. The only source of truth — a
    library missing from here is retired and will silently return {}."""
    stats = json.loads(_request(f"{ENRICHR}/datasetStatistics"))["statistics"]
    return {s["libraryName"]: s.get("numTerms", 0) for s in stats}


def download_library(name, path):
    """Download a whole library as GMT (term<TAB><TAB>gene<TAB>gene...).

    Use this to build a background from a library's own gene universe, to check
    which terms contain a gene, or to run enrichment offline.
    """
    url = f"{ENRICHR}/geneSetLibrary?mode=text&libraryName={urllib.parse.quote(name)}"
    text = _request(url)
    if not text.strip():
        raise RuntimeError(f"library '{name}' returned nothing — is it retired?")
    with open(path, "w") as fh:
        fh.write(text)
    return sum(1 for line in text.splitlines() if line.strip())


def genemap(gene):
    """Reverse lookup: every library and term that contains this gene.

    The MCP server cannot do this — it only goes gene-list -> enriched terms.
    Useful for 'what is this gene annotated with?' and for sanity-checking that a
    gene symbol is one Enrichr actually recognizes.
    """
    url = f"{ENRICHR}/genemap?gene={urllib.parse.quote(gene)}&json=true"
    data = json.loads(_request(url))
    return data.get("gene", {})


# ---------------------------------------------------------------------------
# Enrichment
# ---------------------------------------------------------------------------


def add_list(genes, description="skill", base=ENRICHR):
    """Submit a gene list. Returns (userListId, shortId).

    shortId is a shareable web link:
        https://maayanlab.cloud/Enrichr/enrich?dataset=<shortId>
    """
    resp = json.loads(
        _request(
            f"{base}/addList",
            files={"list": "\n".join(genes), "description": description},
        )
    )
    return resp["userListId"], resp.get("shortId")


def add_background(genes):
    if len(genes) < 20:
        raise ValueError(
            f"background has {len(genes)} genes; too small to be meaningful. "
            "Pass the universe the gene list was drawn from (e.g. all expressed genes)."
        )
    resp = json.loads(
        _request(f"{SPEEDRICHR}/addbackground", files={"background": "\n".join(genes)})
    )
    return resp["backgroundid"]


COLUMNS = [
    "rank",
    "term",
    "p_value",
    "odds_ratio",
    "combined_score",
    "genes",
    "adj_p_value",
]


def enrich(genes, library, background=None, description="skill"):
    """Enrichment for one library. Returns ALL terms, unfiltered.

    The MCP tool filters to adjusted p < 0.05; this does not, so you can compute
    your own FDR, plot the full p-value distribution, or keep marginal hits.

    With `background`, p-values are computed against your gene universe rather
    than the whole genome. That is the statistically correct test when the list
    came from a restricted universe, and it changes results by orders of
    magnitude. If the background service fails after retries this RAISES rather
    than silently falling back to whole-genome p-values.
    """
    if background:
        list_id, _ = add_list(genes, description, base=SPEEDRICHR)
        bg_id = add_background(background)
        raw = _request(
            f"{SPEEDRICHR}/backgroundenrich",
            data={
                "userListId": list_id,
                "backgroundid": bg_id,
                "backgroundType": library,
            },
        )
    else:
        list_id, _ = add_list(genes, description)
        query = urllib.parse.urlencode(
            {"userListId": list_id, "backgroundType": library}
        )
        raw = _request(f"{ENRICHR}/enrich?{query}")

    # Python's json accepts the bare `Infinity` Enrichr emits for an infinite odds
    # ratio. (JavaScript's JSON.parse does not — worth knowing if you port this.)
    data = json.loads(raw)

    if library not in data:
        raise RuntimeError(
            f"library '{library}' returned no result. It is probably retired or "
            f"misspelled — check `python enrichr.py libraries`."
        )

    return [dict(zip(COLUMNS, row)) for row in data[library]]


def enrich_batch(gene_lists, library, background=None):
    """Enrichment for many named gene lists — e.g. one per single-cell cluster.

    This is the main reason to drop to the raw API: the MCP tool handles one gene
    list per call, which is awkward for 30 clusters.

    gene_lists: {"cluster_0": [...], "cluster_1": [...]}
    Returns {name: [term, ...]}, and reports failures per list without aborting
    the rest of the run.
    """
    out = {}
    for i, (name, genes) in enumerate(gene_lists.items()):
        if i:
            time.sleep(BATCH_DELAY)  # Enrichr rate-limits; pace the loop
        try:
            out[name] = enrich(genes, library, background, description=name)
            print(f"  {name}: {len(out[name])} terms", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 - report, then keep going
            print(f"  {name}: FAILED — {e}", file=sys.stderr)
            out[name] = None
    return out


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _read_genes(path):
    with open(path) as fh:
        return [g.strip() for g in fh if g.strip()]


def main():
    ap = argparse.ArgumentParser(description="Raw Enrichr API access")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("libraries", help="list every live library")

    g = sub.add_parser("genemap", help="which gene sets contain a gene")
    g.add_argument("gene")

    d = sub.add_parser("download", help="download a library as GMT")
    d.add_argument("library")
    d.add_argument("out")

    e = sub.add_parser("enrich", help="unfiltered enrichment table")
    e.add_argument("genes", help="file with one gene symbol per line")
    e.add_argument("library")
    e.add_argument("--background", help="file with the background gene universe")

    args = ap.parse_args()

    if args.cmd == "libraries":
        libs = libraries()
        for name, n in sorted(libs.items()):
            print(f"{n:>7}  {name}")
        print(f"\n{len(libs)} libraries", file=sys.stderr)

    elif args.cmd == "genemap":
        hits = genemap(args.gene)
        if not hits:
            print(f"No gene sets contain '{args.gene}'. Check the symbol.", file=sys.stderr)
            sys.exit(1)
        for lib, terms in sorted(hits.items(), key=lambda kv: -len(kv[1]))[:20]:
            print(f"{len(terms):>4} terms  {lib}")
        print(f"\n{args.gene} appears in {len(hits)} libraries", file=sys.stderr)

    elif args.cmd == "download":
        n = download_library(args.library, args.out)
        print(f"wrote {n} terms to {args.out}", file=sys.stderr)

    elif args.cmd == "enrich":
        genes = _read_genes(args.genes)
        bg = _read_genes(args.background) if args.background else None
        terms = enrich(genes, args.library, bg)
        corrected = "background-corrected" if bg else "whole-genome (uncorrected)"
        print(f"# {args.library}: {len(terms)} terms, {corrected}", file=sys.stderr)
        dump_json(terms, sys.stdout)
        print()


if __name__ == "__main__":
    main()
