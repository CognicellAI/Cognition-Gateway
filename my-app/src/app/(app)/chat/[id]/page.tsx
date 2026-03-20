import { ChatView } from "@/components/chat/chat-view";

interface ChatSessionPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatSessionPage({ params }: ChatSessionPageProps) {
  const { id } = await params;
  return <ChatView sessionId={id} />;
}