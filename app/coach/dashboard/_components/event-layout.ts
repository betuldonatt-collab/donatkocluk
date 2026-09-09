export type LayoutInput = { id: string; startMs: number; endMs: number };
export type LayoutSlot = { col: number; cols: number };

// Standard day-view collision layout: events that transitively overlap in
// time share a cluster and split into equal-width side-by-side columns
// (greedy column assignment, first free column wins), so overlapping
// events never fully hide each other.
export function layoutDayEvents(events: LayoutInput[]): Map<string, LayoutSlot> {
  const sorted = [...events].sort((a, b) => a.startMs - b.startMs);
  const result = new Map<string, LayoutSlot>();
  let cluster: LayoutInput[] = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const colOf = new Map<string, number>();
    for (const ev of cluster) {
      let placed = false;
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= ev.startMs) {
          columnEnds[c] = ev.endMs;
          colOf.set(ev.id, c);
          placed = true;
          break;
        }
      }
      if (!placed) {
        columnEnds.push(ev.endMs);
        colOf.set(ev.id, columnEnds.length - 1);
      }
    }
    const cols = columnEnds.length;
    for (const ev of cluster) {
      result.set(ev.id, { col: colOf.get(ev.id)!, cols });
    }
    cluster = [];
  }

  for (const ev of sorted) {
    if (cluster.length > 0 && ev.startMs >= clusterEnd) {
      flushCluster();
      clusterEnd = -Infinity;
    }
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMs);
  }
  flushCluster();

  return result;
}
