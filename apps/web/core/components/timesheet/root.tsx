/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { addDays, format, isSameDay, isSameWeek, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
// components
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
// helpers
import { formatDuration } from "@/helpers/worklog";
// hooks
import { useProject } from "@/hooks/store/use-project";
// services
import { WorkLogService } from "@/services/issue/worklog.service";

const workLogService = new WorkLogService();
const iso = (d: Date) => format(d, "yyyy-MM-dd");

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectTimesheetRoot = observer(function ProjectTimesheetRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { getProjectById } = useProject();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const range = { start_date: iso(days[0]), end_date: iso(days[6]) };
  const { data, isLoading } = useSWR(`PROJECT_TIMESHEET_${projectId}_${range.start_date}`, () =>
    workLogService.summary(workspaceSlug, projectId, range)
  );

  const identifier = getProjectById(projectId)?.identifier;
  const today = new Date();
  const isCurrentWeek = isSameWeek(weekStart, today, { weekStartsOn: 1 });

  // grid: minutes[user][yyyy-MM-dd]
  const cells = new Map<string, Map<string, number>>();
  for (const row of data?.by_member_day ?? []) {
    if (!cells.has(row.user_id)) cells.set(row.user_id, new Map());
    cells.get(row.user_id)!.set(row.logged_at, row.minutes);
  }
  const dayTotals = days.map((d) =>
    (data?.by_member_day ?? []).filter((r) => r.logged_at === iso(d)).reduce((sum, r) => sum + r.minutes, 0)
  );
  const maxCell = Math.max(1, ...(data?.by_member_day ?? []).map((r) => r.minutes));
  const maxIssue = Math.max(1, ...(data?.by_issue ?? []).map((r) => r.minutes));
  const total = data?.total_minutes ?? 0;
  const activeDays = dayTotals.filter(Boolean).length;

  const stats = [
    { label: "Total logged", value: formatDuration(total) },
    { label: "Avg per active day", value: activeDays ? formatDuration(Math.round(total / activeDays)) : "—" },
    { label: "People", value: String(data?.by_member.length ?? 0) },
    { label: "Work items", value: String(data?.by_issue.length ?? 0) },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto px-page-x py-6">
      {/* week switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h5-medium">
            {format(days[0], "MMM d")} – {format(days[6], days[0].getMonth() === days[6].getMonth() ? "d, yyyy" : "MMM d, yyyy")}
          </h2>
          <p className="text-body-xs-regular text-tertiary">Time logged on work items in this project, by person and day.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="lg" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            This week
          </Button>
          <Button variant="ghost" size="lg" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat, index) => (
          <div
            key={`${range.start_date}-${stat.label}`}
            className="worklog-in rounded-lg border-[0.5px] border-subtle-1 bg-layer-2 px-4 py-3"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <div className="text-caption-md-medium uppercase tracking-wide text-tertiary">{stat.label}</div>
            <div className="mt-1 text-h4-medium tabular-nums">{isLoading ? "…" : stat.value}</div>
          </div>
        ))}
      </div>

      {/* person x day grid */}
      <div className="overflow-x-auto rounded-lg border-[0.5px] border-subtle-1">
        <table className="w-full min-w-[720px] border-collapse text-body-xs-regular" data-testid="timesheet-grid">
          <thead>
            <tr className="border-b border-subtle-1 bg-layer-2 text-tertiary">
              <th className="w-56 px-4 py-2.5 text-left font-medium">Person</th>
              {days.map((d) => (
                <th
                  key={iso(d)}
                  className={cn("px-2 py-2.5 text-center font-medium", { "text-accent-primary": isSameDay(d, today) })}
                >
                  <div>{format(d, "EEE")}</div>
                  <div className="text-caption-sm-regular">{format(d, "d")}</div>
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {(data?.by_member ?? []).map((member, rowIndex) => (
              <tr
                key={`${range.start_date}-${member.user_id}`}
                className="worklog-in border-b border-subtle-1 last:border-b-0"
                style={{ animationDelay: `${rowIndex * 40}ms` }}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <ButtonAvatars showTooltip={false} userIds={member.user_id} size="md" />
                    <span className="truncate">{member.display_name}</span>
                  </div>
                </td>
                {days.map((d) => {
                  const minutes = cells.get(member.user_id)?.get(iso(d)) ?? 0;
                  return (
                    <td key={iso(d)} className={cn("px-1.5 py-1.5", { "bg-accent-subtle/40": isSameDay(d, today) })}>
                      <div
                        className={cn(
                          "grid h-8 place-items-center rounded-md tabular-nums",
                          minutes ? "text-primary" : "text-placeholder"
                        )}
                        style={
                          minutes
                            ? {
                                backgroundColor: `color-mix(in srgb, var(--bg-accent-primary) ${Math.round(
                                  12 + (minutes / maxCell) * 38
                                )}%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        {minutes ? formatDuration(minutes) : "·"}
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-right text-body-xs-medium tabular-nums">{formatDuration(member.minutes)}</td>
              </tr>
            ))}
            {!isLoading && (data?.by_member.length ?? 0) === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <Clock className="mx-auto mb-2 size-6 text-placeholder" />
                  <div className="text-body-sm-medium">No time logged this week</div>
                  <div className="text-body-xs-regular text-tertiary">
                    Open any work item and use “Time logged” in its sidebar to add an entry.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {(data?.by_member.length ?? 0) > 0 && (
            <tfoot>
              <tr className="border-t border-subtle-1 bg-layer-2 text-body-xs-medium">
                <td className="px-4 py-2.5">Daily total</td>
                {dayTotals.map((minutes, i) => (
                  <td key={iso(days[i])} className="px-2 py-2.5 text-center tabular-nums">
                    {minutes ? formatDuration(minutes) : "·"}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right tabular-nums" data-testid="timesheet-total">
                  {formatDuration(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* by work item */}
      {(data?.by_issue.length ?? 0) > 0 && (
        <div className="rounded-lg border-[0.5px] border-subtle-1">
          <div className="border-b border-subtle-1 bg-layer-2 px-4 py-2.5 text-body-xs-medium text-tertiary">
            By work item
          </div>
          <ul>
            {data!.by_issue.map((row, index) => (
              <li
                key={`${range.start_date}-${row.issue_id}`}
                className="worklog-in border-b border-subtle-1 last:border-b-0"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <Link
                  href={`/${workspaceSlug}/browse/${identifier}-${row.sequence_id}/`}
                  className="grid grid-cols-[96px_1fr_minmax(80px,30%)_64px] items-center gap-3 px-4 py-2 text-body-xs-regular hover:bg-layer-transparent-hover"
                >
                  <span className="text-tertiary tabular-nums">
                    {identifier}-{row.sequence_id}
                  </span>
                  <span className="truncate">{row.name}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-layer-3">
                    <span
                      className="worklog-bar block h-full rounded-full bg-accent-primary"
                      style={{ width: `${(row.minutes / maxIssue) * 100}%` }}
                    />
                  </span>
                  <span className="text-right text-body-xs-medium tabular-nums">{formatDuration(row.minutes)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
