// commit-share-chart.ts — Generates a stacked area chart showing the share of
// GitHub commits by Claude Code vs all other AI agents combined, starting Oct 2025.

import { globSync } from "fs";
import { readFileSync, writeFileSync } from "fs";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import sharp from "sharp";

const CLAUDE_KEYS = ["claude"];
const OTHER_AGENT_KEYS = [
  "copilot",
  "devin",
  "aider",
  "codex",
  "opencode",
  "cursor_editor",
  "cursor_bg",
  "jules",
  "amazonq",
  "amp",
  "windsurf",
  "junie",
];

interface StackedPoint {
  date: string;
  category: string;
  percentage: number;
}

function loadData(): StackedPoint[] {
  const files = globSync("data/*.csv");
  const points: StackedPoint[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const rows = new Map<string, number>();
    let date = "";

    for (const line of content.trim().split("\n").slice(1)) {
      const [d, query, countStr] = line.split(",");
      date = d;
      rows.set(query, parseInt(countStr, 10));
    }

    // Filter: only dates from October 2025 onwards
    if (date < "2025-10-01") continue;

    const total = rows.get("total");
    if (!total || total === 0) continue;

    const claudeSum = CLAUDE_KEYS.reduce((sum, k) => sum + (rows.get(k) ?? 0), 0);
    const otherSum = OTHER_AGENT_KEYS.reduce((sum, k) => sum + (rows.get(k) ?? 0), 0);

    points.push({ date, category: "Claude Code", percentage: (claudeSum / total) * 100 });
    points.push({
      date,
      category: "Other Agents (without Codex)",
      percentage: (otherSum / total) * 100,
    });
  }

  points.sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
  return points;
}

function buildSpec(data: StackedPoint[]): vegaLite.TopLevelSpec {
  // Elluminate-inspired palette: deep violet for Claude, soft teal for Others
  const colorScale = {
    domain: ["Claude Code", "Other Agents (without Codex)"],
    range: ["#6C5CE7", "#00CEC9"],
  };

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 800,
    height: 380,
    padding: { top: 80, right: 15, bottom: 60, left: 50 },
    autosize: "none",
    background: "#FAFBFF",
    layer: [
      // Stacked area
      {
        data: { values: data },
        mark: {
          type: "area",
          interpolate: "monotone",
          line: { strokeWidth: 2 },
          opacity: 0.7,
        },
        encoding: {
          x: {
            field: "date",
            type: "temporal",
            axis: {
              title: null,
              format: "%b %Y",
              labelAngle: 0,
              tickCount: "month",
              labelFont: "Helvetica Neue, Arial, sans-serif",
              labelFontSize: 18,
              labelColor: "#8B95A5",
              gridColor: "#EEF0F6",
              gridDash: [4, 4],
              domainColor: "#DEE2EC",
              tickColor: "#DEE2EC",
            },
          },
          y: {
            field: "percentage",
            type: "quantitative",
            stack: "zero",
            axis: {
              title: "Share of All Public Commits (%)",
              titleFont: "Helvetica Neue, Arial, sans-serif",
              titleFontSize: 20,
              titleFontWeight: 600,
              titleColor: "#5A6577",
              titlePadding: 16,
              format: ".1f",
              labelFont: "Helvetica Neue, Arial, sans-serif",
              labelFontSize: 18,
              labelColor: "#8B95A5",
              gridColor: "#EEF0F6",
              gridDash: [4, 4],
              domainColor: "#DEE2EC",
              tickColor: "#DEE2EC",
            },
          },
          color: {
            field: "category",
            type: "nominal",
            scale: colorScale,
            legend: {
              title: null,
              orient: "top",
              direction: "horizontal",
              labelFont: "Helvetica Neue, Arial, sans-serif",
              labelFontSize: 20,
              labelFontWeight: 600,
              labelColor: "#3D4663",
              symbolType: "circle",
              symbolSize: 200,
              labelLimit: 600,
              columnPadding: 24,
              offset: -8,
            },
          },
          order: {
            field: "category",
            sort: "descending",
          },
        },
      },
      // Title as text mark for precise positioning
      {
        data: { values: [{}] },
        mark: {
          type: "text",
          text: "AI Agent Commits as Share of All Public GitHub Commits",
          fontSize: 30,
          fontWeight: 700,
          font: "Helvetica Neue, Arial, sans-serif",
          color: "#1E2A3A",
          align: "left",
        },
        encoding: {
          x: { datum: 0, type: "quantitative", scale: null },
          y: { datum: -62, type: "quantitative", scale: null },
        },
      },
      // Subtitle
      {
        data: { values: [{}] },
        mark: {
          type: "text",
          text: "Claude Code vs Other Agents  ·  October 2025 – Present",
          fontSize: 19,
          fontWeight: 400,
          font: "Helvetica Neue, Arial, sans-serif",
          color: "#8B95A5",
          align: "left",
        },
        encoding: {
          x: { datum: 0, type: "quantitative", scale: null },
          y: { datum: -32, type: "quantitative", scale: null },
        },
      },
      // Source attribution
      {
        data: { values: [{}] },
        mark: {
          type: "text",
          text: "by @jphme / ellamind.com — based on powerset-co/github-coding-agent-tracker",
          fontSize: 16,
          fontWeight: 400,
          font: "Helvetica Neue, Arial, sans-serif",
          color: "#A0A8B8",
          align: "left",
        },
        encoding: {
          x: { datum: 0, type: "quantitative", scale: null },
          y: { datum: { expr: "height + 55" }, type: "quantitative", scale: null },
        },
      },
      // Watermark
      {
        data: { values: [{}] },
        mark: {
          type: "text",
          text: "research.powerset.co",
          fontSize: 22,
          opacity: 0.06,
          angle: -25,
          font: "Helvetica Neue, Arial, sans-serif",
          fontWeight: 300,
          color: "#3D4663",
        },
        encoding: {
          x: { datum: { expr: "width / 2" }, type: "quantitative", scale: null },
          y: { datum: { expr: "height / 2" }, type: "quantitative", scale: null },
        },
      },
    ],
    config: {
      font: "Helvetica Neue, Arial, sans-serif",
      view: { stroke: null },
    },
  } as vegaLite.TopLevelSpec;
}

async function main() {
  const data = loadData();
  if (data.length === 0) {
    console.error("No data found in data/*.csv from Oct 2025 onwards");
    process.exit(1);
  }

  const uniqueDates = new Set(data.map((d) => d.date));
  console.log(`Loaded ${uniqueDates.size} days of data (Oct 2025 – present)`);

  const vlSpec = buildSpec(data);
  const vegaSpec = vegaLite.compile(vlSpec).spec;
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none" });
  const svg = await view.toSVG();

  // density: 150 for crisp output at ~1700px wide — good for social/mobile
  const png = await sharp(Buffer.from(svg), { density: 150 }).png({ quality: 95 }).toBuffer();
  writeFileSync("commit-share-chart.png", png);
  console.log(`Wrote commit-share-chart.png (${(png.length / 1024).toFixed(0)} KB)`);
}

main();
