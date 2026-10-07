// AudioWorklet entry: runs the pure EngineSynth sample by sample. Loaded through
// `./engine-processor.ts?worker&url` so Vite bundles the dsp imports into it.
import { EngineSynth } from '@/audio/dsp/engine-synth';
import type { CarSoundProfile } from '@/audio/dsp/engine-profile';
import { ENGINE_PROCESSOR_NAME } from '@/audio/engine-constants';

// The DOM lib has no AudioWorkletGlobalScope typings; declare just what is used.
declare const sampleRate: number;
interface ProcessorOptions {
  processorOptions: { profile: CarSoundProfile; seed?: number };
}

declare function registerProcessor(name: string, ctor: new (options: ProcessorOptions) => unknown): void;
declare const AudioWorkletProcessor: new (options?: unknown) => { readonly port: MessagePort };

class EngineProcessor extends AudioWorkletProcessor {
  private readonly synth: EngineSynth;

  constructor(options: ProcessorOptions) {
    super(options);
    const { profile, seed } = options.processorOptions;
    this.synth = new EngineSynth(profile, sampleRate, seed ?? profile.seed);
  }

  static get parameterDescriptors(): Array<{
    name: string;
    defaultValue: number;
    minValue: number;
    maxValue: number;
    automationRate: 'a-rate' | 'k-rate';
  }> {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 0, maxValue: 12000, automationRate: 'a-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'limiter', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'cut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const exhaust = outputs[0]?.[0];
    const intake = outputs[1]?.[0];
    if (!exhaust || !intake) return true;
    this.synth.process(exhaust, intake, exhaust.length, {
      rpm: parameters.rpm,
      load: parameters.load,
      throttle: parameters.throttle[0],
      limiter: parameters.limiter[0],
      cut: parameters.cut[0],
    });
    return true;
  }
}

registerProcessor(ENGINE_PROCESSOR_NAME, EngineProcessor);
