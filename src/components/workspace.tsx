import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspace } from "@/lib/workspace.functions";
import type { BusinessRow, LocationRow } from "@/lib/domain";

type WorkspaceValue = {
  loading: boolean;
  error: string | null;
  userId: string | null;
  businesses: BusinessRow[];
  locations: LocationRow[];
  activeBusiness: BusinessRow | null;
  setActiveBusinessId: (id: string) => void;
  refresh: () => void;
};

const WorkspaceContext = createContext<WorkspaceValue>({
  loading: true,
  error: null,
  userId: null,
  businesses: [],
  locations: [],
  activeBusiness: null,
  setActiveBusinessId: () => {},
  refresh: () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const fetchWorkspace = useServerFn(getWorkspace);
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace"],
    queryFn: () => fetchWorkspace(),
  });

  useEffect(() => {
    if (!data?.businesses?.length) return;
    const stored = localStorage.getItem("orbital-business");
    const exists = data.businesses.find((b) => b.id === stored);
    setActiveId((current) => current ?? exists?.id ?? data.businesses[0]!.id);
  }, [data]);

  const value = useMemo<WorkspaceValue>(() => {
    const businesses = data?.businesses ?? [];
    const activeBusiness = businesses.find((b) => b.id === activeId) ?? businesses[0] ?? null;
    return {
      loading: isLoading,
      error: error ? (error as Error).message : null,
      userId: data?.userId ?? null,
      businesses,
      locations: (data?.locations ?? []).filter((l) => l.business_id === activeBusiness?.id),
      activeBusiness,
      setActiveBusinessId: (id: string) => {
        localStorage.setItem("orbital-business", id);
        setActiveId(id);
      },
      refresh: () => {
        void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      },
    };
  }, [data, activeId, isLoading, error, queryClient]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
