'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type ActionsProps = ComponentProps<'div'>;

export const Actions = ({ className, children, ...props }: ActionsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props}>
    {children}
  </div>
);

export type ActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const Action = ({
  tooltip,
  children,
  label,
  className,
  variant = 'ghost',
  size = 'icon',
  ...props
}: ActionProps) => {
  const button = (
    <Button
      className={cn(
        'size-8 p-0.5 text-muted-foreground hover:text-foreground',
        className,
      )}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      <span className="[&>svg]:size-4">{children}</span>
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};
