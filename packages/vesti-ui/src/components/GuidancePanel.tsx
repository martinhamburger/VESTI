"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

type GuidanceWin = "library" | "explore" | "network";
type GuidanceFocus = "capture" | GuidanceWin;
type GuidanceStep = 0 | 1 | 2 | 3;
type GuidanceKeep = "decisions" | "research" | "people" | "threads";
type GuidanceBreak = "unsaved" | "buried" | "reuse" | "links";

interface GuidancePanelProps {
  onClose: () => void;
  onOpenPath: (tab: GuidanceWin) => void;
}

interface GuidanceDraft {
  keep: GuidanceKeep;
  memoryBreak: GuidanceBreak;
  note: string;
  step: GuidanceStep;
}

interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
}

const GUIDANCE_STORAGE_KEY = "vesti_dashboard_guidance_v3";

const KEEP_OPTIONS: ChoiceOption<GuidanceKeep>[] = [
  { value: "decisions", label: "Decisions" },
  { value: "research", label: "Research" },
  { value: "people", label: "People" },
  { value: "threads", label: "Threads" },
];

const BREAK_OPTIONS: ChoiceOption<GuidanceBreak>[] = [
  { value: "unsaved", label: "Unsaved" },
  { value: "buried", label: "Buried" },
  { value: "reuse", label: "Hard to reuse" },
  { value: "links", label: "No links" },
];

const DEFAULT_GUIDANCE_DRAFT: GuidanceDraft = {
  keep: "decisions",
  memoryBreak: "buried",
  note: "",
  step: 0,
};

function readDraft(): GuidanceDraft {
  if (typeof window === "undefined") return DEFAULT_GUIDANCE_DRAFT;
  try {
    const raw = window.localStorage.getItem(GUIDANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_GUIDANCE_DRAFT;
    const parsed = JSON.parse(raw) as Partial<GuidanceDraft>;
    return {
      keep:
        parsed.keep === "decisions" ||
        parsed.keep === "research" ||
        parsed.keep === "people" ||
        parsed.keep === "threads"
          ? parsed.keep
          : DEFAULT_GUIDANCE_DRAFT.keep,
      memoryBreak:
        parsed.memoryBreak === "unsaved" ||
        parsed.memoryBreak === "buried" ||
        parsed.memoryBreak === "reuse" ||
        parsed.memoryBreak === "links"
          ? parsed.memoryBreak
          : DEFAULT_GUIDANCE_DRAFT.memoryBreak,
      note: typeof parsed.note === "string" ? parsed.note : "",
      step:
        parsed.step === 0 || parsed.step === 1 || parsed.step === 2 || parsed.step === 3
          ? parsed.step
          : DEFAULT_GUIDANCE_DRAFT.step,
    };
  } catch {
    return DEFAULT_GUIDANCE_DRAFT;
  }
}

function getKeepLabel(value: GuidanceKeep): string {
  return KEEP_OPTIONS.find((option) => option.value === value)?.label ?? "Decisions";
}

function getBreakLabel(value: GuidanceBreak): string {
  return BREAK_OPTIONS.find((option) => option.value === value)?.label ?? "Buried";
}

function getFocus(value: GuidanceBreak): GuidanceFocus {
  if (value === "unsaved") return "capture";
  if (value === "reuse") return "library";
  if (value === "links") return "network";
  return "explore";
}

function getFocusLabel(value: GuidanceFocus): string {
  if (value === "capture") return "Capture";
  if (value === "library") return "Compress";
  if (value === "network") return "Network";
  return "Explore";
}

function getPrimaryAction(focus: GuidanceFocus): { label: string; tab: GuidanceWin } {
  if (focus === "network") {
    return { label: "Open Network", tab: "network" };
  }
  if (focus === "explore") {
    return { label: "Open Explore", tab: "explore" };
  }
  return { label: "Open Library", tab: "library" };
}

function buildRecommendation(draft: GuidanceDraft): string {
  const keep = getKeepLabel(draft.keep).toLowerCase();
  const focus = getFocus(draft.memoryBreak);

  if (focus === "capture") {
    return `Start with Capture. Keep ${keep}.`;
  }
  if (focus === "library") {
    return `Start with Compress. Reuse ${keep}.`;
  }
  if (focus === "network") {
    return `Start with Network. Link ${keep}.`;
  }
  return `Start with Explore. Find ${keep} fast.`;
}

function StepDot({
  active,
  completed,
  label,
  onClick,
}: {
  active: boolean;
  completed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition-colors ${
        active
          ? "border-accent-primary bg-accent-primary text-white"
          : completed
            ? "border-accent-primary/30 bg-accent-primary-light text-text-primary"
            : "border-border-subtle bg-bg-primary text-text-tertiary hover:bg-bg-secondary"
      }`}
    >
      {label}
    </button>
  );
}

function ChoiceCard<T extends string>({
  option,
  selected,
  onClick,
}: {
  option: ChoiceOption<T>;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[22px] border px-4 py-4 text-left transition-colors ${
        selected
          ? "border-accent-primary/40 bg-accent-primary-light"
          : "border-border-subtle bg-bg-primary hover:bg-bg-secondary"
      }`}
    >
      <div className="text-[16px] font-medium text-text-primary">{option.label}</div>
    </button>
  );
}

