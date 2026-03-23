#!/usr/bin/env python3
"""
Static outlier correction for daily total commit counts.

The GitHub Search API occasionally returns inflated "total" commit counts.
This script detects and corrects those outliers using a pre-fitted linear
trend + weekday multiplier model. Agent-specific counts are NOT modified.

Model: expected(date) = (BASE_VALUE + DAILY_SLOPE * days_since_ref) * WEEKDAY_MULTIPLIERS[weekday]
Outlier: actual / expected > UPPER_THRESHOLD or < LOWER_THRESHOLD

Usage:
    uv run python3 src/fix_commit_totals.py           # dry-run (show what would change)
    uv run python3 src/fix_commit_totals.py --apply    # apply corrections to data/ files
"""

import csv
import datetime
import os
import shutil
import sys

# ---------------------------------------------------------------------------
# Model parameters (fitted on clean data, excluding known outliers)
# Reference date for day-number calculation
# ---------------------------------------------------------------------------

REF_DATE = datetime.date(2025, 1, 1)
BASE_VALUE = 2918144.96
DAILY_SLOPE = 6112.99

# Weekday multipliers (0=Monday ... 6=Sunday), normalized to average ~1.0
WEEKDAY_MULTIPLIERS = {
    0: 1.048575,  # Mon
    1: 1.056157,  # Tue
    2: 1.044553,  # Wed
    3: 1.028382,  # Thu
    4: 1.017191,  # Fri
    5: 0.885333,  # Sat
    6: 0.919808,  # Sun
}

# Outlier thresholds: flag if actual/expected is outside this range
UPPER_THRESHOLD = 1.8
LOWER_THRESHOLD = 0.55

DATA_DIR = "data"
BACKUP_DIR = "data-backup-original"


def expected_total(date: datetime.date) -> int:
    """Compute expected daily total commit count for a given date."""
    day_num = (date - REF_DATE).days
    trend = BASE_VALUE + DAILY_SLOPE * day_num
    multiplier = WEEKDAY_MULTIPLIERS[date.weekday()]
    return round(trend * multiplier)


def is_outlier(actual: int, expected: int) -> bool:
    """Return True if the actual count deviates too far from expected."""
    if expected <= 0:
        return False
    ratio = actual / expected
    return ratio > UPPER_THRESHOLD or ratio < LOWER_THRESHOLD


def read_csv(filepath: str) -> list[list[str]]:
    """Read a CSV file and return rows as list of lists (preserving order)."""
    rows = []
    with open(filepath, newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            rows.append(row)
    return rows


def write_csv(filepath: str, rows: list[list[str]]) -> None:
    """Write rows back to a CSV file."""
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)


def main():
    apply_mode = "--apply" in sys.argv
    mode_label = "APPLYING corrections" if apply_mode else "DRY RUN (use --apply to write changes)"
    print(f"=== Commit Total Outlier Correction — {mode_label} ===\n")

    # Collect all date CSV files
    filenames = sorted(
        f
        for f in os.listdir(DATA_DIR)
        if f.endswith(".csv") and f[0:4].isdigit()
    )

    # Validate they are valid dates
    date_files = []
    for fname in filenames:
        date_str = fname.replace(".csv", "")
        try:
            dt = datetime.date.fromisoformat(date_str)
            date_files.append((fname, date_str, dt))
        except ValueError:
            continue

    print(f"Found {len(date_files)} daily data files.\n")

    # Detect outliers
    corrections = []
    for fname, date_str, dt in date_files:
        filepath = os.path.join(DATA_DIR, fname)
        rows = read_csv(filepath)

        # Find the total row
        total_row_idx = None
        actual_total = None
        for i, row in enumerate(rows):
            if len(row) >= 3 and row[1] == "total":
                total_row_idx = i
                actual_total = int(row[2])
                break

        if total_row_idx is None or actual_total is None:
            continue

        exp = expected_total(dt)
        if is_outlier(actual_total, exp):
            ratio = actual_total / exp
            corrections.append({
                "filename": fname,
                "filepath": filepath,
                "date_str": date_str,
                "date": dt,
                "actual": actual_total,
                "expected": exp,
                "ratio": ratio,
                "total_row_idx": total_row_idx,
                "rows": rows,
            })

    if not corrections:
        print("No outliers detected. All daily totals are within expected range.")
        return

    # Print summary
    print(f"Detected {len(corrections)} outlier(s):\n")
    print(f"  {'Date':<12} {'Day':<4} {'Actual':>14} {'Expected':>14} {'Ratio':>7}")
    print(f"  {'-'*12} {'-'*4} {'-'*14} {'-'*14} {'-'*7}")
    for c in corrections:
        dow = c["date"].strftime("%a")
        print(
            f"  {c['date_str']:<12} {dow:<4} {c['actual']:>14,} {c['expected']:>14,} {c['ratio']:>7.2f}"
        )

    if not apply_mode:
        print(f"\nDry run complete. Re-run with --apply to write corrections.")
        return

    # Create backup
    if not os.path.exists(BACKUP_DIR):
        print(f"\nCreating backup at {BACKUP_DIR}/ ...")
        shutil.copytree(DATA_DIR, BACKUP_DIR)
        print(f"Backup created ({len(os.listdir(BACKUP_DIR))} files).")
    else:
        print(f"\nBackup directory {BACKUP_DIR}/ already exists — skipping backup.")

    # Apply corrections
    print(f"\nApplying corrections:\n")
    print(f"  {'Date':<12} {'Before':>14} {'After':>14}")
    print(f"  {'-'*12} {'-'*14} {'-'*14}")
    for c in corrections:
        rows = c["rows"]
        idx = c["total_row_idx"]
        before = c["actual"]
        after = c["expected"]

        # Replace the total count
        rows[idx][2] = str(after)
        write_csv(c["filepath"], rows)

        print(f"  {c['date_str']:<12} {before:>14,} {after:>14,}")

    print(f"\nDone. {len(corrections)} file(s) corrected.")

    # Verification: re-read corrected files and confirm
    print(f"\n=== Verification ===\n")
    all_good = True
    for c in corrections:
        rows = read_csv(c["filepath"])
        for row in rows:
            if len(row) >= 3 and row[1] == "total":
                new_val = int(row[2])
                exp = c["expected"]
                if new_val != exp:
                    print(f"  MISMATCH {c['date_str']}: expected {exp}, got {new_val}")
                    all_good = False
                else:
                    ratio_new = new_val / expected_total(c["date"])
                    print(f"  {c['date_str']}: corrected to {new_val:>12,} (ratio now {ratio_new:.2f})")
                break

    if all_good:
        print(f"\nAll corrections verified successfully.")
    else:
        print(f"\nWARNING: Some corrections failed verification!")


if __name__ == "__main__":
    main()
