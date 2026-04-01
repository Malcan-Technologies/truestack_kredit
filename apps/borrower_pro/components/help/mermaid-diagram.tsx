"use client";

import { useEffect, useId, useMemo, useState } from "react";
import mermaid from "mermaid";
import { useTheme } from "next-themes";

type MermaidDiagramProps = {
  chart: string;
};

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const { resolvedTheme } = useTheme();
  const reactId = useId();
  const diagramId = useMemo(
    () => `borrower-help-${reactId.replace(/[:]/g, "")}`,
    [reactId]
  );
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function renderChart() {
      try {
        setError(null);
        setSvg("");

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolvedTheme === "dark" ? "dark" : "default",
          fontFamily: "Inter, sans-serif",
          themeVariables: {
            fontSize: "13px",
          },
        });

        const { svg: renderedSvg } = await mermaid.render(
          `${diagramId}-${resolvedTheme ?? "light"}`,
          chart
        );

        if (active) {
          setSvg(renderedSvg);
        }
      } catch (renderError) {
        if (active) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : "We couldn't render this diagram."
          );
        }
      }
    }

    void renderChart();

    return () => {
      active = false;
    };
  }, [chart, diagramId, resolvedTheme]);

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Diagram unavailable</p>
          <p className="text-sm text-muted-foreground">
            Mermaid could not render this flowchart, so the source is shown below.
          </p>
        </div>
        <pre className="overflow-x-auto p-4 text-sm text-muted-foreground">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {svg ? (
        <div
          className="overflow-x-auto p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-3xl"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Rendering diagram...
        </div>
      )}
    </div>
  );
}
