from __future__ import annotations


def quantize_beats(beats: list[float], subdivision: float) -> list[float]:
    if subdivision <= 0:
        raise ValueError("subdivision must be greater than zero")
    return [round(round(float(beat) / subdivision) * subdivision, 6) for beat in beats]


def group_beats(beats: list[float], group_size: int) -> list[list[float]]:
    if group_size <= 0:
        raise ValueError("group_size must be greater than zero")
    return [beats[index:index + group_size] for index in range(0, len(beats), group_size)]


def select_strong_beats(
    beats: list[float],
    pattern: str = "downbeat",
    beats_per_bar: int = 4,
) -> list[float]:
    if beats_per_bar <= 0:
        raise ValueError("beats_per_bar must be greater than zero")

    normalized_pattern = pattern.strip().lower()
    if normalized_pattern == "downbeat":
        return [beat for index, beat in enumerate(beats) if index % beats_per_bar == 0]
    if normalized_pattern == "odd":
        return [beat for index, beat in enumerate(beats) if index % 2 == 0]
    if normalized_pattern == "even":
        return [beat for index, beat in enumerate(beats) if index % 2 == 1]

    raise ValueError(f"Unsupported strong beat pattern: {pattern}")


def offset_beats(beats: list[float], offset_sec: float) -> list[float]:
    return [round(float(beat) + float(offset_sec), 6) for beat in beats]


def filter_beats(beats: list[float], min_interval: float) -> list[float]:
    if min_interval < 0:
        raise ValueError("min_interval must not be negative")
    filtered: list[float] = []
    for beat in beats:
        if not filtered or float(beat) - filtered[-1] >= min_interval:
            filtered.append(round(float(beat), 6))
    return filtered
