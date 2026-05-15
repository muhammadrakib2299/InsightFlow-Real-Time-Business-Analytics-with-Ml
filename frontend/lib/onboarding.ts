'use client';

const EVENT_SENT_KEY = 'if.onboarding.eventSent';
const DISMISSED_KEY = 'if.onboarding.dismissed';

export function isEventMarkedSent(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(EVENT_SENT_KEY) === '1';
}

export function markEventSent(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(EVENT_SENT_KEY, '1');
}

export function isChecklistDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DISMISSED_KEY) === '1';
}

export function dismissChecklist(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DISMISSED_KEY, '1');
}

export function resetChecklist(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DISMISSED_KEY);
  window.localStorage.removeItem(EVENT_SENT_KEY);
}
