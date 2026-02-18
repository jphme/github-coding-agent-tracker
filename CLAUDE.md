# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A data pipeline that tracks daily public GitHub commit volumes for AI coding agents. Two scripts collect data via the GitHub Search API and generate visualizations. Data is stored as flat CSV files committed to the repo.

## Commands

```bash
# Fetch data for a single day (requires GITHUB_TOKEN env var)
GITHUB_TOKEN=ghp_... bun run src/fetch.ts 2026-02-14

# Fetch data for a date range (inclusive)
GITHUB_TOKEN=ghp_... bun run src/fetch.ts 2025-02-17 2026-02-15

# Generate chart.png and update README.md table
bun run src/chart.ts

# Format code
bun run format

# Check formatting (CI)
bun run format:check
```

Uses **Bun** as runtime and package manager. Install deps with `bun install`. No test suite exists.

## Architecture

Three source files form the entire pipeline:

- **`src/agents.ts`** — Agent definitions. Each agent has a `name`, `key` (CSV column), and `query` (GitHub search fragment). Two detection patterns: `author:bot[bot]` for GitHub App agents, or email/domain text matching for `Co-Authored-By` trailers.

- **`src/fetch.ts`** — Data collection. For each date, runs 24 hourly-window GitHub search queries to get accurate total commit counts (workaround for the API's ~1M `total_count` ceiling), then one query per agent. Writes `data/YYYY-MM-DD.csv`. Uses Octokit with throttling plugin for rate limit handling.

- **`src/chart.ts`** — Reads all `data/*.csv` files, computes agent percentages, renders a Vega-Lite area chart to `chart.png` via sharp, and injects a 10-day rolling average markdown table into `README.md` between `<!-- recent-table-start -->` / `<!-- recent-table-end -->` sentinel comments.

## Data Format

Each CSV in `data/` has columns `date,query,count`:

```
date,query,count
2026-02-16,total,8381494
2026-02-16,claude,184536
```

CSVs are queryable with DuckDB: `SELECT * FROM read_csv('data/*.csv')`.

## Formatting

Prettier with: semicolons, double quotes, trailing commas, 100-char width, 2-space indent.
