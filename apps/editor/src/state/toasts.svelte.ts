// Short messages in the corner. Errors stay a little longer.

export type ToastKind = 'info' | 'ok' | 'warn' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: ToastAction;
}

class Toasts {
  list = $state<Toast[]>([]);
  private next = 1;

  push(
    text: string,
    kind: ToastKind = 'info',
    ms = kind === 'error' ? 6000 : 2600,
    action?: ToastAction,
  ): void {
    const id = this.next++;
    this.list.push({ id, kind, text, ...(action ? { action } : {}) });
    setTimeout(() => this.dismiss(id), action ? Math.max(ms, 15000) : ms);
  }

  dismiss(id: number): void {
    const i = this.list.findIndex((t) => t.id === id);
    if (i >= 0) this.list.splice(i, 1);
  }
}

export const toasts = new Toasts();
export const toast = (text: string, kind?: ToastKind) => toasts.push(text, kind);
/** A toast with a button (e.g. Recover). */
export const ask = (text: string, action: ToastAction, kind: ToastKind = 'warn') =>
  toasts.push(text, kind, 15000, action);
