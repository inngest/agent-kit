'use client';

import { CopyIcon, EditIcon, RefreshCcwIcon, ThumbsUpIcon, ThumbsDownIcon, VolumeXIcon, ShareIcon } from 'lucide-react';
import { Actions, Action } from '@/components/ai-elements/actions';
import {
  BranchSelector,
  BranchPrevious,
  BranchNext,
  BranchPage,
} from '@/components/ai-elements/branch';

interface MessageActionsProps {
  message: any;
  isHovered?: boolean;
  onCopyMessage: (message: any) => void;
  onEditMessage?: (message: any) => void;
  onRegenerateFrom?: (message: any) => void;
  onLikeMessage?: (messageId: string) => void;
  onDislikeMessage?: (messageId: string) => void;
  onReadAloud?: (message: any) => void;
  onShareMessage?: (message: any) => void;
}

export function MessageActions({ 
  message, 
  isHovered, 
  onCopyMessage, 
  onEditMessage, 
  onRegenerateFrom,
  onLikeMessage,
  onDislikeMessage,
  onReadAloud,
  onShareMessage
}: MessageActionsProps) {
  const isUserMessage = message.role === 'user';
  const isAssistantMessage = message.role === 'assistant';

  if (isUserMessage) {
    // User message actions with hover-based opacity
    return (
      <div className={`flex items-center justify-between mt-0 mr-0 transition-opacity duration-200 ${
        isHovered ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Action
              onClick={() => onCopyMessage(message)}
              tooltip="Copy message"
              label="Copy"
            >
              <CopyIcon className="size-3" />
            </Action>
            {onEditMessage && (
              <Action
                onClick={() => onEditMessage(message)}
                tooltip="Edit message"
                label="Edit"
              >
                <EditIcon className="size-3" />
              </Action>
            )}
          </div>
          <BranchSelector from={message.role}>
            <BranchPrevious />
            <BranchPage />
            <BranchNext />
          </BranchSelector>
        </div>
      </div>
    );
  }

  if (isAssistantMessage) {
    // Assistant message actions
    return (
      <Actions className="mt-0 relative right-1.5 bottom-1">
        <Action onClick={() => onCopyMessage(message)} tooltip="Copy" label="Copy">
          <CopyIcon className="size-3" />
        </Action>
        {onRegenerateFrom && (
          <Action onClick={() => onRegenerateFrom(message)} tooltip="Regenerate" label="Regenerate">
            <RefreshCcwIcon className="size-3" />
          </Action>
        )}
        {onLikeMessage && (
          <Action onClick={() => onLikeMessage(message.id)} tooltip="Good response" label="Thumbs up">
            <ThumbsUpIcon className="size-3" />
          </Action>
        )}
        {onDislikeMessage && (
          <Action onClick={() => onDislikeMessage(message.id)} tooltip="Bad response" label="Thumbs down">
            <ThumbsDownIcon className="size-3" />
          </Action>
        )}
        {onReadAloud && (
          <Action onClick={() => onReadAloud(message)} tooltip="Read aloud" label="Read aloud">
            <VolumeXIcon className="size-3" />
          </Action>
        )}
        {onShareMessage && (
          <Action onClick={() => onShareMessage(message)} tooltip="Share" label="Share">
            <ShareIcon className="size-3" />
          </Action>
        )}
      </Actions>
    );
  }

  return null;
}

export default MessageActions;
