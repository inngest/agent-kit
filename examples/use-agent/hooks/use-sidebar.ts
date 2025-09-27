"use client";

import { useState } from 'react';

export function useSidebar() {
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarMinimized((prev) => !prev);
  };

  return {
    sidebarMinimized,
    setSidebarMinimized,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    toggleSidebar,
  };
}
