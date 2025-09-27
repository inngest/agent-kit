import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import type { ComponentProps, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import type { UIMessage } from 'ai';
import { Bot } from 'lucide-react';

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage['role'];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      'group flex w-full items-end gap-2 pb-4',
      from === 'user'
        ? 'is-user justify-end pt-4'
        : 'is-assistant justify-start pt-0',
      '[&>div]:max-w-[80%]',
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      'flex flex-col gap-2 rounded-lg text-[16px] font-base text-foreground px-0 py-0 overflow-hidden',
      // Add padding only for user bubbles
      'group-[.is-user]:px-4 group-[.is-user]:py-3',
      'group-[.is-user]:bg-[#F4F4F4] group-[.is-user]:text-gray-900 dark:group-[.is-user]:bg-gray-800 dark:group-[.is-user]:text-gray-100',
      className,
    )}
    {...props}
  >
    <div className="is-user:dark">{children}</div>
  </div>
);

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src?: string;
  name?: string;
  variant?: 'assistant' | 'user';
  icon?: React.ReactNode;
};

export const MessageAvatar = ({
  src,
  name,
  variant,
  icon,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar
    className={cn('size-8', variant !== 'assistant' && 'ring ring-border', className)}
    {...props}
  >
    {src ? <AvatarImage alt="" className="mt-0 mb-0" src={src} /> : null}
    <AvatarFallback className={cn(variant === 'assistant' && 'bg-transparent')}>
      {variant === 'assistant' ? (
        icon ?? <Bot className="h-4 w-4" />
      ) : (
        name?.slice(0, 2) || 'ME'
      )}
    </AvatarFallback>
  </Avatar>
);
