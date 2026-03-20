"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShieldIcon, Trash2Icon, UsersIcon } from "lucide-react";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [togglingReg, setTogglingReg] = useState(false);

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const [usersRes, settingsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/settings"),
      ]);
      if (usersRes.status === 403) {
        setFetchError("You do not have permission to view this page.");
        return;
      }
      if (!usersRes.ok) throw new Error(`Users fetch failed: ${usersRes.status}`);
      const usersData = await usersRes.json();
      setUsers(usersData.users ?? []);

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setRegistrationEnabled(settingsData.registrationEnabled ?? true);
      }
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: data.user.role } : u))
      );
    } catch {
      // silently fail — could add toast
    }
  }, []);

  const handleDeleteUser = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) return;
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      // silently fail
    }
  }, []);

  const handleToggleRegistration = useCallback(async () => {
    setTogglingReg(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationEnabled: !registrationEnabled }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setRegistrationEnabled(data.registrationEnabled);
    } catch {
      // silently fail
    } finally {
      setTogglingReg(false);
    }
  }, [registrationEnabled]);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-muted-foreground mt-1">
          User management and gateway settings
        </p>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      )}

      {fetchError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {!loading && !fetchError && (
        <div className="space-y-4">
          {/* Registration toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registration</CardTitle>
              <CardDescription>
                Control whether new users can sign up
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm">Open registration is currently{" "}
                  <span className={registrationEnabled ? "text-emerald-600 font-medium" : "text-muted-foreground font-medium"}>
                    {registrationEnabled ? "enabled" : "disabled"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {registrationEnabled
                    ? "Anyone can create an account."
                    : "Only admins can create new accounts."}
                </p>
              </div>
              <Button
                variant={registrationEnabled ? "destructive" : "outline"}
                size="sm"
                onClick={handleToggleRegistration}
                disabled={togglingReg}
              >
                {togglingReg ? "Saving…" : registrationEnabled ? "Disable registration" : "Enable registration"}
              </Button>
            </CardContent>
          </Card>

          {/* User list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UsersIcon className="h-4 w-4" />
                Users
                <Badge variant="secondary">{users.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {users.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <UsersIcon className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No users</p>
                </div>
              ) : (
                <div className="divide-y">
                  {users.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      onRoleChange={handleRoleChange}
                      onDelete={handleDeleteUser}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  onRoleChange,
  onDelete,
}: {
  user: UserRow;
  onRoleChange: (userId: string, role: string) => void;
  onDelete: (userId: string) => void;
}) {
  const createdDate = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex items-center gap-4 px-6 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {user.role === "admin" && (
            <ShieldIcon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          )}
          <p className="text-sm font-medium truncate">{user.name ?? user.email}</p>
        </div>
        {user.name && (
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        )}
        <p className="text-xs text-muted-foreground/60">{createdDate}</p>
      </div>

      <Select
        value={user.role}
        onValueChange={(value) => onRoleChange(user.id, value)}
      >
        <SelectTrigger className="w-28 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">admin</SelectItem>
          <SelectItem value="user">user</SelectItem>
        </SelectContent>
      </Select>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium">{user.email}</span>. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete(user.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
