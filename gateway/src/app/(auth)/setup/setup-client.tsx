"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FieldErrors {
  name?: string[];
  email?: string[];
  password?: string[];
  serverUrl?: string[];
}

export default function SetupClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState("http://localhost:8000");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setGlobalError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, serverUrl }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        details?: FieldErrors;
      };

      if (!res.ok) {
        if (res.status === 422 && data.details) {
          setFieldErrors(data.details);
        } else {
          setGlobalError(data.error ?? "Setup failed. Please try again.");
        }
        return;
      }

      router.push("/login?setup=complete");
    } catch {
      setGlobalError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            Welcome to Cognition Gateway
          </CardTitle>
          <CardDescription>
            Create your admin account to get started. This setup only runs once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
              {fieldErrors.name && (
                <p className="text-xs text-destructive">{fieldErrors.name[0]}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive">
                  {fieldErrors.email[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {fieldErrors.password && (
                <p className="text-xs text-destructive">
                  {fieldErrors.password[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="serverUrl">Cognition server URL</Label>
              <Input
                id="serverUrl"
                type="url"
                placeholder="http://localhost:8000"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The URL of your running Cognition server.
              </p>
              {fieldErrors.serverUrl && (
                <p className="text-xs text-destructive">
                  {fieldErrors.serverUrl[0]}
                </p>
              )}
            </div>

            {globalError && (
              <p className="text-sm text-destructive">{globalError}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create admin account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
