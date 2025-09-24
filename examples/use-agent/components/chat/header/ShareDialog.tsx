"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
};

export function ShareDialog({ open, onOpenChange, threadId }: ShareDialogProps) {
  const [shareUrl, setShareUrl] = useState<string>("");

  const placeholder = useMemo(
    () => "https://chatgpt.com/share/...",
    []
  );

  const handleCreateOrCopy = async () => {
    try {
      // In a real app, this might call an API to create a public, read-only view.
      const url =
        shareUrl || `${window.location.origin}/share/${encodeURIComponent(threadId)}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch (err) {
      console.error("[ShareDialog] Failed to copy link", err);
      toast.error("Could not copy link");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share public link to chat</DialogTitle>
          <DialogDescription>
            Your name, custom instructions, and any messages you add after sharing stay
            private. Learn more
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            value={shareUrl}
            readOnly
            placeholder={placeholder}
            onClick={() => {
              if (shareUrl) navigator.clipboard.writeText(shareUrl);
            }}
          />
          <Button onClick={handleCreateOrCopy}>
            {shareUrl ? "Copy link" : "Create link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ShareDialog;


