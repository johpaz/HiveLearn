/** API client básico para HiveLearn */

const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:8787'
  : '';

export interface ApiClientOptions extends Omit<RequestInit, 'body'> {
  showError?: boolean;
  body?: any;
}

export async function apiClient<T>(endpoint: string, options?: ApiClientOptions): Promise<T> {
  const { showError = true, body, ...fetchOptions } = options || {};
  
  // Asegurar que el endpoint empiece con /api
  const path = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  let processedBody = body;
  if (body && typeof body === 'object' && headers['Content-Type'] === 'application/json' && !(body instanceof Blob) && !(body instanceof FormData)) {
    processedBody = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      body: processedBody,
    });

    if (!response.ok) {
      const errorMsg = `API error: ${response.status} ${response.statusText}`;
      if (showError) {
        console.error(errorMsg);
      }
      throw new Error(errorMsg);
    }

    return response.json();
  } catch (error) {
    if (showError) {
      console.error('Fetch error:', error);
    }
    throw error;
  }
}


