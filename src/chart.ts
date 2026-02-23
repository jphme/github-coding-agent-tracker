// chart.ts — Generates an area chart (chart.png) showing the combined percentage
// of public GitHub commits made by any AI coding agent over time.
//
// Reads all CSV files from data/*.csv, sums every agent's commits per day, and
// renders a Vega-Lite area chart via sharp (SVG -> PNG).

import { globSync } from "fs";
import { readFileSync, writeFileSync } from "fs";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import sharp from "sharp";

interface DataPoint {
  date: string;
  percentage: number;
  totalCommits: number;
}

// Maps display names to CSV keys. Cursor combines editor + background agents.
const CHART_AGENTS: { name: string; keys: string[] }[] = [
  { name: "Claude Code", keys: ["claude"] },
  { name: "GitHub Copilot", keys: ["copilot"] },
  { name: "Cursor", keys: ["cursor_editor", "cursor_bg"] },
  { name: "Devin AI", keys: ["devin"] },
  { name: "Google Jules", keys: ["jules"] },
  { name: "Aider", keys: ["aider"] },
  { name: "OpenAI Codex", keys: ["codex"] },
  { name: "OpenCode", keys: ["opencode"] },
  { name: "Amazon Q", keys: ["amazonq"] },
];

// Load all daily CSV files and compute the combined agent percentage per day.
// CSV format: date,query,count — the date is read from the row, not the filename.
function loadData(): DataPoint[] {
  const files = globSync("data/*.csv");
  const points: DataPoint[] = [];
  const agentKeys = CHART_AGENTS.flatMap((a) => a.keys);

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const rows = new Map<string, number>();
    let date = "";

    for (const line of content.trim().split("\n").slice(1)) {
      const [d, query, countStr] = line.split(",");
      date = d;
      rows.set(query, parseInt(countStr, 10));
    }

    const total = rows.get("total");
    if (!total || total === 0) continue;

    const agentSum = agentKeys.reduce((sum, k) => sum + (rows.get(k) ?? 0), 0);
    points.push({ date, percentage: (agentSum / total) * 100, totalCommits: total });
  }

  // Sort chronologically so the chart x-axis is in order
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

// Build a Vega-Lite spec for a single area chart: x=date, y=combined agent %.
function buildSpec(data: DataPoint[]): vegaLite.TopLevelSpec {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "AI Coding Agent Commits on GitHub (% of public commits)",
    width: 1100,
    height: 450,
    padding: 20,
    background: "white",
    layer: [
      {
        data: { values: data },
        mark: { type: "area", line: true, opacity: 0.3, color: "#4c78a8" },
        encoding: {
          x: {
            field: "date",
            type: "temporal",
            axis: { title: null, format: "%b %Y", labelAngle: -45, tickCount: "month" },
          },
          y: {
            field: "percentage",
            type: "quantitative",
            axis: { title: "% of public commits", format: ".2f" },
          },
        },
      },
      {
        data: { values: [{}] },
        mark: {
          type: "text",
          text: "research.powerset.co",
          fontSize: 28,
          opacity: 0.08,
          angle: -25,
          font: "Helvetica Neue, Arial, sans-serif",
        },
        encoding: {
          x: { datum: { expr: "width / 2" }, type: "quantitative", scale: null },
          y: { datum: { expr: "height / 2" }, type: "quantitative", scale: null },
        },
      },
    ],
    config: {
      font: "Helvetica Neue, Arial, sans-serif",
      title: { fontSize: 16, anchor: "start" as const },
      axis: { labelFontSize: 11, titleFontSize: 12 },
    },
  } as vegaLite.TopLevelSpec;
}

