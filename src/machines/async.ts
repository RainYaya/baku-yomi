/**
 * The explicit shape of a one-shot async operation.
 *
 * Used for the small operations that used to be `loading` booleans plus an
 * error string: hint generation, translation optimization, speaker loading,
 * cache stats. Keeping `data` in the success state means the UI never has to
 * guess whether a value is stale.
 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

export const asyncIdle = <T>(): AsyncState<T> => ({ status: 'idle' });
export const asyncLoading = <T>(): AsyncState<T> => ({ status: 'loading' });
export const asyncSuccess = <T>(data: T): AsyncState<T> => ({
  status: 'success',
  data,
});
export const asyncError = <T>(message: string): AsyncState<T> => ({
  status: 'error',
  message,
});

export function isAsyncBusy<T>(state: AsyncState<T>): boolean {
  return state.status === 'loading';
}
