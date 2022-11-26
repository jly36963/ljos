// TODO: rename
export class LError extends Error {
  name = 'LError';
  constructor(msg?: string | null) {
    super(msg || 'ljos error');
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LError);
    }
  }
}
