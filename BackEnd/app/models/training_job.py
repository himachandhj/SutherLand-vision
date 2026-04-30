import json
from typing import Any
from uuid import uuid4

from app.core.database import get_connection


def create_training_job(
    *,
    session_id: str,
    dataset_version_id: str,
    use_case_id: str,
    task_type: str,
    base_model: str,
    model_path: str,
    epochs: int,
    batch_size: int,
    img_size: int,
    status: str,
    plan_config: dict[str, Any] | None = None,
    dataset_snapshot: dict[str, Any],
) -> dict[str, Any]:
    training_job_id = f"trn_{uuid4().hex}"

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO training_jobs (
                id, session_id, dataset_version_id, use_case_id, task_type,
                base_model, model_path, epochs, batch_size, img_size,
                status, plan_config, dataset_snapshot
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                training_job_id,
                session_id,
                dataset_version_id,
                use_case_id,
                task_type,
                base_model,
                model_path,
                epochs,
                batch_size,
                img_size,
                status,
                json.dumps(plan_config or {}),
                json.dumps(dataset_snapshot),
            ),
        )
        connection.commit()

        row = connection.execute("SELECT * FROM training_jobs WHERE id = ?", (training_job_id,)).fetchone()
        return _row_to_training_job(row)


def get_training_job(job_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM training_jobs WHERE id = ?", (job_id,)).fetchone()
        return _row_to_training_job(row) if row is not None else None


def update_training_job_status(
    job_id: str,
    *,
    status: str,
    output_model_path: str | None = None,
) -> dict[str, Any] | None:
    assignments = ["status = ?"]
    parameters: list[Any] = [status]

    if output_model_path is not None:
        assignments.append("output_model_path = ?")
        parameters.append(output_model_path)

    parameters.append(job_id)

    with get_connection() as connection:
        connection.execute(
            f"UPDATE training_jobs SET {', '.join(assignments)} WHERE id = ?",
            parameters,
        )
        connection.commit()

        row = connection.execute("SELECT * FROM training_jobs WHERE id = ?", (job_id,)).fetchone()
        return _row_to_training_job(row) if row is not None else None


def _row_to_training_job(row) -> dict[str, Any]:
    record = dict(row)
    try:
        record["plan_config"] = json.loads(record.get("plan_config") or "{}")
    except (TypeError, json.JSONDecodeError):
        record["plan_config"] = {}
    try:
        record["dataset_snapshot"] = json.loads(record.get("dataset_snapshot") or "{}")
    except (TypeError, json.JSONDecodeError):
        record["dataset_snapshot"] = {}
    return record