export function GuidancePanel({ onClose, onOpenPath }: GuidancePanelProps) {
  const [draft, setDraft] = useState<GuidanceDraft>(DEFAULT_GUIDANCE_DRAFT);

  useEffect(() => {
    setDraft(readDraft());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GUIDANCE_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  const focus = useMemo(() => getFocus(draft.memoryBreak), [draft.memoryBreak]);
  const focusLabel = useMemo(() => getFocusLabel(focus), [focus]);
  const recommendation = useMemo(() => buildRecommendation(draft), [draft]);
  const primaryAction = useMemo(() => getPrimaryAction(focus), [focus]);

  const setStep = (step: GuidanceStep) => {
    setDraft((current) => ({ ...current, step }));
  };

  const selectKeep = (keep: GuidanceKeep) => {
    setDraft((current) => ({
      ...current,
      keep,
      step: 1,
    }));
  };

  const selectBreak = (memoryBreak: GuidanceBreak) => {
    setDraft((current) => ({
      ...current,
      memoryBreak,
      step: 2,
    }));
  };

  const nextStep = () => {
    setDraft((current) => ({
      ...current,
      step: Math.min(current.step + 1, 3) as GuidanceStep,
    }));
  };

  const previousStep = () => {
    setDraft((current) => ({
      ...current,
      step: Math.max(current.step - 1, 0) as GuidanceStep,
    }));
  };

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="border-b border-border-subtle px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />
              Guidance
            </div>
            <p className="mt-3 text-[14px] text-text-secondary">Short setup.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border-subtle px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-secondary"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StepDot
            active={draft.step === 0}
            completed={draft.step > 0}
            label="1"
            onClick={() => setStep(0)}
          />
          <StepDot
            active={draft.step === 1}
            completed={draft.step > 1}
            label="2"
            onClick={() => setStep(1)}
          />
          <StepDot
            active={draft.step === 2}
            completed={draft.step > 2}
            label="3"
            onClick={() => setStep(2)}
          />
          <StepDot
            active={draft.step === 3}
            completed={false}
            label="Done"
            onClick={() => setStep(3)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-2xl">
          <section className="flex min-h-[420px] flex-col rounded-[28px] border border-border-subtle bg-bg-surface p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-8">
            {draft.step === 0 ? (
              <>
                <h3 className="text-[34px] leading-tight text-text-primary">Keep?</h3>
                <p className="mt-2 text-[13px] text-text-secondary">Choose one.</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {KEEP_OPTIONS.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      option={option}
                      selected={draft.keep === option.value}
                      onClick={() => selectKeep(option.value)}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {draft.step === 1 ? (
              <>
                <h3 className="text-[34px] leading-tight text-text-primary">Break?</h3>
                <p className="mt-2 text-[13px] text-text-secondary">Choose one.</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {BREAK_OPTIONS.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      option={option}
                      selected={draft.memoryBreak === option.value}
                      onClick={() => selectBreak(option.value)}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {draft.step === 2 ? (
              <>
                <h3 className="text-[34px] leading-tight text-text-primary">Add a note?</h3>
                <p className="mt-2 text-[13px] text-text-secondary">Optional.</p>
                <textarea
                  value={draft.note}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, note: event.target.value }))
                  }
                  rows={8}
                  placeholder="Anything important..."
                  className="mt-8 w-full flex-1 resize-none rounded-[24px] border border-border-default bg-bg-primary px-5 py-4 text-[16px] leading-7 text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                />
              </>
            ) : null}

            {draft.step === 3 ? (
              <>
                <h3 className="text-[34px] leading-tight text-text-primary">Start here.</h3>
                <p className="mt-3 max-w-xl text-[15px] leading-7 text-text-secondary">
                  {recommendation}
                </p>

                {draft.note.trim() ? (
                  <div className="mt-5 rounded-[22px] border border-border-subtle bg-bg-primary px-4 py-4">
                    <p className="text-[12px] leading-7 text-text-primary">{draft.note}</p>
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenPath(primaryAction.tab)}
                    className="rounded-full bg-accent-primary px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-primary-hover"
                  >
                    {primaryAction.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft(DEFAULT_GUIDANCE_DRAFT)}
                    className="rounded-full border border-border-subtle px-5 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-secondary"
                  >
                    Reset
                  </button>
                </div>
              </>
            ) : null}

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-border-subtle pt-5">
              <button
                type="button"
                onClick={previousStep}
                disabled={draft.step === 0}
                className="rounded-full border border-border-subtle px-4 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              {draft.step === 2 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="rounded-full bg-accent-primary px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-accent-primary-hover"
                >
                  Next
                </button>
              ) : draft.step === 3 ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border-subtle px-4 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-secondary"
                >
                  Close
                </button>
              ) : (
                <div className="text-[11px] text-text-tertiary">Choose one.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
