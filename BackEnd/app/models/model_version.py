import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.database import get_connection


def create_model_version(
    *,
    training_job_id: str,
    use_case_id: str,
    model_path: str,
    version_name: str,
    status: str,
    metadata_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    model_version_id = f"mv_{uuid4().hex}"
    now = _timestamp()

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO model_versions (
                id, training_job_id, use_case_id, model_path,
                version_name, status, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                model_version_id,
                training_job_id,
                use_case_id,
                model_path,
                version_name,
                status,
                json.dumps(metadata_json or {}),
                now,
                now,
            ),
        )
        connection.commit()

        row = connection.execute("SELECT * FROM model_versions WHERE id = ?", (model_version_id,)).fetchone()
        return _row_to_model_version(row)


def get_model_version(model_version_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM model_versions WHERE id = ?", (model_version_id,)).fetchone()
        return _row_to_model_version(row) if row is not None else None


def get_latest_model_version_for_job(training_job_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM model_versions
            WHERE training_job_id = ?
            ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
            LIMIT 1
            """,
            (training_job_id,),
        ).fetchone()
        return _row_to_model_version(row) if row is not None else None


def get_staging_model_version(use_case_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM model_versions
            WHERE use_case_id = ? AND status = 'staging'
            ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
            LIMIT 1
            """,
            (use_case_id,),
        ).fetchone()
        return _row_to_model_version(row) if row is not None else None


def get_promoted_model_version(use_case_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM model_versions
            WHERE use_case_id = ? AND status = 'promoted'
            ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
            LIMIT 1
            """,
            (use_case_id,),
        ).fetchone()
        return _row_to_model_version(row) if row is not None else None


def update_model_version_status(model_version_id: str, *, status: str) -> dict[str, Any] | None:
    now = _timestamp()

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE model_versions
            SET status = ?, updated_at = ?
            WHERE id = ?
            """,
            (status, now, model_version_id),
        )
        connection.commit()

        row = connection.execute("SELECT * FROM model_versions WHERE id = ?", (model_version_id,)).fetchone()
        return _row_to_model_version(row) if row is not None else None


def update_use_case_versions_status(
    *,
    use_case_id: str,
    from_status: str,
    to_status: str,
    exclude_model_version_id: str | None = None,
) -> None:
    now = _timestamp()
    query = """
        UPDATE model_versions
        SET status = ?, updated_at = ?
        WHERE use_case_id = ? AND status = ?
    """
    parameters: list[Any] = [to_status, now, use_case_id, from_status]

    if exclude_model_version_id:
        query += " AND id != ?"
        parameters.append(exclude_model_version_id)

    with get_connection() as connection:
        connection.execute(query, parameters)
        connection.commit()


def get_active_model(use_case_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM active_models WHERE use_case_id = ?", (use_case_id,)).fetchone()
        return dict(row) if row is not None else None


def upsert_active_model(
    *,
    use_case_id: str,
    active_model_version_id: str,
    active_model_path: str,
) -> dict[str, Any]:
    now = _timestamp()

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO active_models (use_case_id, active_model_version_id, active_model_path, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(use_case_id) DO UPDATE SET
                active_model_version_id = excluded.active_model_version_id,
                active_model_path = excluded.active_model_path,
                updated_at = excluded.updated_at
            """,
            (use_case_id, active_model_version_id, active_model_path, now),
        )
        connection.commit()

        row = connection.execute("SELECT * FROM active_models WHERE use_case_id = ?", (use_case_id,)).fetchone()
        return dict(row)


def _row_to_model_version(row) -> dict[str, Any]:
    record = dict(row)
    try:
        record["metadata_json"] = json.loads(record.get("metadata_json") or "{}")
    except (TypeError, json.JSONDecodeError):
        record["metadata_json"] = {}
    return record


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
