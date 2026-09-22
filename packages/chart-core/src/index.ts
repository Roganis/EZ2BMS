// @ez2bms/chart-core - public surface. Everything here is pure TypeScript with
// no DOM and no Tauri: it runs the same in the editor, in Vitest and in Node.
export const CHART_CORE_VERSION = '0.1.0';

export * from './model/types';
export * from './model/defaults';
export * from './modes/ids';
export * from './io/text';
export * from './io/bmson/parse';
export * from './io/bmson/serialize';
export * from './io/bmson/mode-resolve';
export * from './io/bmson/legacy-remap';
export { stableStringify, JsonValueError } from './util/stable-json';
export * from './timing/timing-map';
export * from './timing/ticks';
export * from './timing/engine-tempo';
export * from './timing/measures';
export * from './timing/snap';
export * from './timing/rescale';
export * from './io/ez/ezff';
export { lowerBound, upperBound } from './util/sorted';
