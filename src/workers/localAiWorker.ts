import {
  InterruptableStoppingCriteria,
  TextStreamer,
  env,
  pipeline,
  type TextGenerationPipeline,
} from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type WorkerCommand =
  | { type: 'load'; modelKey: string; hfModelId: string }
  | { type: 'generate'; modelKey: string; hfModelId: string; messages: ChatTurn[] }
  | { type: 'interrupt' }
  | { type: 'unload' };

let generator: TextGenerationPipeline | null = null;
let loadedModelKey: string | null = null;
let activeBackend: 'webgpu' | 'wasm' = 'wasm';
let activeStopping: InterruptableStoppingCriteria | null = null;

async function detectDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const nav = self.navigator as unknown as {
      gpu?: { requestAdapter: () => Promise<unknown> };
    };
    if (nav && nav.gpu) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    // Fall back to WASM when WebGPU is unavailable
  }
  return 'wasm';
}

async function ensureModelLoaded(modelKey: string, hfModelId: string): Promise<TextGenerationPipeline> {
  if (generator && loadedModelKey === modelKey) {
    return generator;
  }

  // Always free previous model from RAM first so 4 GB iPad 10 never holds two models
  if (generator) {
    try {
      await generator.dispose();
    } catch {
      // Ignore disposal errors
    }
    generator = null;
    loadedModelKey = null;
  }

  const preferredDevice = await detectDevice();

  const onProgress = (info: {
    status?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }) => {
    if (info.status === 'progress' || info.status === 'downloading') {
      const pct = typeof info.progress === 'number' ? Math.round(info.progress) : undefined;
      self.postMessage({
        type: 'progress',
        modelKey,
        file: info.file || '',
        progress: pct,
        loaded: info.loaded,
        total: info.total,
      });
    } else if (info.status === 'initiate') {
      self.postMessage({
        type: 'status',
        modelKey,
        message: `Preparing ${info.file || 'model files'}...`,
      });
    }
  };

  const loadWithDevice = async (device: 'webgpu' | 'wasm') => {
    self.postMessage({
      type: 'status',
      modelKey,
      message:
        device === 'webgpu'
          ? 'Loading quantized model into iPad GPU (WebGPU)...'
          : 'Loading quantized model into Safari memory (WASM)...',
    });
    return (await pipeline('text-generation', hfModelId, {
      device,
      dtype: 'q4',
      progress_callback: onProgress as never,
    })) as unknown as TextGenerationPipeline;
  };

  try {
    generator = await loadWithDevice(preferredDevice);
    activeBackend = preferredDevice;
  } catch (webgpuErr) {
    if (preferredDevice === 'webgpu') {
      // Automatic fallback to WASM if Safari WebGPU rejects buffer allocation
      generator = await loadWithDevice('wasm');
      activeBackend = 'wasm';
    } else {
      throw webgpuErr;
    }
  }

  loadedModelKey = modelKey;
  self.postMessage({
    type: 'ready',
    modelKey,
    backend: activeBackend,
  });
  return generator;
}

self.onmessage = async (event: MessageEvent<WorkerCommand>) => {
  const cmd = event.data;

  if (cmd.type === 'interrupt') {
    activeStopping?.interrupt();
    return;
  }

  if (cmd.type === 'unload') {
    activeStopping?.interrupt();
    if (generator) {
      try {
        await generator.dispose();
      } catch {
        // Ignore disposal error
      }
      generator = null;
    }
    loadedModelKey = null;
    self.postMessage({ type: 'unloaded' });
    return;
  }

  if (cmd.type === 'load') {
    try {
      await ensureModelLoaded(cmd.modelKey, cmd.hfModelId);
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (cmd.type === 'generate') {
    const startedAt = Date.now();
    try {
      const gen = await ensureModelLoaded(cmd.modelKey, cmd.hfModelId);
      const stopping = new InterruptableStoppingCriteria();
      activeStopping = stopping;

      let generatedChars = 0;
      const streamer = new TextStreamer(gen.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (chunk: string) => {
          if (chunk) {
            generatedChars += chunk.length;
            self.postMessage({ type: 'delta', text: chunk });
          }
        },
      });

      await gen(cmd.messages, {
        max_new_tokens: 512,
        do_sample: true,
        temperature: 0.6,
        top_p: 0.9,
        repetition_penalty: 1.08,
        streamer,
        stopping_criteria: [stopping],
      });

      activeStopping = null;
      self.postMessage({
        type: 'done',
        backend: activeBackend,
        latencyMs: Date.now() - startedAt,
        approxTokens: Math.max(1, Math.round(generatedChars / 4)),
      });
    } catch (err) {
      activeStopping = null;
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
