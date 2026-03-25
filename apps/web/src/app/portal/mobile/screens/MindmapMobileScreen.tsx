"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  listRecentClientMaps,
  listStandaloneMaps,
  getMindmapByMapId,
  getMindmap,
  type ClientMapItem,
  type FreeMapItem,
  type MindmapState,
} from "@/app/actions/mindmap";
import { MindmapListClient } from "@/app/portal/mindmap/MindmapListClient";
import { MindmapView } from "@/app/portal/mindmap/MindmapView";
import { ErrorState, LoadingSkeleton } from "@/app/shared/mobile-ui/primitives";

export function MindmapHubMobileScreen() {
  const searchParams = useSearchParams();
  const contactIdFromQuery = searchParams.get("contactId");
  const householdIdFromQuery = searchParams.get("householdId");

  const [entityMapState, setEntityMapState] = useState<MindmapState | null>(null);
  const [entityMapError, setEntityMapError] = useState<string | null>(null);
  const [entityMapPending, startEntityMapTransition] = useTransition();

  const [clientMaps, setClientMaps] = useState<ClientMapItem[]>([]);
  const [standaloneMaps, setStandaloneMaps] = useState<FreeMapItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const entityKey =
    contactIdFromQuery != null && contactIdFromQuery !== ""
      ? `contact:${contactIdFromQuery}`
      : householdIdFromQuery != null && householdIdFromQuery !== ""
        ? `household:${householdIdFromQuery}`
        : null;

  useEffect(() => {
    if (!entityKey) {
      setEntityMapState(null);
      setEntityMapError(null);
      return;
    }
    const [type, id] = entityKey.split(":") as ["contact" | "household", string];
    startEntityMapTransition(async () => {
      setEntityMapError(null);
      try {
        const state = await getMindmap(type, id);
        setEntityMapState(state);
      } catch (e) {
        setEntityMapError(e instanceof Error ? e.message : "Chyba načtení mapy");
        setEntityMapState(null);
      }
    });
  }, [entityKey]);

  function refresh() {
    startTransition(async () => {
      try {
        const [c, s] = await Promise.all([listRecentClientMaps(), listStandaloneMaps()]);
        setClientMaps(c);
        setStandaloneMaps(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chyba načtení");
      }
    });
  }

  useEffect(() => {
    if (entityKey) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [entityKey]);

  if (entityKey) {
    if (entityMapPending && !entityMapState) {
      return <LoadingSkeleton variant="card" rows={3} />;
    }
    if (entityMapError || !entityMapState) {
      return (
        <ErrorState
          title={entityMapError ?? "Mapu se nepodařilo načíst"}
          onRetry={() => {
            if (!entityKey) return;
            const [type, id] = entityKey.split(":") as ["contact" | "household", string];
            startEntityMapTransition(async () => {
              setEntityMapError(null);
              try {
                setEntityMapState(await getMindmap(type, id));
              } catch (e) {
                setEntityMapError(e instanceof Error ? e.message : "Chyba načtení mapy");
                setEntityMapState(null);
              }
            });
          }}
        />
      );
    }
    return (
      <div className="-mx-4 -mt-4 min-h-[70vh] bg-[#f8fafc]">
        <MindmapView initial={entityMapState} />
      </div>
    );
  }

  if (pending && clientMaps.length === 0 && standaloneMaps.length === 0) {
    return <LoadingSkeleton variant="list" rows={6} />;
  }
  if (error) return <ErrorState title={error} onRetry={refresh} />;

  return (
    <div className="-mx-2">
      <MindmapListClient
        clientMaps={clientMaps}
        standaloneMaps={standaloneMaps}
        onRefresh={refresh}
      />
    </div>
  );
}

export function MindmapMapMobileScreen({ mapId }: { mapId: string }) {
  const [state, setState] = useState<MindmapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      try {
        setState(await getMindmapByMapId(mapId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chyba načtení");
        setState(null);
      }
    });
  }, [mapId]);

  if (pending && !state) {
    return <LoadingSkeleton variant="card" rows={3} />;
  }
  if (error || !state) {
    return <ErrorState title={error ?? "Mapa nenalezena"} onRetry={() => window.location.assign("/portal/mindmap")} />;
  }

  return (
    <div className="-mx-4 -mt-4 min-h-[70vh] bg-[#f8fafc]">
      <MindmapView initial={state} />
    </div>
  );
}
