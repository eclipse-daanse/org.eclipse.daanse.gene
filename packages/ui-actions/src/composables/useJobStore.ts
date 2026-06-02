/**
 * Job Store — Singleton composable for tracking all action jobs (sync + async)
 */

import { ref, computed } from 'tsm:vue'
import type { Job, JobState } from '../types'

let _instance: ReturnType<typeof createJobStore> | null = null

function createJobStore() {
  const jobs = ref<Job[]>([])

  const runningJobs = computed(() =>
    jobs.value.filter(j => j.status === 'QUEUED' || j.status === 'RUNNING')
  )

  const runningCount = computed(() => runningJobs.value.length)

  const completedJobs = computed(() =>
    jobs.value.filter(j => j.status === 'COMPLETED' || j.status === 'FAILED' || j.status === 'CANCELED')
  )

  function addJob(job: Job): void {
    jobs.value = [job, ...jobs.value]
  }

  function updateJob(jobId: string, updates: Partial<Job>): void {
    const idx = jobs.value.findIndex(j => j.id === jobId)
    if (idx >= 0) {
      jobs.value[idx] = { ...jobs.value[idx], ...updates }
      // Trigger reactivity
      jobs.value = [...jobs.value]
    }
  }

  function getJob(jobId: string): Job | undefined {
    return jobs.value.find(j => j.id === jobId)
  }

  function cancelJob(jobId: string): void {
    updateJob(jobId, { status: 'CANCELED', completedAt: new Date() })
  }

  function clearCompleted(): void {
    jobs.value = jobs.value.filter(j => j.status === 'QUEUED' || j.status === 'RUNNING')
  }

  return {
    jobs,
    runningJobs,
    runningCount,
    completedJobs,
    addJob,
    updateJob,
    getJob,
    cancelJob,
    clearCompleted
  }
}

export function useJobStore() {
  if (!_instance) {
    _instance = createJobStore()
  }
  return _instance
}
