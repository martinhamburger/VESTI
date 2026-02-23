import type { ChatSummaryData } from "~lib/types/insightsPresentation";

interface StructuredSummaryCardProps {
  data: ChatSummaryData;
}

function FallbackBadge() {
  return (
    <span className="tag-paper inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium text-text-tertiary font-sans">
      Fallback plain text
    </span>
  );
}

function SectionEyebrow({ children }: { children: string }) {
  return (
    <h4 className="mb-3 text-[12px] font-medium uppercase tracking-[0.05em] text-text-secondary font-sans">
      {children}
    </h4>
  );
}

export function StructuredSummaryCard({ data }: StructuredSummaryCardProps) {
  return (
    <article className="vesti-artifact card-shadow-warm rounded-card border border-border-subtle bg-bg-surface px-6 py-6 text-body-lg text-text-primary">
      <header className="mb-6 grid gap-3">
        <h3 className="text-[20px] leading-[1.4] text-text-primary font-medium">
          {data.meta.title}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {data.meta.tags.map((tag) => (
            <span
              key={tag}
              className="tag-paper inline-flex items-center rounded-[6px] px-2 py-0.5 text-[13px] font-medium text-text-secondary font-sans"
            >
              {tag}
            </span>
          ))}
          {data.meta.fallback && <FallbackBadge />}
        </div>
      </header>

      <section className="mb-6 rounded-r-lg border-l-4 border-border-default bg-bg-secondary px-4 py-3">
        <SectionEyebrow>Core Question</SectionEyebrow>
        <p className="text-reading-lg text-text-primary">{data.core_question}</p>
      </section>

      <section className="mb-6">
        <SectionEyebrow>Thinking Journey</SectionEyebrow>
        <ol className="space-y-3 text-text-primary">
          {data.thinking_journey.map((item) => (
            <li key={`${item.step}-${item.speaker}-${item.assertion}`} className="rounded-md border border-border-subtle p-3">
              <p className="mb-1 text-[11px] font-medium text-text-secondary font-sans">
                Step {item.step} · {item.speaker}
              </p>
              <p className="text-reading-lg text-text-primary">{item.assertion}</p>
              {item.real_world_anchor && (
                <p className="mt-2 text-[13px] text-text-secondary">
                  <span className="font-medium">实证案例：</span>
                  {item.real_world_anchor}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-6">
        <SectionEyebrow>Key Insights</SectionEyebrow>
        <ul className="space-y-3 text-text-primary">
          {data.key_insights.map((item, index) => (
            <li key={`${item.term}-${index}`} className="rounded-md border border-border-subtle p-3">
              <p className="font-medium">{item.term}</p>
              <p className="mt-1 text-text-secondary">{item.definition}</p>
            </li>
          ))}
        </ul>
      </section>

      {data.unresolved_threads.length > 0 && (
        <section className="mb-6">
          <SectionEyebrow>Unresolved Threads</SectionEyebrow>
          <ul className="list-disc space-y-3 pl-6 text-text-primary">
            {data.unresolved_threads.map((item, index) => (
              <li key={`${item}-${index}`} className="pl-1">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6 rounded-lg border border-border-subtle bg-bg-secondary/60 px-4 py-3">
        <SectionEyebrow>Meta Observations</SectionEyebrow>
        <p className="text-text-primary">
          <span className="font-medium">Thinking style:</span> {data.meta_observations.thinking_style}
        </p>
        <p className="text-text-primary">
          <span className="font-medium">Emotional tone:</span> {data.meta_observations.emotional_tone}
        </p>
        <p className="text-text-primary">
          <span className="font-medium">Depth:</span> {data.meta_observations.depth_level}
        </p>
      </section>

      {data.actionable_next_steps.length > 0 && (
        <section>
          <SectionEyebrow>Next Steps</SectionEyebrow>
          <ul className="space-y-3">
            {data.actionable_next_steps.map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-start gap-2 text-text-primary">
                <input
                  aria-label={`action-item-${index + 1}`}
                  type="checkbox"
                  disabled
                  className="mt-1 h-3.5 w-3.5 rounded border-border-default"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
