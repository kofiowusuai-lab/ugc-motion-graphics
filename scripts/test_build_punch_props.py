import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_punch_props as B


class BuildPunchPropsValidationTests(unittest.TestCase):
    def _run_props(self, script, durations, words, video_duration=10.0):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            build = root / "build"
            asm = build / "_asm"
            asm.mkdir(parents=True)
            script_path = root / "script.json"
            out_path = root / "props.json"
            video = root / "base.mp4"
            video.write_bytes(b"fake")
            script_path.write_text(json.dumps(script))
            for shot in script["shots"]:
                (asm / f"{shot['id']}.mp4").write_bytes(b"fake")

            def fake_dur(path):
                name = os.path.basename(path)
                if name == "base.mp4":
                    return video_duration
                sid = name.removesuffix(".mp4")
                return durations[sid]

            argv = [
                "build_punch_props.py",
                "--build", str(build),
                "--script", str(script_path),
                "--video-abs", str(video),
                "--video-rel", "jobs/test/base.mp4",
                "--out", str(out_path),
            ]
            with mock.patch.object(B, "dur", side_effect=fake_dur), \
                 mock.patch.object(B, "transcribe", return_value=words), \
                 mock.patch.object(sys, "argv", argv):
                B.main()
            return json.loads(out_path.read_text())

    def test_fails_when_transcript_words_extend_past_props_duration(self):
        script = {"speed": 1.0, "shots": [{"id": "s1", "kind": "cut", "still": "desk_open"}]}
        with self.assertRaises(SystemExit):
            self._run_props(script, {"s1": 5.0}, [{"text": "late", "start": 5.2, "end": 7.0}], video_duration=5.0)

    def test_fails_when_video_duration_and_asm_duration_disagree(self):
        script = {"speed": 1.0, "shots": [{"id": "s1", "kind": "cut", "still": "desk_open"}]}
        with self.assertRaises(SystemExit):
            self._run_props(script, {"s1": 5.0}, [{"text": "ok", "start": 0.0, "end": 4.8}], video_duration=8.0)

    def test_accepts_verified_tail_trim_when_base_is_shorter_than_asm(self):
        script = {"speed": 1.0, "shots": [{"id": "s1", "kind": "cut", "still": "desk_open"}]}
        props = self._run_props(
            script,
            {"s1": 8.0},
            [{"text": "ok", "start": 0.0, "end": 4.8}],
            video_duration=5.0,
        )
        self.assertEqual(props["durationInSeconds"], 5.0)

    def test_fails_when_tail_trim_cuts_transcript_words(self):
        script = {"speed": 1.0, "shots": [{"id": "s1", "kind": "cut", "still": "desk_open"}]}
        with self.assertRaises(SystemExit):
            self._run_props(script, {"s1": 8.0}, [{"text": "late", "start": 5.2, "end": 7.0}], video_duration=5.0)

    def test_recut_base_falls_back_to_scene_detected_cuts(self):
        # _asm timeline (3+3+3=9s) is much longer than the re-cut base (4s): the per-shot cut
        # timestamps are stale, so cuts must come from scene detection on the base, and any
        # board beats are dropped (can't be mapped to a re-cut base automatically).
        script = {
            "speed": 1.0,
            "board_headline": "AGENT OS",
            "shots": [
                {"id": "s1", "kind": "cut", "still": "board_topic", "line": "a"},
                {"id": "s2", "kind": "cut", "still": "gym_bench", "line": "b"},
                {"id": "s3", "kind": "cut", "still": "car_arrival", "line": "c"},
            ],
        }
        with mock.patch.object(B, "scene_cuts", return_value=[1.2, 2.6]):
            props = self._run_props(
                script,
                {"s1": 3.0, "s2": 3.0, "s3": 3.0},
                [{"text": "ok", "start": 0.1, "end": 3.6}],
                video_duration=4.0,
            )
        self.assertEqual(props["durationInSeconds"], 4.0)
        self.assertEqual(props["cuts"], [1.2, 2.6])
        self.assertEqual(props["boardBeats"], [])

    def test_explainer_board_topic_creates_board_beats_and_keywords(self):
        script = {
            "speed": 1.0,
            "title": "Obsidian Agents",
            "board_headline": "AGENT NOTEBOOK OS",
            "topic": "Obsidian for AI agents",
            "subtopics": [{"key": "Why Agents Need Obsidian"}],
            "shots": [
                {"id": "s1", "kind": "cut", "still": "desk_open", "line": "Intro"},
                {"id": "s2", "kind": "cut", "still": "board_topic", "line": "Board"},
            ],
        }
        props = self._run_props(
            script,
            {"s1": 2.0, "s2": 3.0},
            [{"text": "Obsidian", "start": 0.1, "end": 0.4}, {"text": "agents", "start": 2.2, "end": 2.7}],
            video_duration=5.0,
        )
        self.assertEqual(props["boardBeats"], [{"at": 2.0, "label": "AGENT NOTEBOOK OS", "i": 0}])
        self.assertIn("obsidian", props["keywords"])
        self.assertIn("agents", props["keywords"])


if __name__ == "__main__":
    unittest.main()
