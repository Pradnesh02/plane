import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0126_issue_worklog"),
    ]

    operations = [
        migrations.CreateModel(
            name="IssueEmbedding",
            fields=[
                (
                    "issue",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        primary_key=True,
                        related_name="embedding",
                        serialize=False,
                        to="db.issue",
                    ),
                ),
                ("content_hash", models.CharField(max_length=64)),
                ("vector", models.JSONField()),
            ],
            options={"db_table": "issue_embeddings"},
        ),
    ]
