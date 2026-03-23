"""
Weekly aggregate script for github-coding-agent-tracker data.
Reads daily commit and PR CSVs, produces a weekly-summary.csv.
Only includes complete weeks (7 days of data for both commits and PRs).
"""

import csv
import os
from collections import defaultdict
from datetime import date, timedelta

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

COMMIT_DATA_DIR = "commit-data"
PR_DATA_DIR = "pr-data"
OUTPUT_PATH = "weekly-summary.csv"

COMMIT_KEYS = [
    "total", "claude", "copilot", "devin", "aider", "codex",
    "opencode", "cursor_editor", "cursor_bg", "jules", "amazonq",
    "amp", "windsurf", "junie",
]

PR_KEYS = [
    "total", "claude", "codex", "copilot", "cursor", "devin",
    "jules", "amazonq", "opencode",
]

# Agents (excludes "total") for percentage columns
COMMIT_AGENTS = [k for k in COMMIT_KEYS if k != "total"]
PR_AGENTS = [k for k in PR_KEYS if k != "total"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def iso_week_start(d: date) -> date:
    """Return the Monday that starts the ISO week containing d."""
    return d - timedelta(days=d.weekday())


def read_daily_csv(directory: str, keys: list) -> dict:
    """
    Read all YYYY-MM-DD.csv files in directory.
    Returns {date_obj: {key: count, ...}}.
    Missing keys default to 0.
    """
    daily = {}
    for fname in os.listdir(directory):
        if not fname.endswith(".csv"):
            continue
        # Skip non-date filenames (e.g. weekly-summary.csv)
        stem = fname[:-4]
        try:
            d = date.fromisoformat(stem)
        except ValueError:
            continue
        row = {k: 0 for k in keys}
        fpath = os.path.join(directory, fname)
        with open(fpath, newline="") as f:
            reader = csv.DictReader(f)
            for line in reader:
                q = line.get("query", "").strip()
                if q in keys:
                    try:
                        row[q] = int(line["count"])
                    except (ValueError, KeyError):
                        row[q] = 0
        daily[d] = row
    return daily


def aggregate_by_week(daily: dict, keys: list) -> dict:
    """
    Sum daily rows into week buckets (keyed by week_start Monday).
    Returns {week_start: {key: sum, ..., '_days': count}}.
    """
    weeks = defaultdict(lambda: {k: 0 for k in keys} | {"_days": 0})
    for d, row in daily.items():
        ws = iso_week_start(d)
        weeks[ws]["_days"] += 1
        for k in keys:
            weeks[ws][k] += row.get(k, 0)
    return weeks


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Reading commit data...")
    commit_daily = read_daily_csv(COMMIT_DATA_DIR, COMMIT_KEYS)
    print(f"  {len(commit_daily)} daily commit files loaded.")

    print("Reading PR data...")
    pr_daily = read_daily_csv(PR_DATA_DIR, PR_KEYS)
    print(f"  {len(pr_daily)} daily PR files loaded.")

    commit_weeks = aggregate_by_week(commit_daily, COMMIT_KEYS)
    pr_weeks = aggregate_by_week(pr_daily, PR_KEYS)

    # Find all week starts present in both datasets
    all_weeks = sorted(set(commit_weeks.keys()) | set(pr_weeks.keys()))

    # Keep only complete weeks: 7 days in BOTH commit and PR data
    complete_weeks = [
        ws for ws in all_weeks
        if commit_weeks.get(ws, {}).get("_days", 0) == 7
        and pr_weeks.get(ws, {}).get("_days", 0) == 7
    ]

    print(f"\n  Total week buckets found: {len(all_weeks)}")
    print(f"  Complete weeks (7 days in both datasets): {len(complete_weeks)}")

    # Build output rows
    output_rows = []
    for ws in complete_weeks:
        cw = commit_weeks[ws]
        pw = pr_weeks[ws]

        row = {"week_start": ws.isoformat()}

        # Raw commit columns
        for k in COMMIT_KEYS:
            row[f"commits_{k}"] = cw[k]

        # Raw PR columns
        for k in PR_KEYS:
            row[f"prs_{k}"] = pw[k]

        # Commit percentage columns
        c_total = cw["total"] or 0
        for agent in COMMIT_AGENTS:
            pct = round(cw[agent] / c_total * 100, 4) if c_total else 0.0
            row[f"commits_{agent}_pct"] = pct

        # PR percentage columns
        p_total = pw["total"] or 0
        for agent in PR_AGENTS:
            pct = round(pw[agent] / p_total * 100, 4) if p_total else 0.0
            row[f"prs_{agent}_pct"] = pct

        # PR/commit ratio
        row["pr_commit_ratio"] = round(p_total / c_total * 100, 4) if c_total else 0.0

        output_rows.append(row)

    # Determine column order
    fieldnames = (
        ["week_start"]
        + [f"commits_{k}" for k in COMMIT_KEYS]
        + [f"prs_{k}" for k in PR_KEYS]
        + [f"commits_{a}_pct" for a in COMMIT_AGENTS]
        + [f"prs_{a}_pct" for a in PR_AGENTS]
        + ["pr_commit_ratio"]
    )

    with open(OUTPUT_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"\nWrote {len(output_rows)} rows to {OUTPUT_PATH}")

    # Summary
    if output_rows:
        first_date = output_rows[0]["week_start"]
        last_date = output_rows[-1]["week_start"]
        print(f"\n=== Summary ===")
        print(f"Total complete weeks : {len(output_rows)}")
        print(f"Date range           : {first_date} to {last_date}")

        sample_rows = []
        if len(output_rows) <= 6:
            sample_rows = output_rows
            label = "All rows"
        else:
            sample_rows = output_rows[:3] + output_rows[-3:]
            label = "First 3 and last 3 rows"

        print(f"\n{label}:")
        # Print a condensed view: week_start, totals, and a few pct columns
        header = f"{'week_start':<12} {'commits_total':>14} {'prs_total':>10} {'commits_claude_pct':>20} {'prs_claude_pct':>16} {'pr_commit_ratio':>16}"
        print(header)
        print("-" * len(header))
        for i, r in enumerate(sample_rows):
            if len(output_rows) > 6 and i == 3:
                print("  ...")
            print(
                f"{r['week_start']:<12} "
                f"{r['commits_total']:>14,} "
                f"{r['prs_total']:>10,} "
                f"{r['commits_claude_pct']:>20} "
                f"{r['prs_claude_pct']:>16} "
                f"{r['pr_commit_ratio']:>16}"
            )
    else:
        print("No complete weeks found.")


if __name__ == "__main__":
    main()
