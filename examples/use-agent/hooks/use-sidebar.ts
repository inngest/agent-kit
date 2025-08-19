import { useState, useEffect } from 'react';
import { useIsMobile } from './use-mobile';

export function useSidebar() {
  const [sidebarMinimized, setSidebarMinimized] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Initialize sidebar state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !isMobile) {
      const stored = window.localStorage.getItem('useAgent.sidebarMinimized');
      if (stored !== null) {
        setSidebarMinimized(stored === 'true');
      }
    }
  }, [isMobile]);

  const toggleSidebar = () => {
    setSidebarMinimized((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined' && !isMobile) {
        window.localStorage.setItem('useAgent.sidebarMinimized', String(next));
      }
      return next;
    });
  };

  return {
    sidebarMinimized,
    setSidebarMinimized,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    toggleSidebar,
  };
}
