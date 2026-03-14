from __future__ import annotations

from typing import Literal

import numpy as np

from audio_utils import as_float_list, load_audio, require_librosa


BeatMethod = Literal["default", "onset", "plp"]


def _tempo_from_intervals(beat_times: np.ndarray) -> float:
    if beat_times.size < 2:
        return 0.0

    intervals = np.diff(beat_times)
    median_interval = float(np.median(intervals))
    if median_interval <= 0:
        return 0.0
    return round(60.0 / median_interval, 3)


def _normalize_leading_onset_gap(beat_times: np.ndarray) -> np.ndarray:
    if beat_times.size < 2:
        return beat_times

    interval = float(np.median(np.diff(beat_times)))
    if interval <= 0:
        return beat_times

    leading_beats: list[float] = []
    cursor = float(beat_times[0]) - interval
    tolerance = interval * 0.45
    while cursor >= -tolerance:
        leading_beats.append(max(0.0, cursor))
        cursor -= interval

    if not leading_beats:
        return beat_times

    normalized = np.concatenate((np.array(sorted(leading_beats)), beat_times))
    return np.unique(np.round(normalized, 6))


def detect_beats(audio_path: str, method: BeatMethod = "default") -> dict[str, object]:
    librosa = require_librosa()
    samples, sample_rate = load_audio(audio_path)
    duration = round(float(samples.shape[0] / sample_rate), 6)

    if method == "default":
        onset_envelope = librosa.onset.onset_strength(y=samples, sr=sample_rate)
        tempo, beat_frames = librosa.beat.beat_track(
            onset_envelope=onset_envelope,
            sr=sample_rate,
            units="frames",
        )
        tempo_value = round(float(np.asarray(tempo).reshape(-1)[0]), 3)
    elif method == "onset":
        onset_envelope = librosa.onset.onset_strength(y=samples, sr=sample_rate)
        beat_frames = librosa.onset.onset_detect(
            onset_envelope=onset_envelope,
            sr=sample_rate,
            units="frames",
            backtrack=False,
        )
        beat_times = _normalize_leading_onset_gap(
            librosa.frames_to_time(beat_frames, sr=sample_rate)
        )
        tempo_value = _tempo_from_intervals(beat_times)
        return {
            "tempo": tempo_value,
            "beats": as_float_list(beat_times),
            "beat_count": int(beat_times.size),
            "duration": duration,
        }
    elif method == "plp":
        pulse_curve = librosa.beat.plp(y=samples, sr=sample_rate)
        tempo, beat_frames = librosa.beat.beat_track(
            onset_envelope=pulse_curve,
            sr=sample_rate,
            units="frames",
            trim=False,
        )
        tempo_value = round(float(np.asarray(tempo).reshape(-1)[0]), 3)
    else:
        raise ValueError(f"Unsupported beat detection method: {method}")

    beat_times = librosa.frames_to_time(np.asarray(beat_frames), sr=sample_rate)
    return {
        "tempo": tempo_value,
        "beats": as_float_list(beat_times),
        "beat_count": int(beat_times.size),
        "duration": duration,
    }
