import type { ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface PageContentProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageContent({ children, className, contentClassName }: PageContentProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-1 overflow-hidden", className)}>
      <ScrollArea className="h-full w-full min-h-0 flex-1">
        <div className={cn("mx-auto min-h-full w-full p-6", contentClassName)}>{children}</div>
      </ScrollArea>
    </div>
  );
}
