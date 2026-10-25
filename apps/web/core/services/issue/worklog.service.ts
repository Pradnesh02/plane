/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TIssueWorkLog = {
  id: string;
  issue: string;
  duration: number; // minutes
  description: string;
  logged_at: string; // YYYY-MM-DD
  created_by: string;
  logged_by_detail: { id: string; display_name: string; avatar_url?: string };
  created_at: string;
};

export type TWorkLogSummary = {
  total_minutes: number;
  by_member: { user_id: string; display_name: string; minutes: number }[];
  by_issue: { issue_id: string; name: string; sequence_id: number; minutes: number }[];
  by_member_day: { user_id: string; logged_at: string; minutes: number }[];
};

export class WorkLogService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueWorkLog[]> {
    return this.get(this.url(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Pick<TIssueWorkLog, "duration" | "description" | "logged_at">
  ): Promise<TIssueWorkLog> {
    return this.post(this.url(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, issueId: string, workLogId: string): Promise<void> {
    return this.delete(`${this.url(workspaceSlug, projectId, issueId)}${workLogId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async summary(
    workspaceSlug: string,
    projectId: string,
    params: { cycle_id?: string; start_date?: string; end_date?: string } = {}
  ): Promise<TWorkLogSummary> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/worklogs/summary/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
