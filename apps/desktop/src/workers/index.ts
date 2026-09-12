/**
 * Issue 2 reserves the worker boundary without moving privileged application
 * authority into a worker. Export/search/render workers are introduced only
 * by later architecture issues.
 */
export const MARKHERE_WORKER_BOUNDARY = 'reserved' as const
