// commit-share-chart.ts — Generates a stacked area chart showing the share of
// GitHub commits by Claude Code vs all other AI agents combined, starting May 2025.

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

interface DailyRow {
  date: string;
  total: number;
  claude: number;
  other: number;
}

interface StackedPoint {
  date: string;
  category: string;
  percentage: number;
}

function loadDailyRows(): DailyRow[] {
  const files = globSync("commit-data/*.csv");
  const rows: DailyRow[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const rowMap = new Map<string, number>();
    let date = "";

    for (const line of content.trim().split("\n").slice(1)) {
      const [d, query, countStr] = line.split(",");
      date = d;
      rowMap.set(query, parseInt(countStr, 10));
    }

    // Filter: only dates from May 2025 onwards
    if (date < "2025-05-01") continue;

    const total = rowMap.get("total");
    if (!total || total === 0) continue;

    const claudeSum = CLAUDE_KEYS.reduce((sum, k) => sum + (rowMap.get(k) ?? 0), 0);
    const otherSum = OTHER_AGENT_KEYS.reduce((sum, k) => sum + (rowMap.get(k) ?? 0), 0);

    rows.push({ date, total, claude: claudeSum, other: otherSum });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

function loadData(): StackedPoint[] {
  const dailyRows = loadDailyRows();
  const WINDOW = 7;
  const points: StackedPoint[] = [];

  for (let i = WINDOW - 1; i < dailyRows.length; i++) {
    const window = dailyRows.slice(i - WINDOW + 1, i + 1);
    const totalSum = window.reduce((s, r) => s + r.total, 0);
    if (totalSum === 0) continue;
    const claudeSum = window.reduce((s, r) => s + r.claude, 0);
    const otherSum = window.reduce((s, r) => s + r.other, 0);
    const date = dailyRows[i].date;

    points.push({ date, category: "Claude Code", percentage: (claudeSum / totalSum) * 100 });
    points.push({
      date,
      category: "Other Agents (without Codex)",
      percentage: (otherSum / totalSum) * 100,
    });
  }

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
    width: 1000,
    height: 420,
    padding: 0,
    background: "#FAFBFF",
    title: {
      text: "AI Agent Commits as Share of All Public GitHub Commits",
      subtitle: "Claude Code vs Other Agents  ·  May 2025 – Present",
      font: "Helvetica Neue, Arial, sans-serif",
      fontSize: 32,
      fontWeight: 700,
      color: "#1E2A3A",
      subtitleFont: "Helvetica Neue, Arial, sans-serif",
      subtitleFontSize: 21,
      subtitleColor: "#8B95A5",
      subtitlePadding: 8,
      anchor: "start",
      offset: 18,
    },
    data: { values: data },
    mark: {
      type: "area",
      interpolate: "monotone",
      line: { strokeWidth: 2.5 },
      opacity: 0.75,
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
          labelFontSize: 19,
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
          titlePadding: 12,
          format: ".1f",
          labelFont: "Helvetica Neue, Arial, sans-serif",
          labelFontSize: 19,
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
          labelFontSize: 21,
          labelFontWeight: 600,
          labelColor: "#3D4663",
          symbolType: "circle",
          symbolSize: 240,
          labelLimit: 600,
          columnPadding: 20,
          offset: 4,
        },
      },
      order: {
        field: "category",
        sort: "descending",
      },
    },
    config: {
      font: "Helvetica Neue, Arial, sans-serif",
      view: { stroke: null },
    },
  } as vegaLite.TopLevelSpec;
}

async function main() {
  const data = loadData();
  if (data.length === 0) {
    console.error("No data found in commit-data/*.csv from May 2025 onwards");
    process.exit(1);
  }

  const uniqueDates = new Set(data.map((d) => d.date));
  console.log(`Loaded ${uniqueDates.size} days of data (May 2025 – present)`);

  const vlSpec = buildSpec(data);
  const vegaSpec = vegaLite.compile(vlSpec).spec;
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none" });
  const svg = await view.toSVG();

  // 1) Render SVG → PNG at high density, then flatten alpha to #FAFBFF
  const DPI = 150;
  const rawBuf = await sharp(Buffer.from(svg), { density: DPI })
    .flatten({ background: "#FAFBFF" })
    .png()
    .toBuffer();

  // 2) Trim all excess whitespace from the edges
  const trimmedBuf = await sharp(rawBuf)
    .trim({ background: "#FAFBFF", threshold: 15 })
    .png()
    .toBuffer();
  const { width: tw, height: th } = await sharp(trimmedBuf).metadata();

  // 3) Add uniform, generous margins + extra bottom space for attribution
  const MARGIN = 40;
  const ATTR_H = 60;
  const finalW = tw! + MARGIN * 2;
  const finalH = th! + MARGIN * 2 + ATTR_H;

  // 4) Create attribution text overlay
  const attrText = "by @jphme / ellamind.com";
  const attrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${finalW}" height="${ATTR_H}">
    <text x="${MARGIN}" y="38" font-family="Helvetica Neue, Arial, sans-serif"
          font-size="28" fill="#A0A8B8">${attrText}</text>
  </svg>`;
  const attrBuf = await sharp(Buffer.from(attrSvg)).png().toBuffer();

  // 5) Compose: trimmed chart centered with margins, attribution at bottom
  const png = await sharp({
    create: { width: finalW, height: finalH, channels: 4, background: "#FAFBFF" },
  })
    .composite([
      { input: trimmedBuf, left: MARGIN, top: MARGIN },
      { input: attrBuf, left: 0, top: th! + MARGIN * 2 - 10 },
    ])
    .png({ quality: 95 })
    .toBuffer();

  writeFileSync("commit-share-chart.png", png);
  console.log(
    `Wrote commit-share-chart.png (${(png.length / 1024).toFixed(0)} KB, ${finalW}x${finalH})`,
  );
}

main();
