# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import F, Sum
from django.utils.dateparse import parse_date

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView, BaseViewSet
from plane.app.permissions import ProjectEntityPermission
from plane.app.serializers import IssueWorkLogSerializer
from plane.db.models import Issue, IssueWorkLog


class IssueWorkLogViewSet(BaseViewSet):
    """Time entries on one work item. Anyone in the project can read them; only the
    person who logged an entry can edit or delete it."""

    permission_classes = [ProjectEntityPermission]
    model = IssueWorkLog
    serializer_class = IssueWorkLogSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                issue_id=self.kwargs.get("issue_id"),
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("created_by")
            .distinct()
        )

    def create(self, request, slug, project_id, issue_id):
        # The URL issue must belong to the URL workspace + project (404 otherwise).
        Issue.objects.get(pk=issue_id, workspace__slug=slug, project_id=project_id)
        serializer = IssueWorkLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Ownership drives edit/delete rights, so set it from the authenticated user explicitly.
        worklog = IssueWorkLog(**serializer.validated_data, project_id=project_id, issue_id=issue_id)
        worklog.save(created_by_id=request.user.id)
        return Response(IssueWorkLogSerializer(worklog).data, status=status.HTTP_201_CREATED)

    def _own_worklog(self, request, pk):
        worklog = self.get_queryset().get(pk=pk)
        if worklog.created_by_id != request.user.id:
            return None
        return worklog

    def partial_update(self, request, slug, project_id, issue_id, pk):
        worklog = self._own_worklog(request, pk)
        if worklog is None:
            return Response({"error": "You can only edit your own time entries."}, status=status.HTTP_403_FORBIDDEN)
        serializer = IssueWorkLogSerializer(worklog, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, project_id, issue_id, pk):
        worklog = self._own_worklog(request, pk)
        if worklog is None:
            return Response({"error": "You can only delete your own time entries."}, status=status.HTTP_403_FORBIDDEN)
        worklog.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectWorkLogSummaryEndpoint(BaseAPIView):
    """Timesheet totals for a project, optionally narrowed to a cycle and/or a date range
    (?cycle_id=&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD)."""

    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id):
        worklogs = IssueWorkLog.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            issue__deleted_at__isnull=True,
            issue__archived_at__isnull=True,
        )
        cycle_id = request.query_params.get("cycle_id")
        if cycle_id:
            worklogs = worklogs.filter(issue__issue_cycle__cycle_id=cycle_id, issue__issue_cycle__deleted_at__isnull=True)
        for param, lookup in (("start_date", "logged_at__gte"), ("end_date", "logged_at__lte")):
            value = request.query_params.get(param)
            if value:
                parsed = parse_date(value)
                if parsed is None:
                    return Response({"error": f"{param} must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
                worklogs = worklogs.filter(**{lookup: parsed})

        by_member = (
            worklogs.values(user_id=F("created_by_id"), display_name=F("created_by__display_name"))
            .annotate(minutes=Sum("duration"))
            .order_by("-minutes")
        )
        by_issue = (
            worklogs.values(
                "issue_id",
                name=F("issue__name"),
                sequence_id=F("issue__sequence_id"),
            )
            .annotate(minutes=Sum("duration"))
            .order_by("-minutes")
        )
        # one row per person per day: the cells of a timesheet grid
        by_member_day = (
            worklogs.values("logged_at", user_id=F("created_by_id"))
            .annotate(minutes=Sum("duration"))
            .order_by("logged_at")
        )
        return Response(
            {
                "total_minutes": worklogs.aggregate(total=Sum("duration"))["total"] or 0,
                "by_member": list(by_member),
                "by_issue": list(by_issue),
                "by_member_day": list(by_member_day),
            },
            status=status.HTTP_200_OK,
        )
