import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimeoutOptions {
  /** Idle duration before warning (ms). Default: 25 min */
  idleMs?: number;
  /** Extra grace period after warning before logout (ms). Default: 5 min */
  warningMs?: number;
  /** Called when the user is logged out due to inactivity */
  onLogout: () => void;
}

/**
 * Tracks user activity (mouse, keyboard, touch, scroll) and
 * triggers a warning + auto-logout after prolonged inactivity.
 *
 * Returns:
 *   - showWarning: true when idle but still in grace period
 *   - secondsLeft: countdown until auto-logout
 *   - dismissWarning: resets the idle timer (user clicked "Stay logged in")
 */
export function useIdleTimeout({
  idleMs = 25 * 60 * 1000,   // 25 min idle → show warning
  warningMs = 5 * 60 * 1000, // 5 min grace → logout
  onLogout,
}: UseIdleTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const logoutAt = useRef<number>(0);

  const clearAllTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    idleTimer.current = null;
    logoutTimer.current = null;
    countdownInterval.current = null;
  }, []);

  const startIdleTimer = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);

    idleTimer.current = setTimeout(() => {
      // Idle threshold reached — show warning
      setShowWarning(true);
      logoutAt.current = Date.now() + warningMs;
      setSecondsLeft(Math.ceil(warningMs / 1000));

      // Start countdown
      countdownInterval.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((logoutAt.current - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          clearAllTimers();
          onLogout();
        }
      }, 1000);

      // Hard logout after grace period
      logoutTimer.current = setTimeout(() => {
        clearAllTimers();
        onLogout();
      }, warningMs);
    }, idleMs);
  }, [idleMs, warningMs, onLogout, clearAllTimers]);

  const dismissWarning = useCallback(() => {
    startIdleTimer();
  }, [startIdleTimer]);

  useEffect(() => {
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];

    const handleActivity = () => {
      // Only reset if warning isn't showing (once warning shows, only dismiss button resets)
      if (!showWarning) {
        startIdleTimer();
      }
    };

    // Start on mount
    startIdleTimer();

    for (const event of activityEvents) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      clearAllTimers();
      for (const event of activityEvents) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [startIdleTimer, clearAllTimers, showWarning]);

  return { showWarning, secondsLeft, dismissWarning };
}
