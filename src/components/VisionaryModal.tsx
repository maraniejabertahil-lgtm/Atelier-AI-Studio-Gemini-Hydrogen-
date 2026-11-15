import React, { useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Film,
  Link as LinkIcon,
  Play,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { ChatAttachment, GeminiModelId } from '../types';
import { isLocalModel } from '../lib/localModels';
import { extractFramesFromVideoFile, extractFramesFromZipFile } from '../lib/videoFrames';

interface VisionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: GeminiModelId;
  onSwitchToVisionModel: () => void;
  onSendToStudio: (prompt: string, attachments: ChatAttachment[]) => void;
}

type VisionaryTab = 'video' | 'zip' | 'url';
type GoalPreset = 'replicate' | 'breakdown' | 'custom';

const GOAL_PROMPTS: Record<Exclude<GoalPreset, 'custom'>, string> = {
  replicate:
    'Analyze these video frames in chronological order. Break down the UI structure, typography, colors, spacing, and frame-by-frame movement/animation timing, then give me the complete, copy-ready code (HTML, CSS/Tailwind, and JS) to recreate this cleanly in a web project.',
  breakdown:
    'Analyze these video frames step-by-step in chronological order. Explain in plain English what changes from frame to frame, how the layout and animations work, and list every key UI component and timing detail.',
};

