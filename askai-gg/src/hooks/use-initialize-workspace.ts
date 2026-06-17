"use client";

import { useEffect } from "react";

import type { WorkspaceSnapshot } from "@/lib/types";
import { useWorkspaceStore } from "@/store/workspace-store";

export function useInitializeWorkspace(snapshot: WorkspaceSnapshot) {
  const initialize = useWorkspaceStore((state) => state.initialize);

  useEffect(() => {
    initialize(snapshot);
  }, [initialize, snapshot]);
}
