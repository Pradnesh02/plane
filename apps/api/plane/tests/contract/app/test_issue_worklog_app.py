# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for work item time tracking (worklogs) and the project timesheet summary."""

from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueWorkLog,
    Project,
    ProjectMember,
    User,
    Workspace,
    WorkspaceMember,
)

ADMIN, MEMBER, GUEST = 20, 15, 5


def _make_user(prefix):
    unique_id = uuid4().hex[:8]
    return User.objects.create(email=f"{prefix}-{unique_id}@plane.so", username=f"{prefix}_{unique_id}")


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def setup(db):
    owner, teammate, guest = _make_user("owner"), _make_user("teammate"), _make_user("guest")
    workspace = Workspace.objects.create(name="WS", owner=owner, slug=f"ws-{uuid4().hex[:8]}")
    project = Project.objects.create(name="Proj", identifier="PRJ", workspace=workspace, created_by=owner)
    other_project = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=owner)
    for user, role in ((owner, ADMIN), (teammate, MEMBER), (guest, GUEST)):
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
        ProjectMember.objects.create(project=project, workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=other_project, workspace=workspace, member=owner, role=ADMIN)
    issue = Issue.objects.create(name="Fix login", project=project, workspace=workspace)
    other_issue = Issue.objects.create(name="Elsewhere", project=other_project, workspace=workspace)

    class S:
        pass

    s = S()
    s.owner, s.teammate, s.guest = owner, teammate, guest
    s.workspace, s.project, s.issue, s.other_issue = workspace, project, issue, other_issue
    s.base = f"/api/workspaces/{workspace.slug}/projects/{project.id}"
    s.url = f"{s.base}/issues/{issue.id}/worklogs/"
    return s


def _log(client, url, duration=90, **extra):
    return client.post(url, {"duration": duration, "description": "work", **extra}, format="json")


@pytest.mark.contract
class TestIssueWorkLog:
    def test_member_logs_time_and_lists_it(self, setup):
        client = _client(setup.owner)
        response = _log(client, setup.url, 90)
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["duration"] == 90
        assert response.data["logged_at"] == str(timezone.localdate())
        assert str(response.data["created_by"]) == str(setup.owner.id)

        listed = client.get(setup.url)
        assert listed.status_code == status.HTTP_200_OK
        assert [row["duration"] for row in listed.data] == [90]

    @pytest.mark.parametrize("duration", [0, -5, 24 * 60 + 1])
    def test_rejects_invalid_duration(self, setup, duration):
        response = _log(_client(setup.owner), setup.url, duration)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_future_date(self, setup):
        two_days_ahead = timezone.localdate() + timedelta(days=2)
        response = _log(_client(setup.owner), setup.url, 30, logged_at=str(two_days_ahead))
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_accepts_client_today_ahead_of_server_utc(self, setup):
        # A user in IST/AEST can be on "tomorrow" relative to the UTC server.
        tomorrow = timezone.localdate() + timedelta(days=1)
        response = _log(_client(setup.owner), setup.url, 30, logged_at=str(tomorrow))
        assert response.status_code == status.HTTP_201_CREATED, response.data

    def test_guest_cannot_log_time(self, setup):
        response = _log(_client(setup.guest), setup.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_issue_from_another_project_is_404(self, setup):
        url = f"{setup.base}/issues/{setup.other_issue.id}/worklogs/"
        response = _log(_client(setup.owner), url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not IssueWorkLog.objects.exists()

    def test_only_the_author_can_edit_or_delete(self, setup):
        entry_id = _log(_client(setup.owner), setup.url).data["id"]
        detail = f"{setup.url}{entry_id}/"

        teammate = _client(setup.teammate)
        assert teammate.patch(detail, {"duration": 10}, format="json").status_code == status.HTTP_403_FORBIDDEN
        assert teammate.delete(detail).status_code == status.HTTP_403_FORBIDDEN

        owner = _client(setup.owner)
        updated = owner.patch(detail, {"duration": 45}, format="json")
        assert updated.status_code == status.HTTP_200_OK and updated.data["duration"] == 45
        assert owner.delete(detail).status_code == status.HTTP_204_NO_CONTENT
        assert not IssueWorkLog.objects.filter(pk=entry_id).exists()


@pytest.mark.contract
class TestWorkLogSummary:
    def test_totals_by_member_and_issue(self, setup):
        _log(_client(setup.owner), setup.url, 60)
        _log(_client(setup.owner), setup.url, 30)
        _log(_client(setup.teammate), setup.url, 45)

        response = _client(setup.guest).get(f"{setup.base}/worklogs/summary/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_minutes"] == 135
        by_member = {str(row["user_id"]): row["minutes"] for row in response.data["by_member"]}
        assert by_member == {str(setup.owner.id): 90, str(setup.teammate.id): 45}
        assert [(str(r["issue_id"]), r["minutes"]) for r in response.data["by_issue"]] == [(str(setup.issue.id), 135)]
        today = timezone.localdate()
        cells = {(str(r["user_id"]), r["logged_at"]): r["minutes"] for r in response.data["by_member_day"]}
        assert cells == {(str(setup.owner.id), today): 90, (str(setup.teammate.id), today): 45}

    def test_filters_by_cycle_and_date_range(self, setup):
        other = Issue.objects.create(name="Not in cycle", project=setup.project, workspace=setup.workspace)
        cycle = Cycle.objects.create(
            name="Sprint", project=setup.project, workspace=setup.workspace, owned_by=setup.owner
        )
        CycleIssue.objects.create(cycle=cycle, issue=setup.issue, project=setup.project, workspace=setup.workspace)
        owner = _client(setup.owner)
        week_ago = timezone.localdate() - timedelta(days=7)
        _log(owner, setup.url, 60)
        _log(owner, setup.url, 20, logged_at=str(week_ago))
        _log(owner, f"{setup.base}/issues/{other.id}/worklogs/", 15)

        summary = f"{setup.base}/worklogs/summary/"
        assert owner.get(summary, {"cycle_id": cycle.id}).data["total_minutes"] == 80
        assert owner.get(summary, {"start_date": str(timezone.localdate())}).data["total_minutes"] == 75
        assert owner.get(summary, {"end_date": str(week_ago)}).data["total_minutes"] == 20
        assert owner.get(summary, {"start_date": "not-a-date"}).status_code == status.HTTP_400_BAD_REQUEST

    def test_non_member_is_forbidden(self, setup):
        outsider = _make_user("outsider")
        response = _client(outsider).get(f"{setup.base}/worklogs/summary/")
        assert response.status_code == status.HTTP_403_FORBIDDEN
