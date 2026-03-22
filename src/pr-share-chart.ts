// pr-share-chart.ts — Generates a stacked area chart showing the share of
// GitHub PRs created by AI coding agents, starting from available data.

import { globSync } from "fs";
import { readFileSync, writeFileSync } from "fs";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import sharp from "sharp";

const CLAUDE_KEY = "claude";
const CODEX_KEY = "codex";
const OTHER_AGENT_KEYS = ["copilot", "cursor", "devin", "jules", "amazonq", "opencode"];

interface StackedPoint {
  date: string;
  category: string;
  percentage: number;
}

function loadData(): StackedPoint[] {
  const files = globSync("pr-data/*.csv");
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

    const total = rows.get("total");
    if (!total || total === 0) continue;

    const claudeCount = rows.get(CLAUDE_KEY) ?? 0;
    const codexCount = rows.get(CODEX_KEY) ?? 0;
    const otherSum = OTHER_AGENT_KEYS.reduce((sum, k) => sum + (rows.get(k) ?? 0), 0);

    points.push({ date, category: "Claude Code", percentage: (claudeCount / total) * 100 });
    points.push({ date, category: "OpenAI Codex", percentage: (codexCount / total) * 100 });
    points.push({
      date,
      category: "Other Agents",
      percentage: (otherSum / total) * 100,
    });
  }

  points.sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
  return points;
}

function buildSpec(data: StackedPoint[]): vegaLite.TopLevelSpec {
  const colorScale = {
    domain: ["Claude Code", "OpenAI Codex", "Other Agents"],
    range: ["#6C5CE7", "#10B981", "#00CEC9"],
  };

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 1000,
    height: 420,
    padding: 0,
    background: "#FAFBFF",
    title: {
      text: "AI Agent PRs as Share of All Public GitHub Pull Requests",
      subtitle: "Claude Code vs OpenAI Codex vs Other Agents  ·  January 2025 – Present",
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
          tickCount: "month",
          labelAngle: 0,
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
          title: "Share of All Public PRs (%)",
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
    console.error("No data found in pr-data/*.csv");
    process.exit(1);
  }

  const uniqueDates = new Set(data.map((d) => d.date));
  console.log(`Loaded ${uniqueDates.size} days of PR data`);

  const vlSpec = buildSpec(data);
  const vegaSpec = vegaLite.compile(vlSpec).spec;
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none" });
  const svg = await view.toSVG();

  // Render SVG → PNG, trim whitespace, add controlled margins
  const DPI = 150;
  const rawBuf = await sharp(Buffer.from(svg), { density: DPI })
    .flatten({ background: "#FAFBFF" })
    .png()
    .toBuffer();

  const trimmedBuf = await sharp(rawBuf)
    .trim({ background: "#FAFBFF", threshold: 15 })
    .png()
    .toBuffer();
  const { width: tw, height: th } = await sharp(trimmedBuf).metadata();

  const MARGIN = 40;
  const ATTR_H = 60;
  const finalW = tw! + MARGIN * 2;
  const finalH = th! + MARGIN * 2 + ATTR_H;

  const attrText = "by @jphme / ellamind.com — based on powerset-co/github-coding-agent-tracker";
  const attrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${finalW}" height="${ATTR_H}">
    <text x="${MARGIN}" y="38" font-family="Helvetica Neue, Arial, sans-serif"
          font-size="28" fill="#A0A8B8">${attrText}</text>
  </svg>`;
  const attrBuf = await sharp(Buffer.from(attrSvg)).png().toBuffer();

  const png = await sharp({
    create: { width: finalW, height: finalH, channels: 4, background: "#FAFBFF" },
  })
    .composite([
      { input: trimmedBuf, left: MARGIN, top: MARGIN },
      { input: attrBuf, left: 0, top: th! + MARGIN * 2 - 10 },
    ])
    .png({ quality: 95 })
    .toBuffer();

  writeFileSync("pr-share-chart.png", png);
  console.log(
    `Wrote pr-share-chart.png (${(png.length / 1024).toFixed(0)} KB, ${finalW}x${finalH})`,
  );
}

main();
