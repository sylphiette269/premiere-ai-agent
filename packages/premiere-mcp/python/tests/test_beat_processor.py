from __future__ import annotations

from beat_processor import (
    filter_beats,
    group_beats,
    offset_beats,
    quantize_beats,
    select_strong_beats,
)


def test_quantize_beats_snaps_to_grid():
    quantized = quantize_beats([0.03, 0.52, 1.01], subdivision=0.25)

    assert quantized == [0.0, 0.5, 1.0]


def test_group_beats_batches_by_group_size():
    grouped = group_beats([0.0, 0.5, 1.0, 1.5, 2.0], group_size=2)

    assert grouped == [[0.0, 0.5], [1.0, 1.5], [2.0]]


def test_select_strong_beats_supports_bar_downbeats():
    strong = select_strong_beats(
        [0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
        pattern="downbeat",
        beats_per_bar=4,
    )

    assert strong == [0.0, 2.0]


def test_offset_beats_and_filter_beats_work_together():
    offset = offset_beats([0.0, 0.02, 0.6], offset_sec=0.1)
    filtered = filter_beats(offset, min_interval=0.15)

    assert offset == [0.1, 0.12, 0.7]
    assert filtered == [0.1, 0.7]
