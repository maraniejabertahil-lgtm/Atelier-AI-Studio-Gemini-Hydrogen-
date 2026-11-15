import type { ChatAttachment } from '../types';

export interface ExtractedFrameResult {
  frames: ChatAttachment[];
  durationSec: number;
  usedServerFfmpeg?: boolean;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export async function extractFramesFromZipFile(
  file: File,
  maxFrames = 16
): Promise<{ totalFound: number; frames: ChatAttachment[] }> {
  const zipBase64 = await fileToBase64(file);
  const resp = await fetch('/api/studio/visionary/extract-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zipBase64, maxFrames }),
  });
  const data = (await resp.json()) as {
    ok?: boolean;
    totalFound?: number;
    frames?: ChatAttachment[];
    error?: string;
  };
  if (!resp.ok || !data.frames) {
    throw new Error(data.error || 'Could not extract image frames from ZIP.');
  }
  return {
    totalFound: data.totalFound ?? data.frames.length,
    frames: data.frames,
  };
}

/**
 * Extracts evenly spaced JPEG frames directly inside the iPad/desktop browser
 * using HTML5 <video> + <canvas> (no terminal/Python required). Falls back to
 * server-side ffmpeg if the browser cannot decode the video codec.
 */
export async function extractFramesFromVideoFile(
  file: File,
  options: { fps?: number; maxFrames?: number; onProgress?: (pct: number) => void } = {}
): Promise<ExtractedFrameResult> {
  const fps = Math.min(4, Math.max(0.25, options.fps ?? 1));
  const maxFrames = Math.min(24, Math.max(1, options.maxFrames ?? 12));

  try {
    return await extractFramesInBrowser(file, fps, maxFrames, options.onProgress);
  } catch {
    // Fallback to server ffmpeg if Safari/browser rejects the video codec
    options.onProgress?.(20);
    const videoBase64 = await fileToBase64(file);
    const resp = await fetch('/api/studio/visionary/extract-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoBase64,
        filename: file.name,
        fps,
        maxFrames,
      }),
    });
    const data = (await resp.json()) as {
      frames?: ChatAttachment[];
      durationSec?: number;
      error?: string;
    };
    if (!resp.ok || !data.frames || data.frames.length === 0) {
      throw new Error(data.error || 'Failed to extract frames from this video.');
    }
    options.onProgress?.(100);
    return {
      frames: data.frames,
      durationSec: data.durationSec || data.frames.length / fps,
      usedServerFfmpeg: true,
    };
  }
}

function extractFramesInBrowser(
  file: File,
  fps: number,
  maxFrames: number,
  onProgress?: (pct: number) => void
): Promise<ExtractedFrameResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    const fail = (msg: string) => {
      cleanup();
      reject(new Error(msg));
    };

    video.onerror = () => fail('Browser video decoder could not open this video.');

    video.onloadedmetadata = async () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const width = video.videoWidth || 960;
      const height = video.videoHeight || 540;
      const scale = Math.min(1, 960 / Math.max(width, 1));
      const targetW = Math.max(160, Math.round(width * scale));
      const targetH = Math.max(90, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        fail('Canvas 2D context unavailable.');
        return;
      }

      const step = 1 / fps;
      const candidateTimes: number[] = [];
      for (let t = 0; t < duration && candidateTimes.length < maxFrames * 4; t += step) {
        candidateTimes.push(Math.min(duration - 0.05, Math.max(0, t)));
      }
      if (candidateTimes.length === 0) candidateTimes.push(0);

      // Evenly downsample if video has more candidate seconds than maxFrames
      const selectedTimes: number[] = [];
      if (candidateTimes.length <= maxFrames) {
        selectedTimes.push(...candidateTimes);
      } else {
        for (let i = 0; i < maxFrames; i++) {
          const idx = Math.min(
            candidateTimes.length - 1,
            Math.floor((i * candidateTimes.length) / maxFrames)
          );
          selectedTimes.push(candidateTimes[idx]);
        }
      }

      const frames: ChatAttachment[] = [];

      const seekTo = (t: number) =>
        new Promise<void>((res, rej) => {
          const timer = window.setTimeout(() => rej(new Error('Seek timeout')), 5000);
          video.onseeked = () => {
            window.clearTimeout(timer);
            res();
          };
          video.currentTime = t;
        });

      try {
        for (let i = 0; i < selectedTimes.length; i++) {
          await seekTo(selectedTimes[i]);
          ctx.drawImage(video, 0, 0, targetW, targetH);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const base64 = dataUrl.split(',')[1] || '';
          const secLabel = selectedTimes[i].toFixed(1).replace(/\.0$/, '');
          frames.push({
            id: `frame-${Date.now()}-${i}`,
            name: `frame_${String(i + 1).padStart(4, '0')}_${secLabel}s.jpg`,
            mimeType: 'image/jpeg',
            data: base64,
            isText: false,
            size: Math.round((base64.length * 3) / 4),
          });
          onProgress?.(Math.round(((i + 1) / selectedTimes.length) * 100));
        }
        cleanup();
        resolve({ frames, durationSec: duration, usedServerFfmpeg: false });
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Frame capture failed.');
      }
    };
  });
}
