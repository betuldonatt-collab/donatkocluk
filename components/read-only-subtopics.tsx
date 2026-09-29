// A rolled-up LGS selection row's hidden subtopics (see
// lib/curriculum/lgs-selection.ts), rendered as small read-only chips
// instead of one dense comma-separated line -- shared verbatim by every
// Kaynak Takibi table, Analiz table, and topic-mistake selector (both
// panels) that shows a SelectionRow/LgsSelectionNode's `readOnlyNames`.
export function ReadOnlySubtopics({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span key={name} className="bg-muted/60 text-muted-foreground rounded-md px-2 py-0.5 text-[11px] leading-normal font-normal">
          {name}
        </span>
      ))}
    </div>
  );
}
