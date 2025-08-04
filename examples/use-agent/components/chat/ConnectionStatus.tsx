
interface ConnectionStatusProps {
  isConnected: boolean;
  currentAgent?: string;
}

export function ConnectionStatus({ isConnected, currentAgent }: ConnectionStatusProps) {
  return (
    <div className="p-4 border-b flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-gray-600">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      {currentAgent && (
        <div className="text-sm text-gray-600">
          Current Agent: <span className="font-medium">{currentAgent}</span>
        </div>
      )}
    </div>
  );
}
