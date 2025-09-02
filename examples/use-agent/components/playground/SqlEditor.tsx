"use client";

interface SqlEditorProps {
  sql: string;
  onSqlChange: (sql: string) => void;
}

export function SqlEditor({ sql, onSqlChange }: SqlEditorProps) {
  const lineNumbers = sql.split('\n').map((_, index) => index + 1);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header with title and run button - matches the image */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span className="text-sm font-medium text-gray-700">Untitled query</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors">
            Save query
          </button>
          <button className="px-3 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors">
            Run query
          </button>
        </div>
      </div>

      {/* SQL Editor with line numbers - matches the image layout */}
      <div className="flex flex-1 min-h-0">
        {/* Line numbers */}
        <div className="w-12 bg-gray-50 border-r border-gray-200 py-3 px-2">
          <div className="text-xs text-gray-400 font-mono leading-5">
            {lineNumbers.map(num => (
              <div key={num} className="text-right">
                {num}
              </div>
            ))}
          </div>
        </div>
        
        {/* SQL textarea */}
        <textarea
          className="flex-1 p-3 bg-white font-mono text-sm resize-none focus:outline-none text-gray-800 leading-5"
          value={sql}
          onChange={(e) => onSqlChange(e.target.value)}
          placeholder="SELECT * FROM users;"
          style={{ 
            minHeight: '100%',
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9'
          }}
        />
      </div>

      {/* Results section */}
      <div className="border-t border-gray-200 bg-white">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-medium text-gray-600">Results</span>
        </div>
        <div className="p-4 h-32 overflow-auto">
          <div className="text-center text-gray-500">
            <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center mx-auto mb-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="text-xs text-gray-400">
              Your query results will appear here
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Run a query to analyze your data and the results will be displayed here
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
