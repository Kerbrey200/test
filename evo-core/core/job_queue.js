/**
 * EVO-CORE SERIAL JOB QUEUE
 * Runs long operations (ratchet trials, test runs, rollbacks) one at a time,
 * because they share one git working tree, while the HTTP server stays responsive.
 */

import crypto from 'node:crypto';

const MAX_PROGRESS_EVENTS = 500;

export class JobQueue {
  constructor({ maxJobs = 50 } = {}) {
    this.maxJobs = maxJobs;
    this.jobs = new Map();
    this.tail = Promise.resolve();
    this.pending = 0;
  }

  /**
   * Schedules a job and returns its public view immediately.
   * @param {string} kind Short label (e.g. 'ratchet.step')
   * @param {(ctx: {progress: (event: object) => void}) => Promise<any>} fn Work to run; may report progress
   */
  enqueue(kind, fn) {
    const job = {
      id: crypto.randomUUID(),
      kind,
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      progress: [],
      result: null,
      error: null
    };
    const progress = (event) => {
      job.progress.push(event);
      if (job.progress.length > MAX_PROGRESS_EVENTS) job.progress.shift();
    };
    this.jobs.set(job.id, job);
    this.prune();
    this.pending++;

    job.promise = this.tail.then(async () => {
      job.status = 'running';
      job.startedAt = new Date().toISOString();
      try {
        job.result = await fn({ progress });
        job.status = 'done';
      } catch (err) {
        job.error = err?.message || String(err);
        job.status = 'failed';
      } finally {
        job.finishedAt = new Date().toISOString();
        this.pending--;
      }
      return job;
    });
    this.tail = job.promise;
    return JobQueue.view(job);
  }

  /**
   * Enqueues and waits for completion (for short operations that must not overlap trials).
   */
  async run(kind, fn) {
    const { id } = this.enqueue(kind, fn);
    const job = await this.jobs.get(id).promise;
    return JobQueue.view(job);
  }

  get(id) {
    const job = this.jobs.get(id);
    return job ? JobQueue.view(job) : null;
  }

  list() {
    return [...this.jobs.values()].reverse().map(job => ({ ...JobQueue.view(job), result: undefined, progress: undefined }));
  }

  get running() {
    return [...this.jobs.values()].some(job => job.status === 'running');
  }

  /**
   * Resolves once every scheduled job has finished.
   */
  idle() {
    return this.tail.then(() => undefined);
  }

  prune() {
    if (this.jobs.size <= this.maxJobs) return;
    for (const [id, job] of this.jobs) {
      if (this.jobs.size <= this.maxJobs) break;
      if (job.status === 'done' || job.status === 'failed') this.jobs.delete(id);
    }
  }

  static view(job) {
    const { promise, ...rest } = job;
    return { ...rest, progress: [...job.progress] };
  }
}
