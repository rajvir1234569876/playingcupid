const SESSION_KEY = 'onematch_session';
const EVENT_KEY = 'onematch_event';

export interface SessionData {
  participantId: string;
  sessionToken: string;
  eventId: string;
  eventCode: string;
}

export function generateSessionToken(): string {
  return crypto.randomUUID();
}

export function saveSession(data: SessionData): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function getSession(): SessionData | null {
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(EVENT_KEY);
}

export function saveEventCode(code: string): void {
  localStorage.setItem(EVENT_KEY, code);
}

export function getEventCode(): string | null {
  return localStorage.getItem(EVENT_KEY);
}
