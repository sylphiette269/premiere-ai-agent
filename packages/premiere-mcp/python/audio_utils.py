from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np


def require_librosa() -> Any:
    try:
        import librosa
    except ImportError as error:  # pragma: no cover - exercised through callers
        raise RuntimeError(
            "librosa is required for audio analysis. Install python/requirements.txt first."
        ) from error

    return librosa


def load_audio(audio_path: str, sample_rate: int = 22050) -> tuple[np.ndarray, int]:
    source = Path(audio_path)
    if not source.exists():
        raise FileNotFoundError(f"Audio file does not exist: {audio_path}")

    librosa = require_librosa()
    samples, sr = librosa.load(str(source), sr=sample_rate, mono=True)
    if samples.size == 0:
        raise ValueError(f"Audio file is empty: {audio_path}")
    return samples.astype(float), int(sr)


def as_float_list(values: np.ndarray, digits: int = 6) -> list[float]:
    return [round(float(value), digits) for value in values.tolist()]

