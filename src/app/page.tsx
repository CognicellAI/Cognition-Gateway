const notifications = [
  {
    id: "notif-1",
    title: "Session completed",
    message: "Background run finished successfully.",
    sessionId: "session-123",
    href: "/chat/session-123",
    timestamp: "2m ago",
    unread: true,
  },
  {
    id: "notif-2",
    title: "Trigger requires review",
    message: "A scheduled trigger needs manual approval.",
    href: "/admin/triggers",
    timestamp: "12m ago",
    unread: true,
  },
  {
    id: "notif-3",
    title: "Recent activity",
    message: "A new event was added to the notification history.",
    href: "/admin/triggers",
    timestamp: "1h ago",
    unread: false,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
            Cognition Gateway
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Notification bell deep-link preview
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Notifications with a sessionId route directly to the related
            session. Notifications without a session fall back to the trigger
            management surface.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-medium">Notifications</h2>
              <p className="text-sm text-zinc-500">3 recent events</p>
            </div>
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-950">
              2 unread
            </span>
          </div>

          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {notifications.map((notification) => (
              <li key={notification.id} className="p-5 transition hover:bg-zinc-50 dark:hover:bg-zinc-950/60">
                <a
                  className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-900"
                  href={notification.href}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{notification.title}</h3>
                        {notification.unread ? (
                          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                        ) : null}
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {notification.message}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {notification.sessionId
                          ? `Session: ${notification.sessionId}`
                          : "No session attached"}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-500">{notification.timestamp}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
