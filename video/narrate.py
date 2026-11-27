"""Generates the Cleave narration with the ElevenLabs CLI, one take per scene (the allot method).

Usage: python3 video/narrate.py [scene numbers to re-take, e.g. 3 5]
Each scene is sent with the previous and next scene's text for continuity, normalised to -16 LUFS, and
written to video/vo/take-N/ (a new take folder every run; earlier takes are never overwritten).
Auth: the CLI's own login (macOS Keychain). Re-takes of single scenes are copied from the latest take.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

VOICE_ID = "8s7FhQuwCMptPvCeDnKj"  # ElevenLabs "Mark - Strong, Premium and Polished"
MODEL_ID = "eleven_v4"
SETTINGS = ["--voice-settings.stability", "0.5", "--voice-settings.similarity-boost", "0.75"]
CLI = ["npx", "--yes", "@elevenlabs/cli@1.12.2"]

root = Path(__file__).resolve().parent
parts = (root / "NARRATION.md").read_text().split("\n---\n")
if len(parts) < 3:
    sys.exit("NARRATION.md: expected the script between two '---' lines")
scenes = [" ".join(p.split()) for p in parts[1].strip().split("\n\n") if p.strip()]

vo = root / "vo"
vo.mkdir(exist_ok=True)
takes = sorted(int(d.name[5:]) for d in vo.glob("take-*") if d.name[5:].isdigit())
out = vo / f"take-{(takes[-1] if takes else 0) + 1}"
out.mkdir()

only = {int(a) for a in sys.argv[1:]}
if only and takes:  # a partial re-take starts from the latest full take
    for f in (vo / f"take-{takes[-1]}").iterdir():
        shutil.copy(f, out / f.name)

durations = {}
for i, text in enumerate(scenes, start=1):
    if only and i not in only:
        continue
    raw = out / f"s{i}.raw.mp3"
    cmd = CLI + ["text-to-speech", "convert", "--voice-id", VOICE_ID, "--model-id", MODEL_ID, "--text", text,
                 "--output-format", "mp3_44100_128", "--format", "raw", *SETTINGS]
    if i > 1:
        cmd += ["--previous-text", scenes[i - 2]]
    if i < len(scenes):
        cmd += ["--next-text", scenes[i]]
    with raw.open("wb") as f:
        subprocess.run(cmd, stdout=f, check=True)
    if raw.stat().st_size < 1000:
        sys.exit(f"scene {i}: response too small to be audio, see {raw}")
    wav = out / f"s{i}.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", "48000", str(wav)], check=True)
    raw.unlink()

for i in range(1, len(scenes) + 1):
    wav = out / f"s{i}.wav"
    if wav.exists():
        secs = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                               str(wav)], capture_output=True, text=True, check=True).stdout.strip()
        durations[f"s{i}"] = {"seconds": round(float(secs), 2), "text": scenes[i - 1]}

(out / "scenes.json").write_text(json.dumps({"voiceId": VOICE_ID, "model": MODEL_ID, "scenes": durations}, indent=1))
total = sum(d["seconds"] for d in durations.values())
print(f"{out.relative_to(root.parent)}: {len(durations)} scenes, {total:.1f} s of speech")
for k, d in durations.items():
    print(f"  {k}  {d['seconds']:5.1f} s  {d['text'][:70]}…")
