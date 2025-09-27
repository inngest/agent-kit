interface MessageTitleProps {
    currentAgent?: string;
}

export function MessageTitle({ currentAgent }: MessageTitleProps) {
    return (
      <div className="flex flex-row items-center gap-2">
        <span className="text-xs pl-0.5 font-mono uppercase tracking-widest text-muted-foreground opacity-80 font-medium">
          {currentAgent || 'Assistant'}
        </span>
      </div>
    );
}

export default MessageTitle;