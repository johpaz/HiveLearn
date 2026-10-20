import type { Account, AgentConfig, AgentModelsBody, ProgramState, ProgramIntentInput, NodeMaterialView, ReviewQueueItem, TeacherProgram, TraceEntry, SyncReport, Invitation, ImportPreview, StudentInput, GatewayProvider, InstallStatus, InstitutionSettings, ModelInfo, PortalProvider, Role } from './types'

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  })
  const text = await response.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* respuesta no JSON */ }
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error
    throw new ApiError(response.status, message ?? friendlyStatus(response.status))
  }
  return data as T
}

function friendlyStatus(status: number): string {
  if (status === 401) return 'Tu sesión terminó. Inicia sesión de nuevo.'
  if (status === 403) return 'No tienes permiso para esta operación.'
  if (status === 429) return 'Demasiados intentos. Espera un minuto.'
  if (status >= 500) return 'El servidor no pudo completar la operación.'
  return 'No se pudo completar la operación.'
}

const portal = '/api/portal'

export const api = {
  status: () => request<InstallStatus>(`${portal}/status`),
  me: () => request<{ account: Account }>(`${portal}/me`).then(r => r.account),
  login: (input: { username: string; password: string; role: Role }) =>
    request<{ account: Account }>(`${portal}/login`, { method: 'POST', body: input }).then(r => r.account),
  logout: () => request<{ ok: true }>(`${portal}/logout`, { method: 'POST', body: {} }),
  setup: (input: { name: string; institution: string; username: string; password: string }) =>
    request<{ account: Account }>(`${portal}/setup`, { method: 'POST', body: input }),
  activate: (input: { code: string; password: string }) => request<unknown>(`${portal}/activate`, { method: 'POST', body: input }),
  register: (input: { username: string; name: string; password: string; age: number }) =>
    request<{ account: Account; recoveryCode: string }>(`${portal}/register`, { method: 'POST', body: input }),
  recover: (input: { username: string; code: string; password: string }) =>
    request<unknown>(`${portal}/recover`, { method: 'POST', body: input }),
  dashboard: () => request<{ accounts: Account[]; stats: { students: number; teachers: number; diagnosed: number } }>(`${portal}/dashboard`),
  reset: (input: { code: string; password: string }) => request<unknown>(`${portal}/reset`, { method: 'POST', body: input }),

  createTeacher: (input: { username: string; name: string }) =>
    request<{ account: Account; activationCode: string }>(`${portal}/teachers`, { method: 'POST', body: input }),
  createStudents: (rows: StudentInput[]) =>
    request<{ invitations: Invitation[] }>(`${portal}/students`, { method: 'POST', body: { rows, authorized: true } }).then(r => r.invitations),
  previewImport: (file: File) => {
    const form = new FormData()
    form.set('file', file)
    return request<ImportPreview>(`${portal}/students/import/preview`, { method: 'POST', form })
  },
  importStudents: (file: File) => {
    const form = new FormData()
    form.set('file', file)
    form.set('authorized', 'true')
    return request<{ invitations: Invitation[] }>(`${portal}/students/import`, { method: 'POST', form }).then(r => r.invitations)
  },
  reissueInvitation: (accountId: string) =>
    request<{ username: string; name: string; activationCode: string }>(`${portal}/accounts/${encodeURIComponent(accountId)}/invitation`, { method: 'POST', body: {} }),
  issuePasswordReset: (accountId: string) =>
    request<{ username: string; name: string; resetCode: string }>(`${portal}/accounts/${encodeURIComponent(accountId)}/password-reset`, { method: 'POST', body: {} }),

  settings: () => request<{ settings: InstitutionSettings; providers: PortalProvider[] }>(`${portal}/settings`),
  saveSettings: (settings: InstitutionSettings) =>
    request<{ settings: InstitutionSettings }>(`${portal}/settings`, { method: 'PUT', body: settings }).then(r => r.settings),
  saveCredential: (providerId: string, apiKey: string) =>
    request<{ hasApiKey: boolean }>(`${portal}/providers/${encodeURIComponent(providerId)}/credential`, { method: 'PUT', body: { apiKey } }),

  modelSyncStatus: () => request<{ running: boolean; everyHours?: number; report: SyncReport | null }>(`${portal}/models/sync`),
  syncModels: (input: { providerId?: string; dryRun?: boolean } = {}) =>
    request<{ running: boolean; report: SyncReport | null }>(`${portal}/models/sync`, { method: 'POST', body: input }),

  // ── Programa formativo personal ──
  activeProgram: () => request<{ program: ProgramState | null }>(`${portal}/programs/active`).then(r => r.program),
  openProgram: (intent: ProgramIntentInput) => request<{ program: ProgramState }>(`${portal}/programs`, { method: 'POST', body: intent }).then(r => r.program),
  programMaterial: (programId: string, nodeId: string) =>
    request<{ material: NodeMaterialView }>(`${portal}/programs/${encodeURIComponent(programId)}/material/${encodeURIComponent(nodeId)}`).then(r => r.material),
  answerNode: (programId: string, body: { nodeId: string; choice: number; open?: string }) =>
    request<{ correct: boolean; mastered: boolean; hint: string | null; program: ProgramState }>(`${portal}/programs/${encodeURIComponent(programId)}/answer`, { method: 'POST', body }),
  checkpointProgram: (programId: string) =>
    request<{ decision: 'advance' | 'hold' | 'teacher_review'; reason: string; program: ProgramState }>(`${portal}/programs/${encodeURIComponent(programId)}/checkpoint`, { method: 'POST', body: {} }),
  prepareLevel: (programId: string) => request<{ program: ProgramState }>(`${portal}/programs/${encodeURIComponent(programId)}/prepare`, { method: 'POST', body: {} }).then(r => r.program),
  closeProgram: (programId: string) => request<{ program: ProgramState }>(`${portal}/programs/${encodeURIComponent(programId)}/close`, { method: 'POST', body: {} }).then(r => r.program),
  programAnalytics: (topic?: string) =>
    request<{ weakNodes: Array<{ title: string; topic: string; students: number; attempts: number; firstTryRate: number; masteryRate: number }> }>(`${portal}/programs/analytics${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`).then(r => r.weakNodes),
  eraseAccount: (accountId: string, confirm: string) =>
    request<{ report: { removed: Record<string, number> } }>(`${portal}/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE', body: { confirm } }),
  reviewQueue: () => request<{ queue: ReviewQueueItem[] }>(`${portal}/programs/review-queue`).then(r => r.queue),
  teacherProgram: (programId: string) => request<{ program: TeacherProgram }>(`${portal}/programs/${encodeURIComponent(programId)}`).then(r => r.program),
  programTrace: (programId: string) => request<{ thread: { timeline: TraceEntry[] } }>(`${portal}/programs/${encodeURIComponent(programId)}/trace`).then(r => r.thread.timeline),
  reviewProgram: (programId: string, body: { decision: 'reaffirm' | 'modify' | 'revoke'; nodeId?: string; correctedScore?: number; note: string }) =>
    request<{ program: TeacherProgram }>(`${portal}/programs/${encodeURIComponent(programId)}/review`, { method: 'POST', body }),

  gatewayProviders: () => request<{ providers: GatewayProvider[] }>('/api/providers').then(r => r.providers),
  setProviderEnabled: (providerId: string, enabled: boolean) =>
    request<unknown>(`/api/providers/${encodeURIComponent(providerId)}/enabled`, { method: 'PATCH', body: { enabled } }),
  providerModels: (providerId: string) =>
    request<{ models: ModelInfo[] }>(`/api/providers/${encodeURIComponent(providerId)}/details`).then(r => r.models),

  agents: () => request<{ agents: AgentConfig[] }>('/api/hivelearn/agents').then(r => r.agents),
  /** Guarda en bloque (atómico): un modelo para todos los agentes, o varios cambios individuales. */
  saveAgentModels: (body: AgentModelsBody) =>
    request<{ updated: string[]; skipped: string[] }>(`${portal}/agents/models`, { method: 'PUT', body }),
  saveAgent: (agent: AgentConfig) =>
    request<{ ok: true }>(`/api/hivelearn/agents/${encodeURIComponent(agent.id)}`, {
      method: 'PUT',
      // El gateway reemplaza todos estos campos: se envían los actuales para no borrar el prompt.
      body: {
        provider_id: agent.provider_id,
        model_id: agent.model_id,
        max_iterations: agent.max_iterations,
        enabled: agent.enabled,
        system_prompt: agent.system_prompt ?? undefined,
      },
    }),
}
