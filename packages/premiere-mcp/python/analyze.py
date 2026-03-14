from __future__ import annotations

import argparse
import json
from pathlib import Path

from audio_features import (
    detect_energy_peaks,
    detect_segments,
    detect_silence,
    get_rms_envelope,
    get_spectral_features,
)
from beat_detector import detect_beats


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Analyze an audio file and export beat and feature data as JSON.",
    )
    parser.add_argument("--input", required=True, help="Input audio or video path")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument(
        "--method",
        default="default",
        choices=["default", "onset", "plp"],
        help="Beat detection method",
    )
    parser.add_argument(
        "--energy-threshold",
        type=float,
        default=0.6,
        help="Normalized threshold used for energy peak detection",
    )
    return parser


def analyze_audio(input_path: str, method: str, energy_threshold: float) -> dict[str, object]:
    beat_result = detect_beats(input_path, method=method)
    return {
        **beat_result,
        "energy_peaks": detect_energy_peaks(input_path, threshold=energy_threshold),
        "segments": detect_segments(input_path),
        "rms_envelope": get_rms_envelope(input_path),
        "silence": detect_silence(input_path),
        "spectral_features": get_spectral_features(input_path),
    }


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = analyze_audio(args.input, args.method, args.energy_threshold)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Analysis written to: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
