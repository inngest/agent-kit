"use client";

import { useCallback } from "react";

type AnyMessage = {
  id: string;
  parts: Array<{
    type: string;
    content?: string;
    status?: string;
  }>;
};

export interface UseMessageActionsOptions {
  onLike?: (messageId: string) => void;
  onDislike?: (messageId: string) => void;
  onCopy?: (text: string) => void;
  onShare?: (text: string) => void;
  /** Optional toast function - provide your own toast implementation */
  showToast?: (message: string, type: 'success' | 'error') => void;
}

function extractTextFromMessage(message: AnyMessage, joinWith: string = "\n"): string {
  if (!message) return "";
  try {
    return message.parts
      .filter((part: any) => part?.type === "text" && typeof part?.content === "string")
      .map((part: any) => String(part.content))
      .join(joinWith)
      .trim();
  } catch {
    return "";
  }
}

export function useMessageActions(options: UseMessageActionsOptions = {}) {
  const { onLike, onDislike, onCopy, onShare, showToast } = options;

  const copyMessage = useCallback(async (message: AnyMessage) => {
    const textContent = extractTextFromMessage(message, "\n");
    if (!textContent) return;

    try {
      await navigator.clipboard.writeText(textContent);
      onCopy?.(textContent);
      showToast?.("Copied to clipboard", "success");
    } catch (err) {
      console.error("[useMessageActions] Copy failed", err);
      showToast?.("Could not copy to clipboard", "error");
    }
  }, [onCopy]);

  const likeMessage = useCallback((messageId: string) => {
    try {
      onLike?.(messageId);
      console.log(`[useMessageActions] Thumbs up for message: ${messageId}`);
    } catch (err) {
      console.error("[useMessageActions] likeMessage failed", err);
    }
  }, [onLike]);

  const dislikeMessage = useCallback((messageId: string) => {
    try {
      onDislike?.(messageId);
      console.log(`[useMessageActions] Thumbs down for message: ${messageId}`);
    } catch (err) {
      console.error("[useMessageActions] dislikeMessage failed", err);
    }
  }, [onDislike]);

  const readAloud = useCallback((message: AnyMessage) => {
    const textContent = extractTextFromMessage(message, " ");
    if (!textContent) return;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(textContent);
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error("[useMessageActions] readAloud failed", err);
      }
    } else {
      showToast?.("Text-to-speech not supported by this browser", "error");
    }
  }, []);

  const shareMessage = useCallback(async (message: AnyMessage) => {
    const textContent = extractTextFromMessage(message, "\n");
    if (!textContent) return;

    try {
      if (navigator.share) {
        await navigator.share({ title: "AI Assistant Response", text: textContent });
        onShare?.(textContent);
      } else {
        await navigator.clipboard.writeText(textContent);
        onShare?.(textContent);
        showToast?.("Copied to clipboard", "success");
      }
    } catch (err) {
      console.error("[useMessageActions] shareMessage failed", err);
    }
  }, [onShare]);

  return {
    copyMessage,
    likeMessage,
    dislikeMessage,
    readAloud,
    shareMessage,
  } as const;
}


