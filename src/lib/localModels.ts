import type { GeminiModelId } from '../types';

export type LocalModelId = 'local-smollm2-360m' | 'local-qwen25-500m';

export interface LocalModelSpec {
  id: LocalModelId;
  hfModelId: string;
  label: string;
  shortLabel: string;
  downloadSizeMb: number;
  downloadLabel: string;
  ramEstimateLabel: string;
  ipad10Note: string;
  summary: string;
}

export const LOCAL_MODEL_SPECS: Record<LocalModelId, LocalModelSpec> = {
  'local-smollm2-360m': {
    id: 'local-smollm2-360m',
    hfModelId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    label: 'SmolLM2 360M (In-Browser · ~230 MB)',
    shortLabel: 'SmolLM2 360M (Local)',
    downloadSizeMb: 230,
    downloadLabel: '~230 MB (cached once)',
    ramEstimateLabel: '~420 MB RAM',
    ipad10Note: 'Safest for iPad 10 (4 GB RAM)',
    summary: 'Lightest footprint for fast everyday Q&A, drafting, and offline chats with zero rate limits.',
  },
  'local-qwen25-500m': {
    id: 'local-qwen25-500m',
    hfModelId: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: 'Qwen 2.5 0.5B (In-Browser · ~380 MB)',
    shortLabel: 'Qwen 2.5 0.5B (Local)',
    downloadSizeMb: 380,
    downloadLabel: '~380 MB (cached once)',
    ramEstimateLabel: '~680 MB RAM',
    ipad10Note: 'Safe on iPad 10 (keep other heavy tabs closed)',
    summary: 'Sharper instructions & simple HTML/coding help directly on your device with zero rate limits.',
  },
};

export function isLocalModel(modelId: GeminiModelId | string): modelId is LocalModelId {
  return modelId === 'local-smollm2-360m' || modelId === 'local-qwen25-500m';
}

export function getLocalModelSpec(modelId: GeminiModelId | string): LocalModelSpec | null {
  if (isLocalModel(modelId)) {
    return LOCAL_MODEL_SPECS[modelId];
  }
  return null;
}
