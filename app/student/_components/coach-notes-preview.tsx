import { NotebookText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type CoachNote = { id: string; body: string; createdAt: string };

export function CoachNotesPreview({ notes }: { notes: CoachNote[] }) {
  return (
    <Card>
      <CardHeader>
        <NotebookText className="text-primary size-6" />
        <CardTitle className="text-base">Koçundan Notlar</CardTitle>
        <CardDescription>
          {notes.length === 0 ? "Henüz bir not bırakılmadı." : "Koçunun son notları"}
        </CardDescription>
      </CardHeader>
      {notes.length > 0 && (
        <CardContent className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="border-border bg-background rounded-md border p-3 text-sm"
            >
              <p className="text-foreground whitespace-pre-wrap">{note.body}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {new Date(note.createdAt).toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
