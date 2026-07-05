// Voice transcription endpoint — proxies audio to a Whisper backend.
//
// Strategy (fallback order):
// 1. If VOICE_BACKEND_URL is set → forward blob there (local faster-whisper)
// 2. Else → return graceful stub with a friendly hint so the UI still works
//
// The real Arabic Whisper model runs at services/voice-transcribe (Sprint 4).

const VOICE_BACKEND_URL = process.env.VOICE_BACKEND_URL ?? '';

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return Response.json({ ok: false, error: 'expected multipart/form-data' }, { status: 400 });
  }

  if (!VOICE_BACKEND_URL) {
    // Graceful stub — returns an Arabic placeholder so the UI can be built
    // and tested before the Whisper backend is wired up.
    return Response.json({
      ok: true,
      text: '',
      hint: 'set VOICE_BACKEND_URL to enable transcription',
    });
  }

  const form = await req.formData();
  const audio = form.get('audio');
  if (!(audio instanceof Blob)) {
    return Response.json({ ok: false, error: 'missing audio blob' }, { status: 400 });
  }

  try {
    const forwardFd = new FormData();
    forwardFd.append('audio', audio, 'clip.webm');
    forwardFd.append('language', 'ar');
    const r = await fetch(`${VOICE_BACKEND_URL}/transcribe`, {
      method: 'POST',
      body: forwardFd,
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) {
      return Response.json({ ok: false, error: `backend ${r.status}` }, { status: 502 });
    }
    const data = await r.json();
    return Response.json({ ok: true, text: data.text ?? '' });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
