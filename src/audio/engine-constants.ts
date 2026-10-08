/** Registered name of the engine AudioWorkletProcessor (shared by processor and loader). */
export const ENGINE_PROCESSOR_NAME = 'bathurst-engine';
/** Port message asking the engine processor to end; it answers ENGINE_STOPPED from its last process() call. */
export const ENGINE_STOP = 'stop';
export const ENGINE_STOPPED = 'stopped';