export const VisionaryModal: React.FC<VisionaryModalProps> = ({
  isOpen,
  onClose,
  currentModel,
  onSwitchToVisionModel,
  onSendToStudio,
}) => {
  const [tab, setTab] = useState<VisionaryTab>('video');
  const [fps, setFps] = useState<number>(1);
  const [maxFrames, setMaxFrames] = useState<number>(12);
  const [urlInput, setUrlInput] = useState('');
  const [goalPreset, setGoalPreset] = useState<GoalPreset>('replicate');
  const [customGoal, setCustomGoal] = useState('');
  const [frames, setFrames] = useState<ChatAttachment[]>([]);
  const [youtubeInfo, setYoutubeInfo] = useState<{
    canonicalUrl: string;
    title: string;
    authorName: string;
  } | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const localTextOnly = isLocalModel(currentModel);

  const handleVideoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setYoutubeInfo(null);
    setProgressPct(5);
    setStatusMsg(`Slicing frames from ${file.name}...`);

    try {
      const res = await extractFramesFromVideoFile(file, {
        fps,
        maxFrames,
        onProgress: (pct) => setProgressPct(pct),
      });
      setFrames(res.frames);
      setStatusMsg(
        `Extracted ${res.frames.length} frames (${Math.round(res.durationSec)}s video${res.usedServerFfmpeg ? ' via server ffmpeg' : ' in browser'}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to extract frames from video.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleZipPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setYoutubeInfo(null);
    setProgressPct(null);
    setStatusMsg(`Extracting frames from ${file.name}...`);

    try {
      const res = await extractFramesFromZipFile(file, maxFrames);
      setFrames(res.frames);
      setStatusMsg(
        `Loaded ${res.frames.length} of ${res.totalFound} image frames from ${file.name}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to extract ZIP frames.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUrlLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setYoutubeInfo(null);
    setFrames([]);
    setProgressPct(null);

    const isYouTube =
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i.test(
        cleanUrl
      );

    try {
      if (isYouTube) {
        setStatusMsg('Inspecting YouTube video for multimodal vision...');
        const resp = await fetch('/api/studio/visionary/youtube-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: cleanUrl }),
        });
        const data = (await resp.json()) as {
          canonicalUrl?: string;
          title?: string;
          authorName?: string;
          thumbnailAttachment?: ChatAttachment | null;
          error?: string;
        };
        if (!resp.ok || !data.canonicalUrl) {
          throw new Error(data.error || 'Could not load YouTube video info.');
        }
        setYoutubeInfo({
          canonicalUrl: data.canonicalUrl,
          title: data.title || 'YouTube Video',
          authorName: data.authorName || '',
        });
        setFrames(data.thumbnailAttachment ? [data.thumbnailAttachment] : []);
        setStatusMsg(`Ready to analyze "${data.title}" directly with Gemini.`);
      } else {
        setStatusMsg('Slicing frames from video URL via server ffmpeg...');
        const resp = await fetch('/api/studio/visionary/extract-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: cleanUrl, fps, maxFrames }),
        });
        const data = (await resp.json()) as {
          frames?: ChatAttachment[];
          durationSec?: number;
          error?: string;
        };
        if (!resp.ok || !data.frames) {
          throw new Error(data.error || 'Could not slice frames from this video URL.');
        }
        setFrames(data.frames);
        setStatusMsg(`Extracted ${data.frames.length} frames via server ffmpeg.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to inspect URL.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = async () => {
    if (frames.length === 0) return;
    try {
      const resp = await fetch('/api/studio/visionary/pack-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: frames.map((f) => ({ name: f.name, data: f.data })),
        }),
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'visionary-frames.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore download error
    }
  };

  const handleSubmitToStudio = () => {
    if (frames.length === 0 && !youtubeInfo) return;
    if (localTextOnly) {
      onSwitchToVisionModel();
    }

    const basePrompt =
      goalPreset === 'custom'
        ? customGoal.trim() || GOAL_PROMPTS.replicate
        : GOAL_PROMPTS[goalPreset];

    const finalPrompt = youtubeInfo
      ? `${basePrompt}\n\nVideo: "${youtubeInfo.title}"${youtubeInfo.authorName ? ` by ${youtubeInfo.authorName}` : ''} (${youtubeInfo.canonicalUrl})`
      : basePrompt;

    const outgoingAttachments: ChatAttachment[] = youtubeInfo
      ? [
          {
            id: `yt-video-${Date.now()}`,
            name: youtubeInfo.title,
            mimeType: 'video/youtube',
            data: youtubeInfo.canonicalUrl,
            isText: false,
            size: 0,
          },
          ...frames,
        ]
      : frames;

    onSendToStudio(finalPrompt, outgoingAttachments);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Visionary Module
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Slice videos or frame ZIPs inside your studio—no Python or terminal needed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close Visionary Module"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {localTextOnly && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
              <span>
                In-browser small models are text-only and cannot see video frames. Switch to Gemini Vision to analyze frames.
              </span>
              <button
                type="button"
                onClick={onSwitchToVisionModel}
                className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium cursor-pointer shrink-0"
              >
                Switch to gemini-4-hydrogen
              </button>
            </div>
          )}

          {/* Source Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setTab('video')}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium cursor-pointer ${
                tab === 'video'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Video File</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('zip')}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium cursor-pointer ${
                tab === 'zip'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Frames .zip</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('url')}
              className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium cursor-pointer ${
                tab === 'url'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Video / YouTube URL</span>
            </button>
          </div>

          {/* Extraction Settings (for Video / URL / ZIP) */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Capture Rate
              </label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100"
              >
                <option value={0.5}>Every 2 seconds (0.5 fps)</option>
                <option value={1}>Every 1 second (1 fps)</option>
                <option value={2}>2 frames/sec (2 fps)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                Max Frames
              </label>
              <select
                value={maxFrames}
                onChange={(e) => setMaxFrames(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100"
              >
                <option value={8}>8 frames (Fastest · Low Quota)</option>
                <option value={12}>12 frames (Balanced)</option>
                <option value={16}>16 frames (Detailed)</option>
                <option value={24}>24 frames (High Detail)</option>
              </select>
            </div>
          </div>

          {/* Tab Panel */}
          {tab === 'video' && (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0D1017] p-5 text-center space-y-2.5">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Pick any <code className="font-mono">.mp4</code>, <code className="font-mono">.mov</code>, <code className="font-mono">.webm</code>, or iPad Screen Recording. Frames slice right inside your studio.
              </p>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Extracting...' : 'Choose Video / Screen Recording'}</span>
              </button>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoPick}
                className="hidden"
              />
            </div>
          )}

          {tab === 'zip' && (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0D1017] p-5 text-center space-y-2.5">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Upload a <code className="font-mono">.zip</code> folder of <code className="font-mono">.jpg</code> or <code className="font-mono">.png</code> frames (such as <code className="font-mono">frame_0001.jpg</code>) to preview and analyze them in order.
              </p>
              <button
                type="button"
                onClick={() => zipInputRef.current?.click()}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Unpacking ZIP...' : 'Choose Frames .zip'}</span>
              </button>
              <input
                ref={zipInputRef}
                type="file"
                onChange={handleZipPick}
                className="hidden"
              />
            </div>
          )}

          {tab === 'url' && (
            <form onSubmit={handleUrlLoad} className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="url"
                  required
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://youtu.be/... or direct .mp4 / .webm video URL"
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isProcessing || !urlInput.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white cursor-pointer shrink-0"
                >
                  {isProcessing ? 'Loading...' : 'Load Video'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Direct <code className="font-mono">.mp4/.webm</code> URLs are sliced into frames via server <code className="font-mono">ffmpeg</code>. Public YouTube links pass straight to Gemini Vision (for frame-by-frame UI cloning on iPad, screen-recording the YouTube clip and dropping it in <strong>Video File</strong> gives exact frame strips).
              </p>
            </form>
          )}

          {/* Status & Progress */}
          {(statusMsg || errorMsg || progressPct !== null) && (
            <div className="space-y-1.5">
              {statusMsg && !errorMsg && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}
              {typeof progressPct === 'number' && isProcessing && (
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${Math.min(100, Math.max(5, progressPct))}%` }}
                  />
                </div>
              )}
              {errorMsg && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* Extracted Frame Strip Preview */}
          {frames.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                  Preview ({frames.length} {frames.length === 1 ? 'frame' : 'frames'})
                </span>
                {!youtubeInfo && (
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Download frames.zip
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
                {frames.map((frame) => (
                  <div
                    key={frame.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-900"
                  >
                    <img
                      src={`data:${frame.mimeType};base64,${frame.data}`}
                      alt={frame.name}
                      className="w-full h-20 object-cover"
                    />
                    <div className="px-1.5 py-1 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {frame.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis Goal */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              What should the studio do with these frames?
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'replicate', label: 'Replicate UI & Code' },
                  { id: 'breakdown', label: 'Motion & Layout Breakdown' },
                  { id: 'custom', label: 'Custom Instruction' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGoalPreset(opt.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer ${
                    goalPreset === opt.id
                      ? 'border-blue-500/40 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            {goalPreset === 'custom' && (
              <textarea
                rows={2}
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                placeholder="Describe what you want generated from these frames..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0F131C] flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {frames.length > 0 || youtubeInfo
              ? 'Ready to analyze inside Prompt Lab'
              : 'Load a video, frames ZIP, or URL first'}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitToStudio}
              disabled={isProcessing || (frames.length === 0 && !youtubeInfo)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Analyze in Studio</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
