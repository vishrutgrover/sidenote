"""Make backend/media/*.mp3: every sample meeting read aloud by synthetic voices, each line placed at its
transcript time so the player and the transcript stay in step.

Needs macOS (the `say` command) and ffmpeg. Run from backend/:  python -m scripts.make_sample_audio
The mp3 files are committed, so nobody else needs to run this.
"""
import subprocess
import tempfile
import wave
from pathlib import Path

from app.seed import MEDIA_DIR, PAUSE_SEC, layout, slug
from app.seed_data import MEETINGS

# one voice per person, so the same person sounds the same in every meeting
VOICES = {"Vishrut Grover": "Rishi", "Maya Chen": "Samantha", "Arjun Rao": "Daniel", "Sofia Alvarez": "Karen",
          "Daniel Okafor": "Tara", "Priya Nair": "Moira", "Liam Walker": "Tessa"}


def length(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True)
    return float(out.stdout)


def speak(text: str, voice: str, slot: float, out: Path) -> None:
    """Speak text, speeding up until it fits in its time slot so lines never run into each other."""
    rate = 175
    for _ in range(4):
        subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", out, text], check=True)
        if length(out) <= slot:
            return
        rate = min(int(rate * length(out) / slot) + 5, 320)


RATE = 22050


def to_wav(src: Path) -> bytes:
    """Raw 16-bit mono samples of a clip."""
    wav = src.with_suffix(".wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", str(RATE), wav], check=True)
    with wave.open(str(wav)) as w:
        return w.readframes(w.getnframes())


def make(meeting: dict, workdir: Path) -> Path:
    times = layout([text for _, text in meeting["lines"]])
    track = bytearray()
    for i, ((who, text), (start, end)) in enumerate(zip(meeting["lines"], times)):
        clip = workdir / f"{i}.aiff"
        speak(text, VOICES[meeting["people"][who]], end - start, clip)
        track += b"\0\0" * max(0, int(start * RATE) - len(track) // 2)  # silence until this line starts
        track += to_wav(clip)
        if len(track) / 2 / RATE > end + 0.3:  # should not happen: speak() speeds lines up to fit
            print(f"  warning: line {i} of {meeting['title']!r} runs {len(track) / 2 / RATE - end:.1f}s over its slot")
    total = int(times[-1][1] + PAUSE_SEC)  # the same duration the seed stores
    track += b"\0\0" * max(0, total * RATE - len(track) // 2)

    full = workdir / "full.wav"
    with wave.open(str(full), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(track))
    out = MEDIA_DIR / f"{slug(meeting['title'])}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", full, "-b:a", "32k", out], check=True)
    return out


if __name__ == "__main__":
    MEDIA_DIR.mkdir(exist_ok=True)
    for meeting in MEETINGS:
        with tempfile.TemporaryDirectory() as tmp:
            out = make(meeting, Path(tmp))
        print(f"{out.name}: {out.stat().st_size // 1024} KB, {length(out):.1f}s")
