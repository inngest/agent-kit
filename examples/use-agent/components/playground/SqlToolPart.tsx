"use client";

import { useState } from 'react';
import { type ToolCallUIPart } from '@/hooks/types';

interface SqlToolPartProps {
  part: ToolCallUIPart;
  onInsertSql: (sql: string) => void;
}

export function SqlToolPart({ part, onInsertSql }: SqlToolPartProps) {
  const [isInserting, setIsInserting] = useState(false);

  // Extract SQL from tool output
  const extractSqlFromOutput = (output: any): string => {
    if (typeof output === 'string') {
      return output;
    }
    
    if (typeof output === 'object' && output !== null) {
      // Try common property names for SQL
      if (output.sql) return output.sql;
      if (output.query) return output.query;
      if (output.code) return output.code;
      if (output.data && typeof output.data === 'string') return output.data;
      
      // If it's an object, stringify it nicely
      return JSON.stringify(output, null, 2);
    }
    
    return String(output || '');
  };

  // Get display title from tool name and state
  const getDisplayTitle = (): string => {
    const toolName = part.toolName || 'Tool';
    
    switch (part.state) {
      case 'input-streaming':
        return `${toolName} (preparing...)`;
      case 'input-available':
        return `${toolName} (ready)`;
      case 'executing':
        return `${toolName} (running...)`;
      case 'output-available':
        return `Generated ${toolName.toLowerCase()}`;
      default:
        return toolName;
    }
  };

  // Get truncated output for display
  const getDisplayText = (): string => {
    if (part.state !== 'output-available' || !part.output) {
      return part.state === 'executing' ? 'Generating SQL query...' : 'Tool execution in progress...';
    }
    
    const sql = extractSqlFromOutput(part.output);
    // Truncate to one line, max 60 chars
    const truncated = sql.replace(/\n/g, ' ').substring(0, 60);
    return truncated.length < sql.length ? `${truncated}...` : truncated;
  };

  const handlePlayClick = async () => {
    if (part.state !== 'output-available' || !part.output) return;
    
    setIsInserting(true);
    try {
      const sql = extractSqlFromOutput(part.output);
      onInsertSql(sql);
    } finally {
      setIsInserting(false);
    }
  };

  const isPlayable = part.state === 'output-available' && part.output;

  return (
    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg my-2">
      {/* Status Icon */}
      <div className="flex-shrink-0">
        {part.state === 'output-available' ? (
          <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : part.state === 'executing' ? (
          <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-5 h-5 bg-gray-300 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-grow min-w-0">
        <div className="text-sm font-medium text-green-800 mb-1">
          {getDisplayTitle()}
        </div>
        <div className="text-xs text-green-600 font-mono truncate">
          {getDisplayText()}
        </div>
      </div>

      {/* Play Button */}
      <div className="flex-shrink-0">
        <button
          onClick={handlePlayClick}
          disabled={!isPlayable || isInserting}
          className={`
            flex items-center justify-center w-8 h-8 rounded-full transition-colors
            ${isPlayable 
              ? 'bg-green-500 hover:bg-green-600 text-white' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }
          `}
          title={isPlayable ? 'Insert into SQL editor' : 'Tool output not ready'}
        >
          {isInserting ? (
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
