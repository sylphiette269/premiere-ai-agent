from __future__ import annotations

import pytest

from audio_features import (
    detect_energy_peaks,
    detect_segments,
    detect_silence,
    get_rms_envelope,
    get_spectral_features,
)


def test_detect_energy_peaks_finds_loud_region(feature_track_path):
    peaks = detect_energy_peaks(str(feature_track_path), threshold=0.6)

    assert peaks
    assert any(0.8 <= peak["time"] <= 2.2 for peak in peaks)
    assert all("strength" in peak for peak in peaks)


def test_detect_silence_reports_middle_silent_section(feature_track_path):
    silence = detect_silence(
        str(feature_track_path),
        threshold_db=-35.0,
        min_duration=0.25,
    )

    assert silence
    middle = silence[0]
    assert middle["start"] == pytest.approx(2.0, abs=0.2)
    assert middle["end"] == pytest.approx(2.6, abs=0.2)


def test_get_rms_envelope_returns_time_aligned_values(feature_track_path):
    envelope = get_rms_envelope(str(feature_track_path), hop_length=512)

    assert envelope["times"]
    assert len(envelope["times"]) == len(envelope["values"])
    assert max(envelope["values"]) > min(envelope["values"])


def test_get_spectral_features_returns_summary(feature_track_path):
    features = get_spectral_features(str(feature_track_path))

    assert features["centroid_mean"] > 0
    assert features["rolloff_mean"] >= features["centroid_mean"]
    assert len(features["centroid"]) == len(features["bandwidth"])


def test_detect_segments_returns_ordered_sections(feature_track_path):
    segments = detect_segments(str(feature_track_path))

    assert len(segments) >= 2
    assert segments == sorted(segments, key=lambda segment: segment["start"])
    assert all(segment["end"] > segment["start"] for segment in segments)
