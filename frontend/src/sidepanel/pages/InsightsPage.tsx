import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import type {
  AsyncStatus,
  Conversation,
  SummaryRecord,
  WeeklyReportRecord,
} from "~lib/types";
import {
  generateConversationSummary,
  generateWeeklyReport,
  getConversationSummary,
  getWeeklyReport,
} from "~lib/services/storageService";
import { resolveTurnCount } from "~lib/capture/turn-metrics";
import {
  toChatSummaryData,
  toWeeklySummaryData,
} from "~lib/services/insightAdapter";
import { DisclosureSection } from "../components/DisclosureSection";
import { PlatformTag } from "../components/PlatformTag";
import { StructuredSummaryCard } from "../components/StructuredSummaryCard";
import { StructuredWeeklyCard } from "../components/StructuredWeeklyCard";

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("STORAGE_HARD_LIMIT_REACHED")) {
      return "Storage limit reached (1GB). Export or clear data in the Data tab.";
    }
    return error.message;
  }
  return String(error);
}

interface InsightsPageProps {
  conversation: Conversation | null;
  refreshToken: number;
}

export function InsightsPage({ conversation, refreshToken }: InsightsPageProps) {
  const [summary, setSummary] = useState<SummaryRecord | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<AsyncStatus>("idle");
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportRecord | null>(null);
  const [weeklyStatus, setWeeklyStatus] = useState<AsyncStatus>("idle");
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  const weeklyRange = useMemo(() => {
    const rangeEnd = Date.now();
    const rangeStart = rangeEnd - 7 * 24 * 60 * 60 * 1000;
    return { rangeStart, rangeEnd };
  }, []);

  useEffect(() => {
    if (!conversation) {
      setSummary(null);
      setSummaryStatus("idle");
      setSummaryError(null);
      return;
    }

    setSummaryStatus("loading");
    setSummaryError(null);

    getConversationSummary(conversation.id)
      .then((data) => {
        setSummary(data);
        setSummaryStatus(data ? "ready" : "idle");
      })
      .catch((error) => {
        setSummary(null);
        setSummaryStatus("error");
        setSummaryError(getErrorMessage(error));
      });
  }, [conversation?.id, refreshToken]);

  useEffect(() => {
    setWeeklyStatus("loading");
    setWeeklyError(null);

    getWeeklyReport(weeklyRange.rangeStart, weeklyRange.rangeEnd)
      .then((data) => {
        setWeeklyReport(data);
        setWeeklyStatus(data ? "ready" : "idle");
      })
      .catch((error) => {
        setWeeklyReport(null);
        setWeeklyStatus("error");
        setWeeklyError(getErrorMessage(error));
      });
  }, [refreshToken, weeklyRange.rangeStart, weeklyRange.rangeEnd]);

  const handleGenerateSummary = async () => {
    if (!conversation) return;

    setSummaryStatus("loading");
    setSummaryError(null);

    try {
      const data = await generateConversationSummary(conversation.id);
      setSummary(data);
      setSummaryStatus("ready");
    } catch (error) {
      setSummaryStatus("error");
      setSummaryError(getErrorMessage(error));
    }
  };

  const handleGenerateWeekly = async () => {
    setWeeklyStatus("loading");
    setWeeklyError(null);

    try {
      const data = await generateWeeklyReport(
        weeklyRange.rangeStart,
        weeklyRange.rangeEnd
      );
      setWeeklyReport(data);
      setWeeklyStatus("ready");
    } catch (error) {
      setWeeklyStatus("error");
      setWeeklyError(getErrorMessage(error));
    }
  };

  const summaryData = summary
    ? toChatSummaryData(summary, {
        conversationTitle: conversation?.title,
      })
    : null;

  const weeklyData = weeklyReport ? toWeeklySummaryData(weeklyReport) : null;
  const turnCount = conversation
    ? resolveTurnCount(conversation.turn_count, conversation.message_count)
    : 0;

  return (
    <div className="vesti-shell flex h-full flex-col overflow-y-auto vesti-scroll bg-bg-app">
      <header className="flex h-9 shrink-0 items-center px-4">
        <h1 className="vesti-page-title text-text-primary">Insights</h1>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <DisclosureSection
          title="Conversation Summary"
          description="Generate and review structured summaries for the active thread."
        >
          {!conversation && (
            <p className="text-[13px] text-text-tertiary">
              Select a conversation from Threads to generate a summary.
            </p>
          )}

          {conversation && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[15px] font-medium text-text-primary">
                    {conversation.title}
                  </p>
                  <p className="text-[13px] text-text-tertiary">
                    {conversation.message_count} messages · {turnCount} turns
                  </p>
                </div>
                <PlatformTag platform={conversation.platform} />
              </div>

              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={summaryStatus === "loading"}
                className="flex w-fit items-center gap-1 rounded-md border border-border-default bg-bg-primary px-3 py-1.5 text-[13px] font-medium text-text-primary transition-colors duration-200 hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
              >
                {summaryStatus === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                {summary ? "Regenerate" : "Generate"}
              </button>

              <div className="min-h-[160px] rounded-md bg-bg-surface p-3">
                {summaryStatus === "loading" && !summaryData && (
                  <div className="flex items-center gap-2 text-[13px] text-text-tertiary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing conversation context...
                  </div>
                )}

                {summaryStatus === "error" && (
                  <div className="flex items-center gap-2 text-[13px] text-danger">
                    <span>Failed to summarize. {summaryError}</span>
                    <button
                      type="button"
                      onClick={handleGenerateSummary}
                      className="text-[13px] text-text-secondary underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!summaryData &&
                  summaryStatus !== "loading" &&
                  summaryStatus !== "error" && (
                    <p className="text-[13px] text-text-tertiary">
                      No summary yet.
                    </p>
                  )}

                {summaryData && <StructuredSummaryCard data={summaryData} />}
              </div>

              {summary && (
                <div className="text-[12px] text-text-tertiary">
                  Model: {summary.modelId} · Generated:{" "}
                  {formatDateTime(summary.createdAt)}
                </div>
              )}
            </div>
          )}
        </DisclosureSection>

        <DisclosureSection
          title="Weekly Summary"
          description="Review weekly highlights generated from the last seven days."
          icon={<CalendarDays className="h-4 w-4" strokeWidth={1.75} />}
        >
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={handleGenerateWeekly}
              disabled={weeklyStatus === "loading"}
              className="flex w-fit items-center gap-1 rounded-md border border-border-default bg-bg-primary px-3 py-1.5 text-[13px] font-medium text-text-primary transition-colors duration-200 hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              {weeklyStatus === "loading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {weeklyReport ? "Regenerate" : "Generate"}
            </button>

            <div className="min-h-[160px] rounded-md bg-bg-surface p-3">
              {weeklyStatus === "loading" && !weeklyData && (
                <div className="flex items-center gap-2 text-[13px] text-text-tertiary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing weekly conversation context...
                </div>
              )}

              {weeklyStatus === "error" && (
                <div className="flex items-center gap-2 text-[13px] text-danger">
                  <span>Failed to summarize. {weeklyError}</span>
                  <button
                    type="button"
                    onClick={handleGenerateWeekly}
                    className="text-[13px] text-text-secondary underline underline-offset-2"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!weeklyData &&
                weeklyStatus !== "loading" &&
                weeklyStatus !== "error" && (
                  <p className="text-[13px] text-text-tertiary">
                    No weekly summary yet.
                  </p>
                )}

              {weeklyData && <StructuredWeeklyCard data={weeklyData} />}
            </div>

            {weeklyReport && (
              <div className="text-[12px] text-text-tertiary">
                Model: {weeklyReport.modelId} · Generated:{" "}
                {formatDateTime(weeklyReport.createdAt)}
              </div>
            )}
          </div>
        </DisclosureSection>
      </div>
    </div>
  );
}
