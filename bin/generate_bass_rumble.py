#!/usr/bin/env python3
"""
Generate and play bass_rumble sound - notification sound for Claude Code stop hook.

Analysis of original:
- 48kHz, mono, 32-bit PCM
- ~1.55 seconds duration
- Two bass tones: 180 Hz + 220 Hz
- Envelope: 50ms attack, ~300ms sustain, exponential decay
- Peak amplitude ~0.38

Usage:
    python generate_bass_rumble.py          # play directly
    python generate_bass_rumble.py --save   # save to ../dotfiles/bass_rumble.wav
    python generate_bass_rumble.py out.wav  # save to specific path
"""

import numpy as np
import struct
import sys
import subprocess
import tempfile
from pathlib import Path


def generate_signal():
    """Generate the bass rumble signal."""
    sample_rate = 48000
    duration = 1.55

    t = np.linspace(0, duration, int(sample_rate * duration), dtype=np.float32)

    # Two bass tones ~180 Hz and ~220 Hz
    tone1 = np.sin(2 * np.pi * 180 * t)
    tone2 = np.sin(2 * np.pi * 220 * t)
    signal = (tone1 + tone2) * 0.5

    # Envelope: quick attack, sustain, exponential decay
    envelope = np.ones_like(t)
    envelope[t < 0.05] = t[t < 0.05] / 0.05  # 50ms attack
    decay_mask = t > 0.35
    envelope[decay_mask] = np.exp(-(t[decay_mask] - 0.35) / 0.1)

    signal = signal * envelope * 0.38

    return signal, sample_rate


def write_wav(signal, sample_rate, output_path):
    """Write signal to WAV file."""
    with open(output_path, 'wb') as f:
        signal_int32 = (signal * 2147483647).astype(np.int32)
        data_size = len(signal_int32) * 4
        f.write(b'RIFF' + struct.pack('<I', 36 + data_size) + b'WAVE')
        f.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 1, sample_rate, sample_rate * 4, 4, 32))
        f.write(b'data' + struct.pack('<I', data_size) + signal_int32.tobytes())


def play_signal(signal, sample_rate):
    """Play signal directly using afplay (macOS)."""
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        temp_path = f.name
        write_wav(signal, sample_rate, temp_path)

    try:
        subprocess.run(['afplay', temp_path], check=True)
    finally:
        Path(temp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    signal, sample_rate = generate_signal()

    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == '--save':
            script_dir = Path(__file__).parent
            output_path = script_dir.parent / "dotfiles" / "bass_rumble.wav"
            write_wav(signal, sample_rate, output_path)
            print(f"wrote {output_path}")
        else:
            write_wav(signal, sample_rate, arg)
            print(f"wrote {arg}")
    else:
        play_signal(signal, sample_rate)
