from __future__ import annotations

import json
import os
import sys
from types import SimpleNamespace

from conxa_compile.recorder import frame_extractor


def _write_session(tmp_path, n_events: int):
    session_dir = tmp_path / "sessions" / "sess-1"
    session_dir.mkdir(parents=True)
    (session_dir / "recording.webm").write_bytes(b"fake-video")
    events_path = session_dir / "events.jsonl"
    with open(events_path, "w", encoding="utf-8") as f:
        for i in range(n_events):
            f.write(json.dumps({"visual": {"timestamp_ms": 1000 * (i + 1)}}) + "\n")
    return session_dir


def test_find_ffmpeg_uses_imageio_ffmpeg_fallback(monkeypatch, tmp_path) -> None:
    executable = tmp_path / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    executable.write_bytes(b"fake")
    executable.chmod(0o755)

    monkeypatch.delenv("PLAYWRIGHT_BROWSERS_PATH", raising=False)
    monkeypatch.setattr(frame_extractor.Path, "home", classmethod(lambda cls: tmp_path))
    monkeypatch.setitem(sys.modules, "playwright", None)
    monkeypatch.setitem(
        sys.modules,
        "imageio_ffmpeg",
        SimpleNamespace(get_ffmpeg_exe=lambda: str(executable)),
    )
    monkeypatch.setattr(frame_extractor.shutil, "which", lambda _name: None)
    # Isolate from any real Playwright browser dirs on the host (e.g. /opt/pw-browsers)
    # so the imageio fallback is exercised regardless of the CI/sandbox environment.
    monkeypatch.setattr(frame_extractor.Path, "is_dir", lambda self: False)

    assert frame_extractor._find_ffmpeg() == str(executable)


def test_extract_frames_isolates_per_event_failure(monkeypatch, tmp_path) -> None:
    session_dir = _write_session(tmp_path, n_events=3)
    monkeypatch.setattr(frame_extractor, "_find_ffmpeg", lambda: "ffmpeg")

    def fake_extract_frame(ffmpeg, video_path, out_path, timestamp_ms):
        if "evt_0002" in out_path.name:
            raise RuntimeError("simulated ffmpeg failure")
        out_path.write_bytes(b"png")

    monkeypatch.setattr(frame_extractor, "_extract_frame", fake_extract_frame)
    monkeypatch.setattr(
        frame_extractor, "crop_element_from_frame", lambda *a, **k: "images/element.jpg"
    )

    result, failures = frame_extractor.extract_frames_for_session(session_dir)

    assert set(result) == {0, 2}
    assert [i for i, _ in failures] == [1]

    events = [
        json.loads(line)
        for line in (session_dir / "events.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert events[0]["visual"]["full_screenshot"] == "frames/evt_0001_before_near.png"
    assert events[2]["visual"]["full_screenshot"] == "frames/evt_0003_before_near.png"
    assert "frames" not in events[1]["visual"]
    assert "full_screenshot" not in events[1]["visual"]


def test_extract_frames_skips_frames_already_on_disk(monkeypatch, tmp_path) -> None:
    session_dir = _write_session(tmp_path, n_events=1)
    frames_dir = session_dir / "frames"
    frames_dir.mkdir()
    for label in ("before_far", "before_near", "at", "after_near", "after_far"):
        (frames_dir / f"evt_0001_{label}.png").write_bytes(b"already-here")

    monkeypatch.setattr(frame_extractor, "_find_ffmpeg", lambda: "ffmpeg")

    def fail_if_called(*_a, **_k):
        raise AssertionError("_extract_frame should not run when the frame already exists")

    monkeypatch.setattr(frame_extractor, "_extract_frame", fail_if_called)
    monkeypatch.setattr(
        frame_extractor, "crop_element_from_frame", lambda *a, **k: "images/element.jpg"
    )

    result, failures = frame_extractor.extract_frames_for_session(session_dir)

    assert failures == []
    assert result[0]["before_near"] == "frames/evt_0001_before_near.png"
