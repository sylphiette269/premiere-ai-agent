# Python 音频分析子系统

当前目录提供一个独立的音频分析最小闭环，用来为后续卡点剪辑能力输出结构化节拍与特征数据。

## 当前范围

- `beat_detector.py`
  - `detect_beats(audio_path, method="default")`
  - 支持 `default`、`onset`、`plp`
- `audio_features.py`
  - `detect_energy_peaks`
  - `detect_segments`
  - `get_rms_envelope`
  - `detect_silence`
  - `get_spectral_features`
- `beat_processor.py`
  - `quantize_beats`
  - `group_beats`
  - `select_strong_beats`
  - `offset_beats`
  - `filter_beats`
- `analyze.py`
  - 命令行入口，输出 JSON

## 安装

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r python/requirements-dev.txt
```

## 运行

```bash
python python/analyze.py --input path/to/music.wav --output python/out/beats.json --method default
```

输出会包含：

- `tempo`
- `beats`
- `beat_count`
- `duration`
- `energy_peaks`
- `segments`
- `rms_envelope`
- `silence`
- `spectral_features`

## 测试

```bash
python -m pytest python/tests
```
