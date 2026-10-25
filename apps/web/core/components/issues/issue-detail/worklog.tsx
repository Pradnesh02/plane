/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Popover } from "@plane/propel/popover";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Input } from "@plane/ui";
import { cn, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
// helpers
import { formatDuration, parseDuration } from "@/helpers/worklog";
// hooks
import { useUser } from "@/hooks/store/user";
// services
import { WorkLogService } from "@/services/issue/worklog.service";

const workLogService = new WorkLogService();
const QUICK_PICKS = ["15m", "30m", "1h", "2h"];
// Shades of the accent colour for the per-person share bar.
const SHARE_SHADES = ["bg-accent-primary", "bg-accent-primary/70", "bg-accent-primary/45", "bg-accent-primary/25"];

/** Eases a number towards `target` whenever it changes; jumps straight there for reduced-motion users. */
function useCountUp(target: number, durationMs = 450) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = target;
    if (from === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export const IssueWorkLogProperty = observer(function IssueWorkLogProperty(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { data: currentUser } = useUser();
  const today = renderFormattedPayloadDate(new Date()) ?? "";
  const [duration, setDuration] = useState("");
  const [loggedAt, setLoggedAt] = useState(today);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: workLogs = [], mutate } = useSWR(`ISSUE_WORKLOGS_${issueId}`, () =>
    workLogService.list(workspaceSlug, projectId, issueId)
  );
  const totalMinutes = workLogs.reduce((sum, log) => sum + log.duration, 0);
  const animatedTotal = useCountUp(totalMinutes);
  const parsedDuration = parseDuration(duration);

  // minutes per person, largest first
  const shares = Object.values(
    workLogs.reduce<Record<string, { name: string; minutes: number }>>((acc, log) => {
      const key = log.created_by;
      acc[key] ??= { name: log.logged_by_detail?.display_name ?? "Unknown", minutes: 0 };
      acc[key].minutes += log.duration;
      return acc;
    }, {})
  ).sort((a, b) => b.minutes - a.minutes);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsedDuration) return;
    setIsSubmitting(true);
    try {
      const created = await workLogService.create(workspaceSlug, projectId, issueId, {
        duration: parsedDuration,
        description: description.trim(),
        logged_at: loggedAt || today,
      });
      await mutate([created, ...workLogs], { revalidate: true });
      setDuration("");
      setDescription("");
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Time not logged",
        message: error?.duration?.[0] ?? error?.logged_at?.[0] ?? error?.error ?? "Something went wrong",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (workLogId: string) => {
    const previous = workLogs;
    await mutate(
      workLogs.filter((log) => log.id !== workLogId),
      { revalidate: false }
    );
    try {
      await workLogService.remove(workspaceSlug, projectId, issueId, workLogId);
    } catch (error: any) {
      await mutate(previous, { revalidate: false });
      setToast({ type: TOAST_TYPE.ERROR, title: "Entry not deleted", message: error?.error ?? "Something went wrong" });
    }
  };

  return (
    <Popover>
      <Popover.Button
        data-testid="work-item-worklog-trigger"
        className="flex h-7.5 w-full items-center rounded-sm px-2 text-left text-body-xs-regular hover:bg-layer-transparent-hover"
      >
        {totalMinutes ? (
          <span className="tabular-nums">{formatDuration(animatedTotal)}</span>
        ) : (
          <span className="text-placeholder">Log time</span>
        )}
      </Popover.Button>
      {/* z-30 matches Plane's other floating menus; without it the work item page layer swallows clicks */}
      <Popover.Panel side="bottom" align="start" sideOffset={6} positionerClassName="z-30">
        <div className="worklog-pop w-80 rounded-lg border-[0.5px] border-strong bg-surface-1 p-3 shadow-raised-200">
          <div className="flex items-baseline justify-between">
            <span className="text-caption-md-medium uppercase tracking-wide text-tertiary">Time logged</span>
            <span className="text-body-sm-medium tabular-nums" data-testid="work-item-worklog-total">
              {formatDuration(animatedTotal)}
            </span>
          </div>

          {shares.length > 0 && (
            <div className="mt-2">
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-layer-3">
                {shares.map((share, index) => (
                  <div
                    key={share.name}
                    className={cn("worklog-bar h-full", SHARE_SHADES[Math.min(index, SHARE_SHADES.length - 1)])}
                    style={{ width: `${(share.minutes / totalMinutes) * 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption-sm-regular text-tertiary">
                {shares.map((share, index) => (
                  <span key={share.name} className="flex items-center gap-1">
                    <span
                      className={cn("size-1.5 rounded-full", SHARE_SHADES[Math.min(index, SHARE_SHADES.length - 1)])}
                    />
                    {share.name} · <span className="tabular-nums">{formatDuration(share.minutes)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {!disabled && (
            <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 border-t border-subtle-1 pt-3">
              <div className="flex gap-2">
                <Input
                  inputSize="xs"
                  className="w-full"
                  placeholder="1h 30m"
                  value={duration}
                  autoFocus
                  aria-label="Duration"
                  hasError={!!duration && !parsedDuration}
                  data-testid="work-item-worklog-duration"
                  onChange={(e) => setDuration(e.target.value)}
                />
                <Input
                  inputSize="xs"
                  type="date"
                  value={loggedAt}
                  max={today}
                  aria-label="Date"
                  onChange={(e) => setLoggedAt(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                {QUICK_PICKS.map((pick) => (
                  <button
                    key={pick}
                    type="button"
                    onClick={() => setDuration(pick)}
                    className={cn(
                      "rounded-sm border-[0.5px] border-subtle-1 px-1.5 py-0.5 text-caption-sm-medium tabular-nums text-secondary transition-colors hover:bg-layer-transparent-hover",
                      { "border-accent-strong bg-accent-subtle text-accent-primary": duration === pick }
                    )}
                  >
                    {pick}
                  </button>
                ))}
              </div>
              <Input
                inputSize="xs"
                className="w-full"
                placeholder="What did you work on? (optional)"
                value={description}
                aria-label="Description"
                data-testid="work-item-worklog-description"
                onChange={(e) => setDescription(e.target.value)}
              />
              {duration && !parsedDuration && (
                <span className="text-caption-sm-regular text-danger-primary">Try 1h 30m, 1.5h or 45m</span>
              )}
              <Button
                variant="primary"
                size="base"
                type="submit"
                disabled={!parsedDuration}
                loading={isSubmitting}
                data-testid="work-item-worklog-submit"
              >
                {isSubmitting ? "Logging…" : "Log time"}
              </Button>
            </form>
          )}

          <ul
            className="mt-3 flex max-h-56 flex-col gap-0.5 overflow-y-auto border-t border-subtle-1 pt-2"
            data-testid="work-item-worklog-list"
          >
            {workLogs.length === 0 && (
              <li className="py-2 text-center text-caption-sm-regular text-placeholder">No time logged yet</li>
            )}
            {workLogs.map((log, index) => (
              <li
                key={log.id}
                className="worklog-in group flex items-start justify-between gap-2 rounded-sm px-1 py-1 hover:bg-layer-transparent-hover"
                style={{ animationDelay: `${Math.min(index, 6) * 30}ms` }}
              >
                <div className="min-w-0 text-caption-sm-regular">
                  <div className="flex items-center gap-1.5">
                    <span className="text-body-xs-medium tabular-nums">{formatDuration(log.duration)}</span>
                    <span className="text-tertiary">
                      {renderFormattedDate(log.logged_at)} · {log.logged_by_detail?.display_name}
                    </span>
                  </div>
                  {log.description && <div className="truncate text-secondary">{log.description}</div>}
                </div>
                {!disabled && log.created_by === currentUser?.id && (
                  <button
                    type="button"
                    aria-label="Delete time entry"
                    onClick={() => handleDelete(log.id)}
                    className="grid size-5 shrink-0 place-items-center rounded-sm text-tertiary opacity-0 transition-opacity hover:bg-layer-transparent-hover hover:text-danger-primary focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Popover.Panel>
    </Popover>
  );
});
