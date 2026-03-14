from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest


def test_cli_writes_analysis_json(click_track_path, tmp_path: Path):
    output_path = tmp_path / "beats.json"
    analyze_script = Path(__file__).resolve().parents[1] / "analyze.py"

    completed = subprocess.run(
        [
            sys.executable,
            str(analyze_script),
            "--input",
            str(click_track_path),
            "--output",
            str(output_path),
            "--method",
            "default",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["tempo"] == pytest.approx(120.0, abs=8.0)
    assert payload["beat_count"] >= 6
    assert "energy_peaks" in payload
