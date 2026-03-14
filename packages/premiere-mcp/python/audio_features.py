from __future__ import annotations

import numpy as np

from audio_utils import as_float_list, load_audio, require_librosa


def _rms_times_and_values(
    audio_path: str,
    sample_rate: int = 22050,
    hop_length: int = 512,
) -> tuple[np.ndarray, np.ndarray, int]:
    librosa = require_librosa()
    samples, sr = load_audio(audio_path, sample_rate=sample_rate)
    rms = librosa.feature.rms(y=samples, hop_length=hop_length)[0]
    times = librosa.times_like(rms, sr=sr, hop_length=hop_length)
    return times, rms, sr


def detect_energy_peaks(
    audio_path: str,
    threshold: float = 0.6,
    sample_rate: int = 22050,
    hop_length: int = 512,
) -> list[dict[str, float]]:
    times, rms, _sample_rate = _rms_times_and_values(
        audio_path,
        sample_rate=sample_rate,
        hop_length=hop_length,
    )
    if rms.size == 0:
        return []

    peak_floor = max(0.0, float(threshold))
    normalized = rms / max(float(np.max(rms)), 1e-9)
    peaks: list[dict[str, float]] = []

    for index, value in enumerate(normalized):
        left = normalized[index - 1] if index > 0 else value
        right = normalized[index + 1] if index < normalized.size - 1 else value
        if value >= peak_floor and value >= left and value >= right:
            peaks.append(
                {
                    "time": round(float(times[index]), 6),
                    "strength": round(float(value), 6),
                }
            )

    return peaks


def detect_segments(
    audio_path: str,
    sample_rate: int = 22050,
    hop_length: int = 512,
    min_duration: float = 0.2,
) -> list[dict[str, float]]:
    times, rms, _sample_rate = _rms_times_and_values(
        audio_path,
        sample_rate=sample_rate,
        hop_length=hop_length,
    )
    if rms.size == 0:
        return []

    normalized = rms / max(float(np.max(rms)), 1e-9)
    boundaries = [0]
    jump_threshold = max(0.15, float(np.std(normalized)) * 0.8)

    for index in range(1, normalized.size):
        if abs(float(normalized[index] - normalized[index - 1])) >= jump_threshold:
            boundaries.append(index)

    if boundaries[-1] != normalized.size - 1:
        boundaries.append(normalized.size - 1)

    deduped: list[int] = []
    min_gap_frames = max(1, int((min_duration * sample_rate) / hop_length))
    for boundary in boundaries:
        if not deduped or boundary - deduped[-1] >= min_gap_frames:
            deduped.append(boundary)
        else:
            deduped[-1] = boundary

    segments: list[dict[str, float]] = []
    for index, start_frame in enumerate(deduped[:-1]):
        end_frame = deduped[index + 1]
        start = float(times[start_frame])
        end = float(times[end_frame])
        if end - start < min_duration:
            continue
        segments.append(
            {
                "start": round(start, 6),
                "end": round(end, 6),
                "energy_mean": round(float(np.mean(normalized[start_frame:end_frame])), 6),
            }
        )

    return segments


def get_rms_envelope(
    audio_path: str,
    hop_length: int = 512,
    sample_rate: int = 22050,
) -> dict[str, list[float]]:
    times, rms, _sample_rate = _rms_times_and_values(
        audio_path,
        sample_rate=sample_rate,
        hop_length=hop_length,
    )
    return {
        "times": as_float_list(times),
        "values": as_float_list(rms),
    }


def detect_silence(
    audio_path: str,
    threshold_db: float = -35.0,
    min_duration: float = 0.25,
    sample_rate: int = 22050,
) -> list[dict[str, float]]:
    librosa = require_librosa()
    samples, sr = load_audio(audio_path, sample_rate=sample_rate)
    non_silent = librosa.effects.split(samples, top_db=abs(float(threshold_db)))
    duration = samples.shape[0] / sr

    silence_segments: list[dict[str, float]] = []
    cursor = 0.0
    for start_frame, end_frame in non_silent.tolist():
        start = start_frame / sr
        if start - cursor >= min_duration:
            silence_segments.append(
                {
                    "start": round(cursor, 6),
                    "end": round(start, 6),
                }
            )
        cursor = end_frame / sr

    if duration - cursor >= min_duration:
        silence_segments.append(
            {
                "start": round(cursor, 6),
                "end": round(duration, 6),
            }
        )

    return silence_segments


def get_spectral_features(
    audio_path: str,
    sample_rate: int = 22050,
    hop_length: int = 512,
) -> dict[str, object]:
    librosa = require_librosa()
    samples, sr = load_audio(audio_path, sample_rate=sample_rate)
    centroid = librosa.feature.spectral_centroid(y=samples, sr=sr, hop_length=hop_length)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=samples, sr=sr, hop_length=hop_length)[0]
    rolloff = librosa.feature.spectral_rolloff(y=samples, sr=sr, hop_length=hop_length)[0]

    return {
        "centroid": as_float_list(centroid),
        "bandwidth": as_float_list(bandwidth),
        "rolloff": as_float_list(rolloff),
        "centroid_mean": round(float(np.mean(centroid)), 6),
        "bandwidth_mean": round(float(np.mean(bandwidth)), 6),
        "rolloff_mean": round(float(np.mean(rolloff)), 6),
    }