// Build a markdown table showing each agent's monthly average % of all public
// commits across the full data history, inject into README.md.
function generateTable() {
  const files = globSync("data/*.csv");
  // agent -> date -> pct
  const perAgent = new Map<string, Map<string, number>>();
  // date -> combined agent pct
  const combinedByDate = new Map<string, number>();
  const allDates = new Set<string>();

  const agentKeys = CHART_AGENTS.flatMap((a) => a.keys);

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const rows = new Map<string, number>();
    let date = "";
    for (const line of content.trim().split("\n").slice(1)) {
      const [d, query, countStr] = line.split(",");
      date = d;
      rows.set(query, parseInt(countStr, 10));
    }
    const total = rows.get("total");
    if (!total || total === 0) continue;
    allDates.add(date);

    const agentSum = agentKeys.reduce((sum, k) => sum + (rows.get(k) ?? 0), 0);
    combinedByDate.set(date, (agentSum / total) * 100);

    for (const agent of CHART_AGENTS) {
      const count = agent.keys.reduce((sum, k) => sum + (rows.get(k) ?? 0), 0);
      let byDate = perAgent.get(agent.name);
      if (!byDate) {
        byDate = new Map();
        perAgent.set(agent.name, byDate);
      }
      byDate.set(date, (count / total) * 100);
    }
  }

  // Group dates by month (YYYY-MM)
  const sortedDates = [...allDates].sort();
  const months = [...new Set(sortedDates.map((d) => d.slice(0, 7)))].sort();

  // Sort agents by their most recent month's average (descending)
  const lastMonth = months[months.length - 1];
  const lastMonthDates = sortedDates.filter((d) => d.startsWith(lastMonth));
  const sortedAgents = [...perAgent.entries()]
    .map(([agent, byDate]) => {
      const avg =
        lastMonthDates.reduce((sum, d) => sum + (byDate.get(d) ?? 0), 0) / lastMonthDates.length;
      return { agent, byDate, lastAvg: avg };
    })
    .sort((a, b) => b.lastAvg - a.lastAvg);

  // Build the table: rows = agents + combined, columns = months
  const monthLabels = months.map((m) => {
    const [y, mo] = m.split("-");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${monthNames[parseInt(mo, 10) - 1]} ${y.slice(2)}`;
  });

  const header = `| Agent | ${monthLabels.join(" | ")} |`;
  const separator = `|-------|${months.map(() => "---").join("|")}|`;

  const agentRows = sortedAgents.map(({ agent, byDate }) => {
    const cells = months.map((m) => {
      const mDates = sortedDates.filter((d) => d.startsWith(m));
      const avg = mDates.reduce((sum, d) => sum + (byDate.get(d) ?? 0), 0) / mDates.length;
      return avg < 0.005 ? "-" : `${avg.toFixed(2)}%`;
    });
    return `| ${agent} | ${cells.join(" | ")} |`;
  });

  // Combined row
  const combinedCells = months.map((m) => {
    const mDates = sortedDates.filter((d) => d.startsWith(m));
    const avg = mDates.reduce((sum, d) => sum + (combinedByDate.get(d) ?? 0), 0) / mDates.length;
    return `**${avg.toFixed(2)}%**`;
  });
  const combinedRow = `| **All Agents** | ${combinedCells.join(" | ")} |`;

  const caption = `Monthly average, as a % of all public commits on GitHub.`;
  const table = [caption, "", header, separator, ...agentRows, combinedRow].join("\n");

  const readme = readFileSync("README.md", "utf-8");
  const updated = readme.replace(
    /<!-- recent-table-start -->[\s\S]*?<!-- recent-table-end -->/,
    `<!-- recent-table-start -->\n${table}\n<!-- recent-table-end -->`,
  );
  writeFileSync("README.md", updated);
  console.log(
    `Updated README.md with full history table (${months.length} months, ${sortedAgents.length} agents)`,
  );
}

async function main() {
  const data = loadData();
  if (data.length === 0) {
    console.error("No data found in data/*.csv");
    process.exit(1);
  }

  console.log(`Loaded ${data.length} days of data`);

  // Compile Vega-Lite -> Vega, render to SVG, then convert to PNG via sharp
  const vlSpec = buildSpec(data);
  const vegaSpec = vegaLite.compile(vlSpec).spec;
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none" });
  const svg = await view.toSVG();

  const png = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
  writeFileSync("chart.png", png);
  console.log(`Wrote chart.png (${(png.length / 1024).toFixed(0)} KB)`);

  generateTable();
}

main();
