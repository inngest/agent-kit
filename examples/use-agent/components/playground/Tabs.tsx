"use client";

type Tab = {
  id: string;
  title: string;
};

interface TabsProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

export function Tabs({ tabs, activeTabId, onTabClick, onCloseTab, onNewTab }: TabsProps) {
  return (
    <div className="flex">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`
            group flex items-center px-4 py-2 cursor-pointer text-sm transition-colors border-r border-gray-200 last:border-r-0
            ${activeTabId === tab.id 
              ? 'bg-white text-gray-800 border-b-2 border-blue-500' 
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-b border-gray-200'
            }
          `}
          onClick={() => onTabClick(tab.id)}
        >
          <span className="truncate max-w-32 font-medium">{tab.title}</span>
          <button
            className={`
              ml-2 w-4 h-4 flex items-center justify-center rounded-sm text-xs transition-all
              ${activeTabId === tab.id 
                ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-200' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
              }
              opacity-0 group-hover:opacity-100
            `}
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            title="Close tab"
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="flex items-center justify-center w-8 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-sm bg-gray-50 border-b border-gray-200"
        onClick={onNewTab}
        title="New tab"
      >
        +
      </button>
    </div>
  );
}
