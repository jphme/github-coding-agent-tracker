// fetch-prs.ts — Fetches daily PR counts from the GitHub Search API.
//
// For each date, we query:
//   1. Total public PRs created that day (single query — count is <1M so no hourly windowing needed)
//   2. Per-agent PR counts
//
// Results are written to pr-data/YYYY-MM-DD.csv with columns: date, query, count.
//
// Usage:
//   bun run src/fetch-prs.ts 2026-03-20           # single day
//   bun run src/fetch-prs.ts 2026-03-01 2026-03-20  # inclusive date range

import { Octokit } from "octokit";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import { PR_AGENTS } from "./pr-agents.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OctokitWithPlugins = Octokit.plugin(throttling, retry);

const octokit = new OctokitWithPlugins({
  auth: process.env.GITHUB_TOKEN,
  retry: { doNotRetry: [404, 422] },
  throttle: {
    onRateLimit: (retryAfter: number, options: any, octokit: any, retryCount: number) => {
      octokit.log.warn(`Rate limit hit for ${options.method} ${options.url}`);
      if (retryCount < 3) {
        octokit.log.info(`Retrying after ${retryAfter}s...`);
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter: number, options: any, octokit: any, retryCount: number) => {
      octokit.log.warn(`Secondary rate limit hit for ${options.method} ${options.url}`);
      if (retryCount < 3) {
        return true;
      }
    },
  },
});

// Execute a PR search and return the total_count.
async function searchPRCount(query: string): Promise<number> {
  const resp = await octokit.rest.search.issuesAndPullRequests({ q: query, per_page: 1 });
  return resp.data.total_count;
}

async function fetchDay(date: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  // Total public PRs created on this date.
  // Unlike commits (~8M/day), PRs are ~400-500K/day — well under the API's
  // ~1M accuracy ceiling, so a single query is sufficient.
  const total = await searchPRCount(`is:pr created:${date}`);
  counts.set("total", total);

  // Fetch PR count for each agent's search query.
  for (const agent of PR_AGENTS) {
    const q = `is:pr ${agent.query} created:${date}`;
    const count = await searchPRCount(q);
    counts.set(agent.key, count);
  }

  return counts;
}

function writeCSV(date: string, counts: Map<string, number>): void {
  mkdirSync("pr-data", { recursive: true });

  const rows = ["date,query,count"];
  rows.push(`${date},total,${counts.get("total")}`);
  for (const agent of PR_AGENTS) {
    rows.push(`${date},${agent.key},${counts.get(agent.key)}`);
  }

  writeFileSync(join("pr-data", `${date}.csv`), rows.join("\n") + "\n");
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function printSummary(date: string, counts: Map<string, number>): void {
  const total = counts.get("total")!;
  const parts = [`${date}: total=${formatNumber(total)}`];
  for (const agent of PR_AGENTS) {
    const c = counts.get(agent.key)!;
    const pct = ((c / total) * 100).toFixed(2);
    parts.push(`${agent.key}=${formatNumber(c)} (${pct}%)`);
  }
  console.log(parts.join("  "));
}

function parseDateRange(args: string[]): string[] {
  if (args.length === 0) {
    console.error("Usage: bun run src/fetch-prs.ts YYYY-MM-DD [YYYY-MM-DD]");
    process.exit(1);
  }

  const start = args[0];
  const end = args.length > 1 ? args[1] : start;

  const dates: string[] = [];
  const current = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");

  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

async function main() {
  if (!process.env.GITHUB_TOKEN) {
    console.warn(
      "Warning: GITHUB_TOKEN not set — using unauthenticated requests (lower rate limits)",
    );
  }

  const dates = parseDateRange(process.argv.slice(2));
  console.log(
    `Fetching PR data for ${dates.length} day(s): ${dates[0]} to ${dates[dates.length - 1]}`,
  );

  // Each day requires 1 (total) + N (agents) search API calls.
  // With 7 agents, that's 8 queries/day — much lighter than commits.
  for (const date of dates) {
    const counts = await fetchDay(date);
    writeCSV(date, counts);
    printSummary(date, counts);
  }
}

main();
