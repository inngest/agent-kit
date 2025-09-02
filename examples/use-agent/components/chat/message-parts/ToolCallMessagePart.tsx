
import type { ToolCallUIPart } from "@inngest/use-agents";
import type { ToolUIPart } from 'ai';
import { useState } from 'react';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';

/**
 * Converts our custom ToolCallUIPart to the format expected by the AI SDK Tool component
 * Note: awaiting-approval is handled separately and doesn't map to standard ToolUIPart states
 */
function adaptToolCallToToolUIPart(part: ToolCallUIPart): ToolUIPart {
  // Map our custom states to AI SDK states
  let sdkState: ToolUIPart['state'];
  switch (part.state) {
    case 'input-streaming':
      sdkState = 'input-streaming';
      break;
    case 'input-available':
      sdkState = 'input-available';
      break;
    case 'awaiting-approval':
      // For display purposes, treat as input-available since input is ready
      sdkState = 'input-available';
      break;
    case 'executing':
      // For executing, if we have output, consider it available, otherwise input-available
      sdkState = part.output ? 'output-available' : 'input-available';
      break;
    case 'output-available':
      // If there's an error, treat as error, otherwise output available
      sdkState = part.error ? 'output-error' : 'output-available';
      break;
    default:
      sdkState = 'input-streaming';
  }

  return {
    type: `tool-${part.toolName}` as `tool-${string}`,
    toolCallId: part.toolCallId,
    state: sdkState,
    input: part.input,
    output: part.output,
    errorText: part.error,
  } as ToolUIPart;
}

interface ToolCallMessagePartProps {
  part: ToolCallUIPart;
  onApprove?: (toolCallId: string) => void;
  onDeny?: (toolCallId: string, reason?: string) => void;
}

/**
 * Smart renderer for tool output that detects and renders tabular data
 */
function renderToolOutput(output: any): React.ReactNode {
  if (!output) return null;

  // Helper function to check if an array contains objects suitable for table rendering
  const isTableData = (arr: any[]): boolean => {
    if (arr.length === 0) return false;
    
    // Check if all items are objects with consistent keys
    const firstItem = arr[0];
    if (typeof firstItem !== 'object' || firstItem === null) return false;
    
    const firstKeys = Object.keys(firstItem).sort();
    return arr.every(item => {
      if (typeof item !== 'object' || item === null) return false;
      const keys = Object.keys(item).sort();
      return keys.length === firstKeys.length && 
             keys.every((key, index) => key === firstKeys[index]);
    });
  };

  // Helper function to render a table
  const renderTable = (data: any[], title?: string): React.ReactNode => (
    <div className="space-y-2">
      {title && <div className="font-medium text-sm">{title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              {Object.keys(data[0]).map(key => (
                <th key={key} className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left font-medium">
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                {Object.values(row).map((value, cellIndex) => (
                  <td key={cellIndex} className="border border-gray-300 dark:border-gray-600 px-3 py-2">
                    {String(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // If output is an array and suitable for table rendering
  if (Array.isArray(output) && isTableData(output)) {
    return renderTable(output);
  }

  // If output is an object, check for nested arrays that could be tables
  if (typeof output === 'object' && output !== null) {
    const entries = Object.entries(output);
    const tables: React.ReactNode[] = [];
    const remainingData: any = {};

    entries.forEach(([key, value]) => {
      if (Array.isArray(value) && isTableData(value)) {
        tables.push(renderTable(value, key));
      } else {
        remainingData[key] = value;
      }
    });

    // If we found tables, render them along with any remaining data
    if (tables.length > 0) {
      return (
        <div className="space-y-4">
          {tables}
          {Object.keys(remainingData).length > 0 && (
            <div>
              <div className="font-medium text-sm mb-2">Other Data</div>
              <CodeBlock code={JSON.stringify(remainingData, null, 2)} language="json" />
            </div>
          )}
        </div>
      );
    }
  }

  // Fall back to JSON display for non-tabular data
  return <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
}

/**
 * Approval UI component for tools awaiting approval
 */
function ToolApprovalSection({ 
  part, 
  onApprove, 
  onDeny 
}: { 
  part: ToolCallUIPart; 
  onApprove?: (toolCallId: string) => void;
  onDeny?: (toolCallId: string, reason?: string) => void;
}) {
  const [showDenyForm, setShowDenyForm] = useState(false);
  const [denyReason, setDenyReason] = useState('');

  const handleApprove = () => {
    onApprove?.(part.toolCallId);
  };

  const handleDeny = () => {
    if (showDenyForm) {
      onDeny?.(part.toolCallId, denyReason);
      setShowDenyForm(false);
      setDenyReason('');
    } else {
      setShowDenyForm(true);
    }
  };

  const handleCancelDeny = () => {
    setShowDenyForm(false);
    setDenyReason('');
  };

  return (
    <div className="border-t border-orange-200 bg-orange-50 dark:bg-orange-900/20 p-3">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-4 w-4 text-orange-600" />
        <span className="font-medium text-orange-700 dark:text-orange-300 text-sm">
          Approval Required
        </span>
      </div>
      
      <p className="text-sm text-orange-600 dark:text-orange-400 mb-3">
        This tool call requires human approval before execution. Please review the parameters above.
      </p>

      {showDenyForm ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-orange-700 dark:text-orange-300 mb-1">
              Reason for denial (optional):
            </label>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Explain why this tool call should be denied..."
              className="w-full px-3 py-2 text-sm border border-orange-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-800 dark:border-orange-600"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDeny}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-3 rounded flex items-center justify-center gap-1"
            >
              <XCircle className="h-3 w-3" />
              Confirm Denial
            </button>
            <button
              onClick={handleCancelDeny}
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white text-sm py-2 px-3 rounded flex items-center justify-center gap-1"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-3 rounded flex items-center justify-center gap-1"
          >
            <CheckCircle className="h-3 w-3" />
            Approve
          </button>
          <button
            onClick={handleDeny}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-3 rounded flex items-center justify-center gap-1"
          >
            <MessageSquare className="h-3 w-3" />
            Deny with Feedback
          </button>
        </div>
      )}
    </div>
  );
}

export function ToolCallMessagePart({ 
  part, 
  onApprove, 
  onDeny 
}: ToolCallMessagePartProps) {
  // Convert our custom type to the AI SDK format
  const adaptedPart = adaptToolCallToToolUIPart(part);
  
  // Determine if the tool should be open by default
  // Open completed tools, error tools, and tools awaiting approval
  const defaultOpen = part.state === 'output-available' || 
                     part.state === 'awaiting-approval' || 
                     !!part.error;

  // For awaiting-approval, use a special orange warning state in the header
  const headerState = part.state === 'awaiting-approval' ? 'input-available' : adaptedPart.state;

  return (
    <Tool defaultOpen={defaultOpen} className="mt-2">
      <ToolHeader type={adaptedPart.type} state={headerState} />
      <ToolContent>
        {/* Show input if available */}
        {part.input && Object.keys(part.input).length > 0 && (
          <ToolInput input={part.input} />
        )}
        
        {/* Show approval section for awaiting-approval state */}
        {part.state === 'awaiting-approval' && (
          <ToolApprovalSection 
            part={part} 
            onApprove={onApprove} 
            onDeny={onDeny} 
          />
        )}
        
        {/* Show output or error for completed tools */}
        {(part.output || part.error) && (
          <ToolOutput 
            output={part.output ? renderToolOutput(part.output) : undefined}
            errorText={part.error}
          />
        )}
      </ToolContent>
    </Tool>
  );
}
