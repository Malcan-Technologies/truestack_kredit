"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatRelativeTime } from "@/lib/utils";

export interface StaffNoteDto {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string } | null;
}

interface StaffNotesResponse {
  success: boolean;
  data?: StaffNoteDto[];
  pagination?: { hasMore: boolean; nextCursor: string | null };
  error?: string;
}

/**
 * Admin-only internal notes (Shopify-style thread). Not visible to borrowers.
 * @param apiPath path after /api/ on the backend e.g. `borrowers/:id/staff-notes`
 */
export function InternalStaffNotesPanel({
  apiPath,
  title = "Internal notes",
  description = "Visible only to your team.",
}: {
  apiPath: string;
  title?: string;
  description?: string;
}) {
  const [notes, setNotes] = useState<StaffNoteDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composer, setComposer] = useState("");
  const [posting, setPosting] = useState(false);
  const [highlightNoteId, setHighlightNoteId] = useState<string | null>(null);

  const normalizedPath = apiPath.replace(/^\/+/, "").replace(/^api\//, "");

  const load = useCallback(
    async (append: boolean, nextCursor?: string | null) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const q = new URLSearchParams({ limit: "25" });
        if (nextCursor) q.set("cursor", nextCursor);
        const res = await fetch(`/api/proxy/${normalizedPath}?${q.toString()}`, {
          credentials: "include",
        });
        const json = (await res.json()) as StaffNotesResponse;
        if (!json.success || !json.data) {
          throw new Error(json.error || "Failed to load notes");
        }
        setNotes((prev) => (append ? [...prev, ...json.data!] : json.data!));
        setHasMore(json.pagination?.hasMore ?? false);
        setCursor(json.pagination?.nextCursor ?? null);
      } catch (e) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "Failed to load notes");
        if (!append) setNotes([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [normalizedPath]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!highlightNoteId) return;
    const t = window.setTimeout(() => setHighlightNoteId(null), 4000);
    return () => window.clearTimeout(t);
  }, [highlightNoteId]);

  const onSubmit = async () => {
    const body = composer.trim();
    if (!body) {
      toast.error("Write a note first");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(`/api/proxy/${normalizedPath}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json()) as { success: boolean; data?: StaffNoteDto; error?: string };
      if (!json.success || !json.data) {
        throw new Error(json.error || "Could not save note");
      }
      setComposer("");
      setNotes((prev) => [json.data!, ...prev]);
      setHighlightNoteId(json.data.id);
      toast.success("Note added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setPosting(false);
    }
  };

  const authorLabel = (n: StaffNoteDto) =>
    n.author?.name?.trim() || n.author?.email || "Team member";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="Add an internal note…"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            rows={3}
            className="resize-y min-h-[80px] text-sm"
            disabled={posting}
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => void onSubmit()} disabled={posting || loading}>
              {posting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                "Add note"
              )}
            </Button>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading notes…
            </div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No notes yet</p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "rounded-lg border border-border/50 px-3 py-2.5 text-sm space-y-1.5 transition-colors",
                  highlightNoteId === n.id
                    ? "bg-muted/5 dark:bg-muted/[0.07]"
                    : "bg-muted/10 dark:bg-muted/15"
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground">{authorLabel(n)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{n.body}</p>
              </div>
            ))
          )}
          {hasMore && !loading ? (
            <div className="pt-1 text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void load(true, cursor)}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading…
                  </>
                ) : (
                  "Load older notes"
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
