'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHOW_DELAY_MS = 3000;

export function usePwaInstall() {
  const [promptReady, setPromptReady] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [isStandalone, setIsStandalone] = useState(true);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 1. Check if already running as installed PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    // 2. Check if user previously dismissed
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DURATION_MS) {
      setDismissed(true);
      return;
    }
    setDismissed(false);

    // 3. Detect iOS Safari (skip Chrome/Firefox on iOS — they can't do A2HS)
    const ua = navigator.userAgent;
    const iosDevice = /iPhone|iPad|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
    if (iosDevice) {
      if (isSafari) {
        setIsIos(true);
      } else {
        // iOS but not Safari — A2HS not possible, don't show prompt
        return;
      }
    }

    // 4. Capture beforeinstallprompt (Android / desktop Chrome)
    const handleBIP = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setPromptReady(true);
    };
    window.addEventListener('beforeinstallprompt', handleBIP);

    // 5. Auto-hide on successful install
    const handleInstalled = () => {
      setPromptReady(false);
      deferredPrompt.current = null;
    };
    window.addEventListener('appinstalled', handleInstalled);

    // 6. Delay before showing banner
    const timer = setTimeout(() => setDelayElapsed(true), SHOW_DELAY_MS);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBIP);
      window.removeEventListener('appinstalled', handleInstalled);
      clearTimeout(timer);
    };
  }, []);

  const showPrompt = !isStandalone && !dismissed && delayElapsed && (isIos || promptReady);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    deferredPrompt.current = null;
    setPromptReady(false);
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
  }, []);

  return { showPrompt, isIos, triggerInstall, dismiss };
}
