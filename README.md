# GitHub Coding Agent Monitor

A public, auditable log of AI coding agent commit counts on public GitHub repos over time.
The following chart and table are updated automatically by a GitHub Action running on a daily schedule.

![AI Coding Agent Commits](chart.png)

<!-- recent-table-start -->

Monthly average, as a % of all public commits on GitHub.

| Agent          | Jan 25    | Feb 25    | Mar 25    | Apr 25    | May 25    | Jun 25    | Jul 25    | Aug 25    | Sep 25    | Oct 25    | Nov 25    | Dec 25    | Jan 26    | Feb 26    |
| -------------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| Claude Code    | -         | -         | 0.02%     | 0.01%     | 0.04%     | 0.23%     | 0.39%     | 0.49%     | 0.43%     | 0.72%     | 0.83%     | 1.13%     | 2.08%     | 3.01%     |
| Cursor         | -         | -         | -         | -         | -         | -         | 0.01%     | 0.01%     | 0.01%     | 0.01%     | -         | -         | 0.02%     | 0.42%     |
| GitHub Copilot | -         | -         | -         | -         | 0.01%     | 0.02%     | 0.05%     | 0.09%     | 0.11%     | 0.19%     | 0.26%     | 0.30%     | 0.31%     | 0.35%     |
| Google Jules   | -         | -         | -         | -         | 0.02%     | 0.06%     | 0.03%     | 0.06%     | 0.05%     | 0.04%     | 0.04%     | 0.06%     | 0.08%     | 0.08%     |
| Devin AI       | 0.01%     | 0.01%     | 0.01%     | 0.01%     | 0.01%     | 0.01%     | 0.01%     | 0.01%     | -         | 0.01%     | 0.01%     | 0.01%     | 0.01%     | 0.01%     |
| Aider          | -         | -         | -         | -         | -         | -         | 0.01%     | 0.01%     | 0.01%     | 0.01%     | 0.01%     | -         | -         | -         |
| OpenCode       | -         | -         | -         | -         | -         | 0.01%     | -         | -         | -         | -         | -         | -         | -         | -         |
| Amazon Q       | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         |
| OpenAI Codex   | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         | -         |
| **All Agents** | **0.01%** | **0.01%** | **0.03%** | **0.03%** | **0.08%** | **0.33%** | **0.51%** | **0.67%** | **0.60%** | **0.97%** | **1.15%** | **1.50%** | **2.50%** | **3.87%** |

<!-- recent-table-end -->

## How It Works

A daily GitHub Action uses the [GitHub Search API](https://docs.github.com/en/rest/search/search#search-commits) to count new public commits matching each coding agent's signature. Total public commits are counted in 24x 1-hour windows and summed.

Results are stored as flat CSVs in `data/YYYY-MM-DD.csv` and committed back to this repo, along with an updated chart.

Specific coding agents are detected using the following search queries:

| Agent               | Search Query                          |
| ------------------- | ------------------------------------- |
| Claude Code         | `noreply@anthropic.com`               |
| GitHub Copilot      | `author:copilot-swe-agent[bot]`       |
| Devin AI            | `author:devin-ai-integration[bot]`    |
| Aider               | `aider.chat`                          |
| OpenAI Codex        | `author:chatgpt-codex-connector[bot]` |
| OpenCode            | `noreply@opencode.ai`                 |
| Cursor (Editor)     | `cursoragent@cursor.com`              |
| Cursor (Background) | `author-email:agent@cursor.com`       |
| Google Jules        | `author:google-labs-jules[bot]`       |
| Amazon Q            | `author:amazon-q-developer[bot]`      |

### Caveats

Given the methodology described above, there are some implicit limits to this data:

1. Only public GitHub activity is monitored, private repos are not accessible by these queries.
2. Only commits where a coding agent has left a "signature" can be detected (e.g. `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`).
3. Only commits on default branches are indexed by GitHub's search.

Some coding agents may be more prevalent in private repos vs public repos. Some may not show up much in this data because they don't leave a "signature."
As such, be wary of what you conclude from this data.

In general, the data is meant to highlight broad trends around coding agent adoption overall.

## Query the Data with DuckDB

Since the data lives in this repo in CSV files, you can use [DuckDB](https://duckdb.org/) to query it.

```sql
SELECT * FROM read_csv('data/*.csv');
```

```sql
-- Daily agent percentages
SELECT
  date,
  query AS agent,
  count,
  count * 100.0 / SUM(count) FILTER (WHERE query = 'total') OVER (PARTITION BY date) AS pct
FROM read_csv('data/*.csv')
WHERE query NOT LIKE 'total%'
ORDER BY date, count DESC;
```

## Run Locally

```bash
# Fetch a single day
GITHUB_TOKEN=ghp_... bun run src/fetch.ts 2026-02-14

# Fetch a date range (inclusive)
GITHUB_TOKEN=ghp_... bun run src/fetch.ts 2025-02-17 2026-02-15

# Generate chart from existing data
bun run src/chart.ts
```

## Backfill

At ~30 requests/min (GitHub search API rate limit), each day requires 34 queries (24 hourly windows + 10 agents), so backfilling runs at ~1 day/minute (~6 hours for a full year).

```bash
GITHUB_TOKEN=ghp_... bun run src/fetch.ts 2025-02-17 2026-02-15
```
