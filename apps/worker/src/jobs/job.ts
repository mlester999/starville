import type { ServiceLogger } from '../contracts.js';

export interface JobExecutionContext {
  readonly attempt: number;
  readonly logger: ServiceLogger;
}

export interface WorkerJob<TResult = void> {
  readonly name: string;
  execute(context: JobExecutionContext): Promise<TResult>;
}

export interface JobExecutionResult<TResult> {
  readonly attempts: number;
  readonly jobName: string;
  readonly value: TResult;
}
