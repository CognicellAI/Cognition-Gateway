"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircleIcon, XCircleIcon, LoaderIcon, SunIcon, MoonIcon, MonitorIcon } from "lucide-react";

type TestState = "idle" | "testing" | "ok" | "fail";
type ThemeValue = "light" | "dark" | "system";

const THEME_OPTIONS: { value: ThemeValue; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

export default function SettingsPage() {
  const [serverUrl, setServerUrl] = useState("http://localhost:8000");
  const [originalUrl, setOriginalUrl] = useState("http://localhost:8000");
  const [testState, setTestState] = useState<TestState>("idle");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { theme, setTheme } = useTheme();
  const [themeSaving, setThemeSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/server")
      .then((r) => r.json())
      .then((d) => {
        setServerUrl(d.serverUrl ?? "http://localhost:8000");
        setOriginalUrl(d.serverUrl ?? "http://localhost:8000");
      })
      .catch(() => {});
  }, []);

  // Sync persisted preference → next-themes on mount
  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((d) => {
        if (d.theme && ["light", "dark", "system"].includes(d.theme)) {
          setTheme(d.theme as ThemeValue);
        }
      })
      .catch(() => {});
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testConnection() {
    setTestState("testing");
    try {
      const res = await fetch("/api/c/health");
      setTestState(res.ok ? "ok" : "fail");
    } catch {
      setTestState("fail");
    }
  }

  async function saveServerUrl() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/server", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl }),
      });
      if (res.ok) {
        setOriginalUrl(serverUrl);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const handleThemeChange = useCallback(async (value: ThemeValue) => {
    setTheme(value);
    setThemeSaving(true);
    try {
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: value }),
      });
    } finally {
      setThemeSaving(false);
    }
  }, [setTheme]);

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your Cognition Gateway configuration
        </p>
      </div>

      {/* Cognition Server */}
      <Card>
        <CardHeader>
          <CardTitle>Cognition Server</CardTitle>
          <CardDescription>
            The URL of your Cognition server. All agent requests are proxied through this connection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serverUrl">Server URL</Label>
            <div className="flex gap-2">
              <Input
                id="serverUrl"
                type="url"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  setTestState("idle");
                }}
                placeholder="http://localhost:8000"
                className="flex-1"
              />
              <Button variant="outline" onClick={testConnection} disabled={testState === "testing"}>
                {testState === "testing" ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  "Test"
                )}
              </Button>
            </div>

            {testState === "ok" && (
              <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircleIcon className="h-4 w-4" />
                Connection successful
              </div>
            )}
            {testState === "fail" && (
              <div className="flex items-center gap-1.5 text-sm text-destructive">
                <XCircleIcon className="h-4 w-4" />
                Could not reach server — check the URL and try again
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={saveServerUrl}
              disabled={saving || serverUrl === originalUrl}
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save"}
            </Button>
            {serverUrl !== originalUrl && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                Unsaved changes
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how Cognition Gateway looks. Your preference is saved to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Theme</Label>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={theme === value ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => handleThemeChange(value)}
                disabled={themeSaving}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
