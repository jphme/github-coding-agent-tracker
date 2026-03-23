# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A data pipeline that tracks daily public GitHub commit volumes for AI coding agents. Scripts collect data via the GitHub Search API and generate visualizations. Data is stored as flat CSV files committed to the repo.

## Commands

```bash
# Fetch data for a single day (requires GITHUB_TOKEN env var)
GITHUB_TOKEN=ghp_... bun run src/fetch-commits.ts 2026-02-14

# Fetch data for a date range (inclusive)
GITHUB_TOKEN=ghp_... bun run src/fetch-commits.ts 2025-02-17 2026-02-15

# Apply outlier correction (copies commit-data-raw/ -> commit-data/ with fixes)
uv run python3 src/fix_commit_totals.py --apply

# Generate chart.png and update README.md table
bun run src/chart.ts

# Generate commit-share-chart.png (Claude vs Others stacked area chart)
bun run src/commit-share-chart.ts

# Generate claude-dual-chart.png (Claude commit share vs PR share)
bun run src/claude-dual-chart.ts

# Generate weekly-summary.csv
uv run python3 src/generate_weekly_summary.py

# Generate total-activity-chart.png (weekly commits + PRs)
bun run src/total-activity-chart.ts

# Fetch PR data for a single day
GITHUB_TOKEN=ghp_... bun run src/fetch-prs.ts 2026-03-20

# Fetch PR data for a date range (inclusive)
GITHUB_TOKEN=ghp_... bun run src/fetch-prs.ts 2026-03-01 2026-03-20

# Generate pr-share-chart.png (Claude vs Codex vs Others stacked area chart)
bun run src/pr-share-chart.ts

# Format code
bun run format

# Check formatting (CI)
bun run format:check
```

Uses **Bun** as runtime and package manager. Install deps with `bun install`. No test suite exists.

## Architecture

Two parallel pipelines track commits and PRs:

- **`src/commit-agents.ts`** — Agent definitions. Each agent has a `name`, `key` (CSV column), and `query` (GitHub search fragment). Two detection patterns: `author:bot[bot]` for GitHub App agents, or email/domain text matching for `Co-Authored-By` trailers.

- **`src/fetch-commits.ts`** — Data collection. For each date, runs 24 hourly-window GitHub search queries to get accurate total commit counts (workaround for the API's ~1M `total_count` ceiling), then one query per agent. Writes `commit-data-raw/YYYY-MM-DD.csv`. Uses Octokit with throttling and retry plugins for rate limit handling and transient error recovery.

- **`src/fix_commit_totals.py`** — Outlier correction. Reads raw data from `commit-data-raw/`, detects inflated totals using a trend model, and writes the complete corrected dataset to `commit-data/`. Raw data is never modified.

- **`src/chart.ts`** — Reads all `commit-data/*.csv` files, computes agent percentages, renders a Vega-Lite area chart to `chart.png` via sharp, and injects a 10-day rolling average markdown table into `README.md` between `<!-- recent-table-start -->` / `<!-- recent-table-end -->` sentinel comments.

- **`src/commit-share-chart.ts`** — Generates `commit-share-chart.png`, a stacked area chart showing Claude Code vs Other Agents as a percentage of all public GitHub commits. Uses Vega-Lite with sharp for rendering and post-processing (trim + controlled margins).

- **`src/claude-dual-chart.ts`** — Generates `claude-dual-chart.png`, a dual-line chart comparing Claude Code's commit share vs PR share over time.

- **`src/generate_weekly_summary.py`** — Aggregates daily commit and PR data into `weekly-summary.csv` with weekly totals and percentages.

- **`src/total-activity-chart.ts`** — Generates `total-activity-chart.png`, a dual-line chart showing total weekly commits and PRs on GitHub. Reads from `weekly-summary.csv`.

- **`src/pr-agents.ts`** — PR agent definitions. Each agent has a `name`, `key`, and `query` (GitHub PR search fragment). Detection uses `author:bot[bot]` for GitHub App agents or `head:prefix/` for branch-name matching.

- **`src/fetch-prs.ts`** — PR data collection. For each date, queries total public PRs and per-agent PR counts. Writes `pr-data/YYYY-MM-DD.csv`.

- **`src/pr-share-chart.ts`** — Generates `pr-share-chart.png`, a stacked area chart showing Claude Code vs OpenAI Codex vs Other Agents as a percentage of all public GitHub PRs.

## Data Format

Two data directories for commits:
- `commit-data-raw/` — Raw API data, unchanged from fetch
- `commit-data/` — Cleaned/corrected data used by charts (output of `fix_commit_totals.py`)

Each CSV has columns `date,query,count`:

```
date,query,count
2026-02-16,total,8381494
2026-02-16,claude,184536
```

CSVs are queryable with DuckDB: `SELECT * FROM read_csv('commit-data/*.csv')`.

## Formatting

Prettier with: semicolons, double quotes, trailing commas, 100-char width, 2-space indent.
