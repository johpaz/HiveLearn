import type { Account, AgentConfig, GatewayProvider, InstallStatus, InstitutionSettings, ModelInfo, PortalProvider, Role } from './types'

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
  dashboard: () => request<{ stats: { students: number; teachers: number; diagnosed: number } }>(`${portal}/dashboard`),

  settings: () => request<{ settings: InstitutionSettings; providers: PortalProvider[] }>(`${portal}/settings`),
  saveSettings: (settings: InstitutionSettings) =>
    request<{ settings: InstitutionSettings }>(`${portal}/settings`, { method: 'PUT', body: settings }).then(r => r.settings),
  saveCredential: (providerId: string, apiKey: string) =>
    request<{ hasApiKey: boolean }>(`${portal}/providers/${encodeURIComponent(providerId)}/credential`, { method: 'PUT', body: { apiKey } }),

  gatewayProviders: () => request<{ providers: GatewayProvider[] }>('/api/providers').then(r => r.providers),
  setProviderEnabled: (providerId: string, enabled: boolean) =>
    request<unknown>(`/api/providers/${encodeURIComponent(providerId)}/enabled`, { method: 'PATCH', body: { enabled } }),
  providerModels: (providerId: string) =>
    request<{ models: ModelInfo[] }>(`/api/providers/${encodeURIComponent(providerId)}/details`).then(r => r.models),

  agents: () => request<{ agents: AgentConfig[] }>('/api/hivelearn/agents').then(r => r.agents),
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
