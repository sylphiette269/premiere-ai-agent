from __future__ import annotations

import argparse
import json
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Transcribe local media with faster-whisper and emit JSON.",
    )
    parser.add_argument("--input", required=True, help="Input audio or video path")
    parser.add_argument(
        "--model",
        default="medium",
        help="faster-whisper model size or local model path",
    )
    parser.add_argument(
        "--language",
        default=None,
        help="Optional language code such as zh or en",
    )
    parser.add_argument(
        "--device",
        default="cpu",
        help="Inference device. Defaults to cpu for predictable local execution.",
    )
    parser.add_argument(
        "--compute-type",
        default="float32",
        help="faster-whisper compute type. Defaults to float32.",
    )
    return parser


def transcribe_media(
    input_path: str,
    model_name: str,
    language: str | None,
    device: str,
    compute_type: str,
) -> dict[str, object]:
    from faster_whisper import WhisperModel

    model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
    )
    segments, info = model.transcribe(
        input_path,
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
        language=language or None,
    )

    segment_list = list(segments)
    payload_segments: list[dict[str, object]] = []
    for index, segment in enumerate(segment_list, start=1):
        payload_segments.append(
            {
                "id": index,
                "start": round(float(segment.start), 6),
                "end": round(float(segment.end), 6),
                "text": segment.text.strip(),
            }
        )

    duration = getattr(info, "duration", None)
    if duration is None:
        duration = payload_segments[-1]["end"] if payload_segments else 0.0

    return {
        "language": getattr(info, "language", None) or language or "unknown",
        "duration": round(float(duration), 6),
        "segments": payload_segments,
    }


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"Input media not found: {input_path}")

    payload = transcribe_media(
        str(input_path),
        args.model,
        args.language,
        args.device,
        args.compute_type,
    )
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
