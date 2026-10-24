/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Input } from "@makeplane/propel/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
import { DeleteOutline } from "@makeplane/propel/icons";
import { setToast } from "@plane/blocks/toast";
import { renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
// helpers
import { formatDuration, parseDuration } from "@/helpers/worklog";
// hooks
import { useUser } from "@/hooks/store/user";
// services
import { WorkLogService } from "@/services/issue/worklog.service";

const workLogService = new WorkLogService();

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
  const parsedDuration = parseDuration(duration);

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
      setToast({ type: "error", title: "Time not logged", message: error?.duration?.[0] ?? error?.logged_at?.[0] ?? error?.error ?? "Something went wrong" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (workLogId: string) => {
    try {
      await workLogService.remove(workspaceSlug, projectId, issueId, workLogId);
      await mutate(
        workLogs.filter((log) => log.id !== workLogId),
        { revalidate: true }
      );
    } catch (error: any) {
      setToast({ type: "error", title: "Entry not deleted", message: error?.error ?? "Something went wrong" });
    }
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-testid="work-item-worklog-trigger"
            className="w-full truncate rounded-sm px-2 py-1 text-left text-body-xs-regular hover:bg-layer-transparent-hover"
          />
        }
      >
        {totalMinutes ? formatDuration(totalMinutes) : <span className="text-placeholder">Log time</span>}
      </PopoverTrigger>
      <PopoverContent variant="text" side="left" align="start" sideOffset={8} collisionPadding={12} aria-label="Time tracking">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-body-xs-medium">Time logged</span>
            <span className="text-body-xs-medium" data-testid="work-item-worklog-total">
              {formatDuration(totalMinutes)}
            </span>
          </div>

          {!disabled && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  size="sm"
                  type="text"
                  placeholder="e.g. 1h 30m"
                  value={duration}
                  autoFocus
                  aria-label="Duration"
                  data-testid="work-item-worklog-duration"
                  onChange={(e) => setDuration(e.target.value)}
                />
                <Input
                  size="sm"
                  type="date"
                  value={loggedAt}
                  max={today}
                  aria-label="Date"
                  onChange={(e) => setLoggedAt(e.target.value)}
                />
              </div>
              <Input
                size="sm"
                type="text"
                placeholder="What did you work on? (optional)"
                value={description}
                aria-label="Description"
                data-testid="work-item-worklog-description"
                onChange={(e) => setDescription(e.target.value)}
              />
              {duration && !parsedDuration && (
                <span className="text-caption-sm-regular text-danger-primary">Use a format like 1h 30m, 1.5h or 45m</span>
              )}
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={!parsedDuration || isSubmitting}
                label={isSubmitting ? "Logging..." : "Log time"}
                data-testid="work-item-worklog-submit"
              />
            </form>
          )}

          <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto" data-testid="work-item-worklog-list">
            {workLogs.length === 0 && <li className="text-caption-sm-regular text-placeholder">No time logged yet</li>}
            {workLogs.map((log) => (
              <li key={log.id} className="flex items-start justify-between gap-2 text-caption-sm-regular">
                <div className="min-w-0">
                  <div>
                    <span className="text-body-xs-medium">{formatDuration(log.duration)}</span>
                    {" · "}
                    {renderFormattedDate(log.logged_at)} · {log.logged_by_detail?.display_name}
                  </div>
                  {log.description && <div className="truncate text-secondary">{log.description}</div>}
                </div>
                {!disabled && log.created_by === currentUser?.id && (
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label="Delete time entry"
                    icon={<Icon icon={DeleteOutline} />}
                    onClick={() => handleDelete(log.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
});
