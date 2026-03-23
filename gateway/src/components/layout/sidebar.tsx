"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  PlusIcon,
  MessageSquareIcon,
  SettingsIcon,
  LogOutIcon,
  ChevronLeftIcon,
  TrashIcon,
  BotIcon,
  CpuIcon,
  WrenchIcon,
  SlidersHorizontalIcon,
  ShieldIcon,
  CalendarClockIcon,
  WebhookIcon,
  ActivityIcon,
  ClipboardListIcon,
  ShieldAlertIcon,
  KeyRoundIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  LightbulbIcon,
  PlugZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useChatStore } from "@/hooks/use-chat-store";
import type { SessionSummary } from "@/types/cognition";
import { cn } from "@/lib/utils";

interface SidebarProps {
  sessions: SessionSummary[];
  loading?: boolean;
  isAdmin?: boolean;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/agents", label: "Agents", icon: BotIcon },
  { href: "/models", label: "Models", icon: CpuIcon },
  { href: "/providers", label: "Providers", icon: PlugZapIcon },
  { href: "/tools", label: "Tools", icon: WrenchIcon },
  { href: "/skills", label: "Skills", icon: LightbulbIcon },
  { href: "/config", label: "Config", icon: SlidersHorizontalIcon },
  { href: "/cron", label: "Cron", icon: CalendarClockIcon },
  { href: "/webhooks", label: "Webhooks", icon: WebhookIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/approvals", label: "Approvals", icon: ShieldAlertIcon },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Admin", icon: ShieldIcon, adminOnly: true },
  { href: "/audit", label: "Audit Log", icon: ClipboardListIcon, adminOnly: true },
];

export function Sidebar({ sessions, loading, isAdmin, onNewChat, onDeleteSession, onRenameSession }: SidebarProps) {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen, activeSessionId } = useChatStore();

  const visibleAdmin = isAdmin ? ADMIN_NAV_ITEMS : [];

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-muted/30 transition-all duration-200",
        sidebarOpen ? "w-64" : "w-14"
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-3 border-b">
        {sidebarOpen && (
          <Link href="/chat" className="font-semibold text-sm truncate">
            Cognition Gateway
          </Link>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 ml-auto"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <ChevronLeftIcon
                className={cn("h-4 w-4 transition-transform", !sidebarOpen && "rotate-180")}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* New Chat Button */}
      <div className="p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-full", !sidebarOpen && "px-0")}
              onClick={onNewChat}
            >
              <PlusIcon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span className="ml-2">New chat</span>}
            </Button>
          </TooltipTrigger>
          {!sidebarOpen && <TooltipContent side="right">New chat</TooltipContent>}
        </Tooltip>
      </div>

      {/* Session List */}
      <ScrollArea className="flex-1 px-2">
        {loading ? (
          <div className="space-y-1 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5 py-2">
            {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId || pathname === `/chat/${session.id}`}
                  collapsed={!sidebarOpen}
                  onDelete={onDeleteSession}
                  onRename={onRenameSession}
                />
              ))}
          </div>
        )}
      </ScrollArea>

      {/* Navigation Section */}
      <div className="border-t p-2 space-y-0.5">
        {sidebarOpen && (
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">
            Server
          </p>
        )}
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname.startsWith(item.href)}
            collapsed={!sidebarOpen}
          />
        ))}

        {visibleAdmin.length > 0 && (
          <>
            {sidebarOpen && <Separator className="my-1" />}
            {!sidebarOpen && <div className="py-0.5" />}
            {visibleAdmin.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname.startsWith(item.href)}
                collapsed={!sidebarOpen}
              />
            ))}
          </>
        )}

        <Separator className="my-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={pathname === "/settings" || pathname.startsWith("/settings/") ? "secondary" : "ghost"}
              size={sidebarOpen ? "default" : "icon"}
              className="w-full justify-start"
              asChild
            >
              <Link href="/settings">
                <SettingsIcon className="h-4 w-4 shrink-0" />
                {sidebarOpen && <span className="ml-2">Settings</span>}
              </Link>
            </Button>
          </TooltipTrigger>
          {!sidebarOpen && <TooltipContent side="right">Settings</TooltipContent>}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={pathname === "/settings/api-keys" ? "secondary" : "ghost"}
              size={sidebarOpen ? "default" : "icon"}
              className="w-full justify-start"
              asChild
            >
              <Link href="/settings/api-keys">
                <KeyRoundIcon className="h-4 w-4 shrink-0" />
                {sidebarOpen && <span className="ml-2">API Keys</span>}
              </Link>
            </Button>
          </TooltipTrigger>
          {!sidebarOpen && <TooltipContent side="right">API Keys</TooltipContent>}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size={sidebarOpen ? "default" : "icon"}
              className="w-full justify-start text-muted-foreground"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOutIcon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span className="ml-2">Sign out</span>}
            </Button>
          </TooltipTrigger>
          {!sidebarOpen && <TooltipContent side="right">Sign out</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size={collapsed ? "icon" : "default"}
          className="w-full justify-start"
          asChild
        >
          <Link href={item.href}>
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="ml-2">{item.label}</span>}
          </Link>
        </Button>
      </TooltipTrigger>
      {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
    </Tooltip>
  );
}

function SessionItem({
  session,
  active,
  collapsed,
  onDelete,
  onRename,
}: {
  session: SessionSummary;
  active: boolean;
  collapsed: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const title = session.title ?? "Untitled chat";
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRenameValue(title);
    setRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, [title]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== title) {
      onRename(session.id, trimmed);
    }
    setRenaming(false);
  }, [renameValue, title, session.id, onRename]);

  const cancelRename = useCallback(() => {
    setRenaming(false);
    setRenameValue(title);
  }, [title]);

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon"
            className="w-full"
            asChild
          >
            <Link href={`/chat/${session.id}`}>
              <MessageSquareIcon className="h-4 w-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{title}</TooltipContent>
      </Tooltip>
    );
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1 rounded-md px-1 py-0.5">
        <input
          ref={renameInputRef}
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") cancelRename();
          }}
          onBlur={commitRename}
          className="flex-1 min-w-0 bg-background border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={commitRename}>
          <CheckIcon className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={cancelRename}>
          <XIcon className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("group flex items-center rounded-md", active && "bg-accent")}>
      <Button
        variant="ghost"
        className="flex-1 justify-start h-8 px-2 font-normal truncate"
        asChild
      >
        <Link href={`/chat/${session.id}`}>
          <span className="truncate text-sm">{title}</span>
        </Link>
      </Button>
      <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 mr-1 gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={startRename}
        >
          <PencilIcon className="h-3 w-3 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.preventDefault();
            onDelete(session.id);
          }}
        >
          <TrashIcon className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
