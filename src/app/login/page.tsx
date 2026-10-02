'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowBigUpDash, Eye, EyeOff, Loader2, Lock, LogIn, ShoppingBag, User } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';
import { EuropeMap } from './_components/EuropeMap';
import { ShootingStars, SkyGlow, StarField } from './_components/NightSky';
import { WorldClocks } from './_components/WorldClocks';

/** Girişten sonra yalnızca bu uygulamanın içindeki bir adrese dönülür. */
const safeNext = (value: string | null) => (value && /^\/(?!\/)/.test(value) ? value : '/dashboard');

/** Kalan hak bu sayıya inince kullanıcı uyarılır (3. hatalı denemeden sonra). */
const WARN_REMAINING = 2;

const formatCountdown = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

type LoginError = { message: string; remaining?: number };

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Tanıdık tarayıcıda kullanıcı adı önceden doldurulur, imleç şifreye geçer.
  useEffect(() => {
    fetch('/api/auth/device')
      .then((res) => res.json())
      .then((data) => {
        if (!data?.username) return;
        setUsername((current) => current || data.username);
        passwordRef.current?.focus();
      })
      .catch(() => {});
  }, []);

  // Kilit geri sayımı.
  useEffect(() => {
    if (!lockedUntil) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) setLockedUntil(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const locked = lockedUntil !== null && lockedUntil > now;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.status === 429 && typeof data.retry_after === 'number') {
        const t = Date.now();
        setNow(t);
        setLockedUntil(t + data.retry_after * 1000);
        setPassword('');
        setLoading(false);
        return;
      }
      if (!res.ok || !data.success) {
        setError({ message: data.error_message || 'Giriş yapılamadı.', remaining: data.remaining });
        setPassword('');
        setLoading(false);
        passwordRef.current?.focus();
        return;
      }

      router.replace(next);
      router.refresh();
    } catch (err: any) {
      setError({ message: err.message || 'Giriş yapılamadı.' });
      setLoading(false);
    }
  };

  const updateCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Giriş yap</h1>
        <p className="text-sm text-muted-foreground">Yönetim paneline devam etmek için bilgilerinizi girin.</p>
      </div>

      {locked ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Çok fazla hatalı deneme yapıldı</AlertTitle>
          <AlertDescription>
            <span>
              <span className="font-medium tabular-nums">{formatCountdown(lockedUntil! - now)}</span> sonra tekrar
              deneyebilirsiniz.
            </span>
          </AlertDescription>
        </Alert>
      ) : (
        error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>{error.message}</AlertTitle>
            {error.remaining !== undefined && error.remaining <= WARN_REMAINING && (
              <AlertDescription>{error.remaining} deneme hakkınız kaldı.</AlertDescription>
            )}
          </Alert>
        )
      )}

      <div className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="username">Kullanıcı adı</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              disabled={loading}
              className="pl-9"
              placeholder="kullanıcı adınız"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Şifre</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={passwordRef}
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={updateCapsLock}
              onKeyUp={updateCapsLock}
              onBlur={() => setCapsLock(false)}
              autoComplete="current-password"
              required
              disabled={loading}
              className="px-9"
              placeholder="••••••••"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          {capsLock && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <ArrowBigUpDash className="size-3.5" />
              Caps Lock açık
            </p>
          )}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading || locked}>
        {loading ? <Loader2 className="animate-spin" /> : <LogIn />}
        {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-svh bg-background text-foreground lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-center gap-2 font-medium md:justify-start">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </div>
          EFA Europe
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <Suspense fallback={<Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="relative hidden flex-col justify-center gap-12 overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <StarField />
        <EuropeMap className="relative w-full" />
        <ShootingStars />
        <SkyGlow />
        <div className="relative">
          <WorldClocks />
        </div>
      </div>
    </div>
  );
}
