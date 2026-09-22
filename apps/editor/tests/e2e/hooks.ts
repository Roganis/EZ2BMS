// What the ?e2e build exposes on window, typed for the tests.

export interface E2ENote {
  x: number;
  y: number;
  l: number;
}

export interface E2EApp {
  doc: {
    resolution: number;
    selection: { ids: Set<number> };
    index: { at(x: number, y: number): E2ENote[] };
  };
  backend: { readText(path: string): Promise<string> };
  project: { dir: string; save(slot: unknown): Promise<void> };
  slot: { file: string };
}

export interface E2EField {
  currentLayout: { lanes: { x: number; left: number; width: number }[] };
  yOf(pulse: number): number;
  pxPerPulse: number;
}

export type E2EWindow = Window & { __ez2bms: E2EApp; __ez2bmsField: E2EField };
