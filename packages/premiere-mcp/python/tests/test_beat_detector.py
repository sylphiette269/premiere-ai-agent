from __future__ import annotations

import pytest

from beat_detector import detect_beats


def test_detect_beats_returns_tempo_and_ordered_beats(click_track_path):
    result = detect_beats(str(click_track_path), method="default")

    assert result["tempo"] == pytest.approx(120.0, abs=8.0)
    assert result["beat_count"] >= 6
    assert result["duration"] == pytest.approx(4.0, abs=0.1)
    assert result["beats"] == sorted(result["beats"])


def test_detect_beats_supports_onset_method(click_track_path):
    result = detect_beats(str(click_track_path), method="onset")

    assert result["beat_count"] >= 6
    assert result["beats"][0] == pytest.approx(0.0, abs=0.08)
    assert result["beats"][1] - result["beats"][0] == pytest.approx(0.5, abs=0.08)
