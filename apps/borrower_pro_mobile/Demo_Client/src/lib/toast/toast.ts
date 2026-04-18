/**
 * Singleton toast API — call `toast(...)` from anywhere (components, hooks, async
 * callbacks, even outside React). The currently-mounted `<ToastProvider />` registers
 * itself with this module on mount; calls made before the provider mounts are
 * dropped with a warning in dev.
 *
 * Mirrors the surface of `sonner` on the web side so the mental model stays the
 * same when reading either codebase.
 */

export type ToastType = 'default' | 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

export interface ToastOptions {
  /** Optional secondary line under the message. */
  description?: string;
  /** Auto-dismiss after `duration` ms. Pass `0` to disable auto-dismiss. */
  duration?: number;
  /** Optional inline action button (e.g. Undo). */
  action?: ToastAction;
  /** Reuse an id to update / replace an existing toast. */
  id?: string;
}

export interface ToastInput extends ToastOptions {
  type: ToastType;
  message: string;
}

export interface ToastInstance extends ToastInput {
  id: string;
  createdAt: number;
}

type ShowFn = (input: ToastInput) => string;
type DismissFn = (id?: string) => void;

let registeredShow: ShowFn | null = null;
let registeredDismiss: DismissFn | null = null;

/** Internal — wired up by `<ToastProvider />`. Do not call directly from app code. */
export function _registerToastHandlers(
  handlers: { show: ShowFn; dismiss: DismissFn } | null,
) {
  registeredShow = handlers?.show ?? null;
  registeredDismiss = handlers?.dismiss ?? null;
}

function emit(input: ToastInput): string {
  if (!registeredShow) {
    if (__DEV__) {
      console.warn(
        '[toast] toast() called before <ToastProvider /> mounted — message dropped:',
        input.message,
      );
    }
    return '';
  }
  return registeredShow(input);
}

/**
 * Show a toast.
 *
 * @example
 * toast('Email copied');
 * toast.success('Saved', { description: 'Profile updated.' });
 * toast.error('Network error', { duration: 6000 });
 */
export const toast = Object.assign(
  (message: string, options?: ToastOptions) => emit({ ...options, type: 'default', message }),
  {
    success: (message: string, options?: ToastOptions) =>
      emit({ ...options, type: 'success', message }),
    error: (message: string, options?: ToastOptions) =>
      emit({ ...options, type: 'error', message }),
    info: (message: string, options?: ToastOptions) =>
      emit({ ...options, type: 'info', message }),
    warning: (message: string, options?: ToastOptions) =>
      emit({ ...options, type: 'warning', message }),
    /** Dismiss a toast by id, or all toasts if no id is passed. */
    dismiss: (id?: string) => {
      registeredDismiss?.(id);
    },
  },
);
