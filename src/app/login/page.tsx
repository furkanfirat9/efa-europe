'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, LogIn, ShoppingBag, User } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/shadcn/alert';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Label } from '@/components/shadcn/label';

/** Girişten sonra yalnızca bu uygulamanın içindeki bir adrese dönülür. */
const safeNext = (value: string | null) => (value && /^\/(?!\/)/.test(value) ? value : '/dashboard');

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error_message || 'Giriş yapılamadı.');

      router.replace(next);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setPassword('');
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ShoppingBag className="size-5" />
        </div>
        <CardTitle className="text-xl">Ozon AI Studio</CardTitle>
        <CardDescription>Devam etmek için yönetim paneline giriş yapın.</CardDescription>
      </CardHeader>

      <form onSubmit={submit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
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

          <div className="space-y-1.5">
            <Label htmlFor="password">Şifre</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          </div>
        </CardContent>

        <CardFooter className="mt-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <LogIn />}
            {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4 text-foreground">
      <Suspense fallback={<Loader2 className="size-5 animate-spin text-muted-foreground" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
