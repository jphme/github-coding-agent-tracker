// claude-dual-chart.ts — Claude Code commit share vs PR share on the same chart
// Uses 7-day rolling sums for both metrics

import { globSync, readFileSync, writeFileSync } from "fs";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import sharp from "sharp";

interface DualPoint {
  date: string;
  metric: string;
  percentage: number;
}

function loadData(): DualPoint[] {
  // Load commit data
  const commitFiles = globSync("commit-data/*.csv").sort();
  const commitDaily: { date: string; claude: number; total: number }[] = [];
  for (const file of commitFiles) {
    const content = readFileSync(file, "utf-8");
    const rows = new Map<string, number>();
    let date = "";
    for (const line of content.trim().split("\n").slice(1)) {
      const [d, query, countStr] = line.split(",");
      date = d;
      rows.set(query, parseInt(countStr, 10));
    }
    if (date >= "2025-05-01") {
      commitDaily.push({ date, claude: rows.get("claude") ?? 0, total: rows.get("total") ?? 0 });
    }
  }
  commitDaily.sort((a, b) => a.date.localeCompare(b.date));

  // Load PR data
  const prFiles = globSync("pr-data/*.csv").sort();
  const prDaily: { date: string; claude: number; total: number }[] = [];
  for (const file of prFiles) {
    const content = readFileSync(file, "utf-8");
    const rows = new Map<string, number>();
    let date = "";
    for (const line of content.trim().split("\n").slice(1)) {
      const [d, query, countStr] = line.split(",");
      date = d;
      rows.set(query, parseInt(countStr, 10));
    }
    if (date >= "2025-05-01") {
      prDaily.push({ date, claude: rows.get("claude") ?? 0, total: rows.get("total") ?? 0 });
    }
  }
  prDaily.sort((a, b) => a.date.localeCompare(b.date));

  const WINDOW = 7;
  const points: DualPoint[] = [];

  // 7-day rolling for commits
  for (let i = WINDOW - 1; i < commitDaily.length; i++) {
    let sumClaude = 0,
      sumTotal = 0;
    for (let j = i - WINDOW + 1; j <= i; j++) {
      sumClaude += commitDaily[j].claude;
      sumTotal += commitDaily[j].total;
    }
    if (sumTotal > 0) {
      points.push({
        date: commitDaily[i].date,
        metric: "Commit Share",
        percentage: (sumClaude / sumTotal) * 100,
      });
    }
  }

  // 7-day rolling for PRs
  for (let i = WINDOW - 1; i < prDaily.length; i++) {
    let sumClaude = 0,
      sumTotal = 0;
    for (let j = i - WINDOW + 1; j <= i; j++) {
      sumClaude += prDaily[j].claude;
      sumTotal += prDaily[j].total;
    }
    if (sumTotal > 0) {
      points.push({
        date: prDaily[i].date,
        metric: "PR Share",
        percentage: (sumClaude / sumTotal) * 100,
      });
    }
  }

  return points;
}

async function main() {
  const data = loadData();
  console.log(`${data.length} data points`);

  const vlSpec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 1000,
    height: 420,
    padding: 0,
    background: "#FAFBFF",
    title: {
      text: "Claude Code: Commit Share vs PR Share of All Public GitHub Activity",
      subtitle: "7-day rolling averages  ·  May 2025 - Present",
      font: "Helvetica Neue, Arial, sans-serif",
      fontSize: 28,
      fontWeight: 700,
      color: "#1E2A3A",
      subtitleFont: "Helvetica Neue, Arial, sans-serif",
      subtitleFontSize: 19,
      subtitleColor: "#8B95A5",
      subtitlePadding: 8,
      anchor: "start",
      offset: 18,
    },
    data: { values: data },
    mark: {
      type: "line",
      interpolate: "monotone",
      strokeWidth: 3.5,
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
        axis: {
          title: "Share (%)",
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
        field: "metric",
        type: "nominal",
        scale: {
          domain: ["Commit Share", "PR Share"],
          range: ["#6C5CE7", "#10B981"],
        },
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
      strokeDash: {
        field: "metric",
        type: "nominal",
        scale: {
          domain: ["Commit Share", "PR Share"],
          range: [[], [8, 4]],
        },
        legend: null,
      },
    },
    config: {
      font: "Helvetica Neue, Arial, sans-serif",
      view: { stroke: null },
    },
  };

  const vegaSpec = vegaLite.compile(vlSpec).spec;
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none" });
  const svg = await view.toSVG();

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

  const attrText = "by @jphme / ellamind.com";
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

  writeFileSync("claude-dual-chart.png", png);
  console.log(
    `Wrote claude-dual-chart.png (${(png.length / 1024).toFixed(0)} KB, ${finalW}x${finalH})`,
  );
}

main();
