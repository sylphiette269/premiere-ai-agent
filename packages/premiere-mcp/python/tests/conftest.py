from __future__ import annotations

import math
import struct
import sys
import wave
from pathlib import Path

import pytest


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def _clamp_pcm(value: float) -> int:
    clipped = max(-1.0, min(1.0, value))
    return int(clipped * 32767)


def _write_wave_file(path: Path, samples: list[float], sample_rate: int) -> None:
    frames = b"".join(struct.pack("<h", _clamp_pcm(sample)) for sample in samples)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(frames)


@pytest.fixture()
def sample_rate() -> int:
    return 22050


@pytest.fixture()
def click_track_path(tmp_path: Path, sample_rate: int) -> Path:
    duration_sec = 4.0
    beat_interval_sec = 0.5
    total_samples = int(duration_sec * sample_rate)
    samples = [0.0] * total_samples
    click_length = max(1, int(sample_rate * 0.015))

    for beat_index in range(int(duration_sec / beat_interval_sec)):
        start = int(beat_index * beat_interval_sec * sample_rate)
        for offset in range(click_length):
            index = start + offset
            if index >= total_samples:
                break
            samples[index] += 0.95 * math.exp(-offset / max(1, click_length / 5))

    wave_path = tmp_path / "click-track.wav"
    _write_wave_file(wave_path, samples, sample_rate)
    return wave_path


@pytest.fixture()
def feature_track_path(tmp_path: Path, sample_rate: int) -> Path:
    sections = [
        ("low", 1.0, 220.0, 0.10),
        ("peak", 1.0, 440.0, 0.95),
        ("silence", 0.6, 0.0, 0.0),
        ("bright", 1.0, 1760.0, 0.40),
    ]
    samples: list[float] = []

    for _label, duration_sec, frequency, amplitude in sections:
        section_samples = int(duration_sec * sample_rate)
        for index in range(section_samples):
            if amplitude == 0.0 or frequency == 0.0:
                samples.append(0.0)
                continue
            samples.append(
                amplitude * math.sin(2.0 * math.pi * frequency * (index / sample_rate))
            )

    wave_path = tmp_path / "feature-track.wav"
    _write_wave_file(wave_path, samples, sample_rate)
    return wave_path
