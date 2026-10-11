const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiError {
  code: string;
  message: string;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.text();
  const json = payload ? JSON.parse(payload) : null;

  if (!response.ok || (json && json.success === false)) {
    const errorMsg = json?.error?.message || response.statusText || 'Request failed';
    throw new ApiRequestError(errorMsg, json?.error?.code || 'UNKNOWN_ERROR', response.status);
  }

  return json?.data !== undefined ? json.data : json;
}

export async function downloadApiFile(path: string, filename: string) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiRequestError(
      payload?.error?.message || response.statusText || 'Unable to download report.',
      payload?.error?.code || 'DOWNLOAD_ERROR',
      response.status,
    );
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
