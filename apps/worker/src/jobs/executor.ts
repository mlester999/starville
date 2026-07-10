import type { RetryPolicy, ServiceLogger } from '../contracts.js';
import type { JobExecutionResult, WorkerJob } from './job.js';

type Delay = (milliseconds: number) => Promise<void>;

const delay: Delay = async (milliseconds) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

function assertRetryPolicy(policy: RetryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new RangeError('Retry maxAttempts must be a positive integer.');
  }

  if (!Number.isInteger(policy.baseDelayMs) || policy.baseDelayMs < 0) {
    throw new RangeError('Retry baseDelayMs must be a non-negative integer.');
  }
}

export async function executeJobWithRetry<TResult>(
  job: WorkerJob<TResult>,
  policy: RetryPolicy,
  logger: ServiceLogger,
  wait: Delay = delay,
): Promise<JobExecutionResult<TResult>> {
  assertRetryPolicy(policy);
  const jobLogger = logger.child({ jobName: job.name });

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const value = await job.execute({ attempt, logger: jobLogger });
      jobLogger.info('worker.job.completed', { attempt });
      return { attempts: attempt, jobName: job.name, value };
    } catch (error) {
      const willRetry = attempt < policy.maxAttempts;
      jobLogger.warn('worker.job.failed', { attempt, error, willRetry });

      if (!willRetry) {
        throw error;
      }

      await wait(policy.baseDelayMs * attempt);
    }
  }

  throw new Error('Job retry loop ended unexpectedly.');
}
