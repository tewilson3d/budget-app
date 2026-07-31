const TOKEN_KEY = 'budget_access_token';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function startGoogleAuth(clientId: string, redirectUri: string): void {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    prompt: 'select_account',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Call this on the callback page to extract the token from the URL hash
export function handleAuthCallback(): string | null {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  if (token) {
    storeAccessToken(token);
    // Clean the hash from the URL
    history.replaceState(null, '', window.location.pathname);
  }
  return token;
}
