"use client";

import { Plus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface MultiChatHeaderProps {
  subchatCount: number;
  onCreateSubchat: () => void;
}

export function MultiChatHeader({ subchatCount, onCreateSubchat }: MultiChatHeaderProps) {
  return (
    <div className="border-b bg-background p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/test" 
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">MultiChat</h1>
            <p className="text-sm text-muted-foreground">
              Multiple parallel conversations • {subchatCount} active chat{subchatCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onCreateSubchat}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Subchat
          </button>
        </div>
      </div>
    </div>
  );
}
