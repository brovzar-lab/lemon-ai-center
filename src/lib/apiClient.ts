import { useConnectionStore } from '@/stores/useConnectionStore'

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let errBody: any = {}
    try {
      errBody = await response.json()
    } catch {
      errBody = { error: { code: 'UNKNOWN', message: response.statusText, retryable: false } }
    }
    const err = errBody.error ?? {}
    // A dead Google connection is app-wide: raise the flag once so a single
    // "Reconnect Google" banner shows, instead of each panel failing silently.
    if ((err.code ?? '') === 'REAUTH_REQUIRED') {
      useConnectionStore.getState().setReauthRequired(true)
    }
    throw new ApiError(err.code ?? 'UNKNOWN', err.message ?? 'Request failed', err.retryable ?? false)
  }

  const json = await response.json()
  return json.data as T
}
