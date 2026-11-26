/** Thrown when a job is cancelled between two synthesis steps. */
export class CancelledError extends Error {
  constructor() {
    super('job cancelled');
    this.name = 'CancelledError';
  }
}
