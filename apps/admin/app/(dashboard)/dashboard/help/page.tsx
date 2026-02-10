"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Book, ChevronRight, FileText, Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DocFile {
  slug: string;
  title: string;
  filename: string;
  order: number;
}

interface DocCategory {
  name: string;
  slug: string;
  order: number;
  docs: DocFile[];
}

interface DocContent {
  slug: string;
  title: string;
  content: string;
  frontmatter: Record<string, string>;
}

export default function HelpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [currentDoc, setCurrentDoc] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const docSlug = searchParams.get("doc");

  // Fetch all docs structure
  useEffect(() => {
    const fetchDocs = async () => {
      setLoading(true);
      try {
        const res = await api.get<DocCategory[]>("/api/docs");
        if (res.success && res.data) {
          setCategories(Array.isArray(res.data) ? res.data : []);
          // Expand all categories by default
          const allCategories = new Set(res.data.map((c: DocCategory) => c.slug));
          setExpandedCategories(allCategories);
        }
      } catch (error) {
        console.error("Failed to fetch docs:", error);
      }
      setLoading(false);
    };
    fetchDocs();
  }, []);

  // Fetch specific doc when slug changes
  useEffect(() => {
    const fetchDoc = async () => {
      if (!docSlug) {
        setCurrentDoc(null);
        return;
      }

      setDocLoading(true);
      try {
        const res = await api.get<DocContent>(`/api/docs/${docSlug}`);
        if (res.success && res.data) {
          setCurrentDoc(res.data);
        } else {
          setCurrentDoc(null);
        }
      } catch (error) {
        console.error("Failed to fetch doc:", error);
        setCurrentDoc(null);
      }
      setDocLoading(false);
      setSidebarOpen(false);
    };
    fetchDoc();
  }, [docSlug]);

  const toggleCategory = (slug: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const navigateToDoc = (slug: string) => {
    router.push(`/dashboard/help?doc=${encodeURIComponent(slug)}`);
  };

  // Filter docs based on search query
  const filteredCategories = categories
    .map((category) => ({
      ...category,
      docs: category.docs.filter((doc) =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((category) => category.docs.length > 0);

  // Get all docs flattened for navigation
  const allDocs = categories.flatMap((c) => c.docs);
  const currentIndex = allDocs.findIndex((d) => d.slug === docSlug);
  const prevDoc = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
  const nextDoc = currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed bottom-4 right-4 z-50 lg:hidden shadow-lg bg-surface border border-border"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative top-0 left-0 z-50 lg:z-0 h-full w-72 bg-surface border-r border-border flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-heading font-bold flex items-center gap-2">
            <Book className="h-5 w-5 text-accent" />
            Help Center
          </h2>
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documentation..."
              className="pl-10"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="p-4 text-muted text-sm">Loading...</div>
          ) : filteredCategories.length === 0 ? (
            <div className="p-4 text-muted text-sm">No documentation found</div>
          ) : (
            <ul className="space-y-1">
              {filteredCategories.map((category) => (
                <li key={category.slug || "general"}>
                  {/* Category header (if not "General") */}
                  {category.name !== "General" && (
                    <button
                      onClick={() => toggleCategory(category.slug)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted hover:text-foreground rounded-lg hover:bg-background transition-colors"
                    >
                      <span>{category.name}</span>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          expandedCategories.has(category.slug) && "rotate-90"
                        )}
                      />
                    </button>
                  )}

                  {/* Docs list */}
                  {(category.name === "General" ||
                    expandedCategories.has(category.slug)) && (
                    <ul className={cn(category.name !== "General" && "ml-2")}>
                      {category.docs.map((doc) => (
                        <li key={doc.slug}>
                          <button
                            onClick={() => navigateToDoc(doc.slug)}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left",
                              docSlug === doc.slug
                                ? "bg-accent/10 text-accent font-medium"
                                : "text-muted hover:text-foreground hover:bg-background"
                            )}
                          >
                            <FileText className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{doc.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {docLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted">Loading...</div>
          </div>
        ) : currentDoc ? (
          <div className="max-w-4xl mx-auto p-6 lg:p-8">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted mb-6">
              <button
                onClick={() => router.push("/dashboard/help")}
                className="hover:text-foreground"
              >
                Help
              </button>
              <ChevronRight className="h-4 w-4" />
              <span className="text-foreground">{currentDoc.title}</span>
            </div>

            {/* Document content */}
            <article className="prose prose-invert prose-orange max-w-none">
              <MarkdownRenderer content={currentDoc.content} onNavigate={navigateToDoc} />
            </article>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-12 pt-6 border-t border-border">
              {prevDoc ? (
                <Button
                  variant="ghost"
                  onClick={() => navigateToDoc(prevDoc.slug)}
                  className="flex items-center gap-2"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                  <span className="hidden sm:inline">{prevDoc.title}</span>
                  <span className="sm:hidden">Previous</span>
                </Button>
              ) : (
                <div />
              )}
              {nextDoc ? (
                <Button
                  variant="ghost"
                  onClick={() => navigateToDoc(nextDoc.slug)}
                  className="flex items-center gap-2"
                >
                  <span className="hidden sm:inline">{nextDoc.title}</span>
                  <span className="sm:hidden">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <div />
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Book className="h-16 w-16 text-muted mb-4" />
            <h2 className="text-2xl font-heading font-bold mb-2">
              Welcome to Help Center
            </h2>
            <p className="text-muted max-w-md mb-6">
              Browse our documentation to learn how to use TrueKredit
              effectively. Select a topic from the sidebar to get started.
            </p>

            {/* Quick links */}
            {categories.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
                {allDocs.slice(0, 6).map((doc) => (
                  <Card
                    key={doc.slug}
                    className="cursor-pointer hover:border-accent/50 transition-colors"
                    onClick={() => navigateToDoc(doc.slug)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <FileText className="h-5 w-5 text-accent" />
                      <span className="text-sm font-medium truncate">
                        {doc.title}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Simple Markdown renderer component
 */
function MarkdownRenderer({ content, onNavigate }: { content: string; onNavigate?: (slug: string) => void }) {
  // Convert markdown to HTML (basic implementation)
  const html = convertMarkdownToHtml(content);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a[data-doc]') as HTMLAnchorElement | null;
    if (anchor && onNavigate) {
      e.preventDefault();
      const slug = anchor.getAttribute('data-doc');
      if (slug) onNavigate(slug);
    }
  };

  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  );
}

/**
 * Basic markdown to HTML converter
 */
function convertMarkdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape HTML
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6 class="text-sm font-medium mt-6 mb-2">$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="text-base font-medium mt-6 mb-2">$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4 class="text-lg font-medium mt-6 mb-3">$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-xl font-semibold mt-8 mb-3">$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="text-2xl font-bold mt-10 mb-4 text-gradient">$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="text-3xl font-heading font-bold mb-6">$1</h1>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="my-8 border-border" />');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="bg-background rounded-lg p-4 overflow-x-auto my-4 border border-border"><code class="text-sm">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-background px-1.5 py-0.5 rounded text-sm text-accent">$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links - internal doc links use data-doc attribute for SPA navigation
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    if (url.startsWith('?doc=')) {
      const slug = url.replace('?doc=', '');
      return `<a href="/dashboard/help${url}" data-doc="${slug}" class="text-accent hover:underline">${text}</a>`;
    }
    return `<a href="${url}" class="text-accent hover:underline" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // Tables - parse markdown tables properly
  html = html.replace(/(\|[^\n]+\|\n)+/g, (tableMatch) => {
    const lines = tableMatch.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return tableMatch;
    
    // Check if second line is separator (contains ---)
    const isSeparator = (line: string) => /^\|[\s\-:|]+\|$/.test(line);
    
    let headerRow = '';
    let bodyRows = '';
    let startIdx = 0;
    
    // If second line is separator, first line is header
    if (lines.length >= 2 && isSeparator(lines[1])) {
      const headerCells = lines[0].split('|').filter(Boolean).map(cell => cell.trim());
      headerRow = `<tr>${headerCells.map(cell => `<th class="px-4 py-3 text-left text-sm font-semibold text-foreground bg-surface border-b border-border">${cell}</th>`).join('')}</tr>`;
      startIdx = 2;
    }
    
    // Process body rows
    for (let i = startIdx; i < lines.length; i++) {
      if (isSeparator(lines[i])) continue;
      const cells = lines[i].split('|').filter(Boolean).map(cell => cell.trim());
      bodyRows += `<tr class="border-b border-border hover:bg-surface/50">${cells.map(cell => `<td class="px-4 py-3 text-sm">${cell}</td>`).join('')}</tr>`;
    }
    
    return `<div class="my-6 overflow-x-auto rounded-lg border border-border"><table class="w-full">${headerRow ? `<thead>${headerRow}</thead>` : ''}<tbody>${bodyRows}</tbody></table></div>`;
  });

  // Lists (unordered)
  html = html.replace(/^-\s+(.+)$/gm, '<li class="ml-4">$1</li>');
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, '<ul class="list-disc list-inside my-4 space-y-1">$&</ul>');

  // Paragraphs
  html = html.replace(/^(?!<[hupolt]|<\/|<li|<hr|<pre|<table|<thead|<tbody|<tr)(.+)$/gm, '<p class="my-4 leading-relaxed">$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p class="my-4 leading-relaxed"><\/p>/g, '');

  // Fix nested list issues
  html = html.replace(/<\/ul>\s*<ul[^>]*>/g, '');

  return html;
}
