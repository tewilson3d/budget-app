const STORAGE_KEY = 'budget_app_access_key'

export function readAccessKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? ''
}

export function saveAccessKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim())
}

export function clearAccessKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function captureAccessKeyFromUrl(): string {
  const url = new URL(window.location.href)
  const supplied = url.searchParams.get('key')?.trim()
  if (supplied) {
    saveAccessKey(supplied)
    url.searchParams.delete('key')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    return supplied
  }
  return readAccessKey()
}

export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = readAccessKey()
  return key ? { ...extra, 'X-Budget-Key': key } : extra
}
