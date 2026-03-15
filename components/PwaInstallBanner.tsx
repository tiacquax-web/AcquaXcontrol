'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'acquax_pwa_install_dismissed_at';
const REAPPEAR_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function isLikelyIosDevice(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

function isSafari(userAgent: string): boolean {
  return /safari/i.test(userAgent) && !/chrome|android|crios|fxios/i.test(userAgent);
}

export default function PwaInstallBanner() {
  const [ready, setReady] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [canInstallAndroid, setCanInstallAndroid] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || '0');
    const recentlyDismissed = dismissedAt > 0 && Date.now() - dismissedAt < REAPPEAR_AFTER_MS;

    setIsStandalone(standalone);
    setIsIos(isLikelyIosDevice(ua) && isSafari(ua));
    setClosed(recentlyDismissed);
    setReady(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setCanInstallAndroid(true);
    };

    const onInstalled = () => {
      setClosed(true);
      setCanInstallAndroid(false);
      setDeferredPrompt(null);
      window.localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!ready || closed || isStandalone || (!isIos && !canInstallAndroid)) {
    return null;
  }

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setClosed(true);
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setCanInstallAndroid(false);
      setDeferredPrompt(null);
      setClosed(true);
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
      <button
        aria-label="Fechar aviso"
        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pr-6">
        <p className="text-sm font-semibold">Instale o AcquaxControl no celular</p>
        {isIos ? (
          <p className="mt-1 text-xs text-muted-foreground">
            No iPhone: toque em <Share2 className="mx-1 inline h-3.5 w-3.5" /> Compartilhar e depois em
            {' '}<strong>Adicionar à Tela de Início</strong>.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Instale agora para abrir como aplicativo, com acesso rápido no Android.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canInstallAndroid && (
          <Button onClick={handleAndroidInstall} size="sm" className="gap-1.5">
            <Download className="h-4 w-4" />
            Instalar aplicativo
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <Link href="/instalar-app">Ver instruções</Link>
        </Button>
      </div>
    </div>
  );
}
