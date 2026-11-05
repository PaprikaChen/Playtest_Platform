# 0004: Post-session transcription with local Whisper by default

- **Status:** accepted (2026-11-05)
- **Context:** Voice is the core input ("think out loud"). Live browser captions (Web Speech API) work only in Chrome, send
  audio to Google, have estimated timestamps, and **cannot be tested automatically**: Chrome ignores the fake audio
  device. We have no API keys yet, and the spec targets replay within 1 s of the utterance.
- **Decision:** After each session, transcribe the whole recording, using word-level timestamps grouped into sentences.
  Providers sit behind one interface:
  - `local` (default): `onnx-community/whisper-base_timestamped` via transformers.js, audio decoded by `ffmpeg-static`.
    It runs in-process, is free, and keeps audio on our server.
  - `openai`: whisper-1 with word timestamps.
  - `assemblyai`
  - `none`

  The tester's browser language is passed to the provider. Live captions remain as an option, off by default.
- **Evidence:**
  - On the fixture, English phrase onsets are within 1 s of the true speech onsets (measured from signal energy), and
    Mandarin works too. Transcribing 26 s of audio takes about 1 s on an M-series Mac.
  - E2E: spoken sentences become recall cards matched to the right questions.
- **Consequences:**
  - Adds the native `onnxruntime-node` and an ~80 MB model download on first use.
  - Fine for a single server, but too heavy for serverless (for example, Vercel functions). A hosted deploy should set
    `TRANSCRIBE_PROVIDER=openai|assemblyai` or run a worker.
  - `whisper-base` accuracy is lower than API models on noisy or accented speech. Compare on real pilot audio (#17).
