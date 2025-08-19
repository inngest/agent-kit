'use client';

interface ErrorInfo {
  message: string;
  recoverable?: boolean;
}

interface MessageErrorProps {
  error: ErrorInfo;
  onDismiss: () => void;
}

export function MessageError({ error, onDismiss }: MessageErrorProps) {
  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">
              {error.message}
              {error.recoverable && (
                <span className="ml-2 text-xs text-red-600">
                  (You can try sending your message again)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          <button
            onClick={onDismiss}
            className="bg-red-50 rounded-md p-1.5 text-red-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MessageError;


