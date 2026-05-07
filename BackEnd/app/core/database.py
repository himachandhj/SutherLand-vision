import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "sutherland_hub.db"


def _table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    cursor = connection.execute(f"PRAGMA table_info({table_name})")
    return {str(row[1]) for row in cursor.fetchall()}


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                use_case TEXT NOT NULL,
                use_case_id TEXT NOT NULL DEFAULT '',
                filename TEXT NOT NULL,
                status TEXT NOT NULL,
                result_url TEXT NOT NULL,
                message TEXT NOT NULL,
                estimated_time TEXT NOT NULL,
                metrics TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS training_jobs (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                dataset_version_id TEXT NOT NULL,
                use_case_id TEXT NOT NULL,
                task_type TEXT NOT NULL,
                base_model TEXT NOT NULL,
                model_path TEXT NOT NULL,
                epochs INTEGER NOT NULL,
                batch_size INTEGER NOT NULL,
                img_size INTEGER NOT NULL,
                status TEXT NOT NULL,
                output_model_path TEXT NOT NULL DEFAULT '',
                plan_config TEXT NOT NULL DEFAULT '{}',
                dataset_snapshot TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()

        cursor = connection.execute("PRAGMA table_info(training_jobs)")
        training_job_columns = {row[1] for row in cursor.fetchall()}
        if "output_model_path" not in training_job_columns:
            connection.execute("ALTER TABLE training_jobs ADD COLUMN output_model_path TEXT NOT NULL DEFAULT ''")
            connection.commit()
        if "plan_config" not in training_job_columns:
            connection.execute("ALTER TABLE training_jobs ADD COLUMN plan_config TEXT NOT NULL DEFAULT '{}'")
            connection.commit()

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_training_jobs_session
            ON training_jobs (session_id, created_at)
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS model_versions (
                id TEXT PRIMARY KEY,
                training_job_id TEXT NOT NULL,
                use_case_id TEXT NOT NULL,
                model_path TEXT NOT NULL,
                version_name TEXT NOT NULL,
                status TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_model_versions_job
            ON model_versions (training_job_id, created_at)
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_model_versions_use_case
            ON model_versions (use_case_id, status, updated_at)
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS active_models (
                use_case_id TEXT PRIMARY KEY,
                active_model_version_id TEXT NOT NULL DEFAULT '',
                active_model_path TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS integration_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                use_case_id TEXT NOT NULL,
                bucket TEXT NOT NULL,
                input_key TEXT NOT NULL,
                output_key TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                metrics TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider, use_case_id, bucket, input_key)
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ppe_detection_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                shift TEXT NOT NULL,
                filename TEXT NOT NULL,
                minio_video_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ppe_detection_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL,
                person_id TEXT NOT NULL,
                helmet_worn INTEGER,
                vest_worn INTEGER,
                shoes_worn INTEGER,
                violation_type TEXT,
                confidence_score REAL,
                status TEXT NOT NULL,
                first_seen_frame INTEGER,
                last_seen_frame INTEGER,
                first_seen_sec REAL,
                last_seen_sec REAL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                notes TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES ppe_detection_inputs(input_id) ON DELETE CASCADE,
                UNIQUE(input_id, person_id)
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS region_alert_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                zone_type TEXT NOT NULL,
                filename TEXT NOT NULL,
                minio_video_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS region_alert_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL,
                object_type TEXT NOT NULL,
                authorized INTEGER,
                entry_time REAL,
                exit_time REAL,
                duration_sec REAL,
                alert_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                confidence_score REAL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES region_alert_inputs(input_id) ON DELETE CASCADE
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS fire_detection_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                filename TEXT NOT NULL,
                minio_video_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS fire_detection_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL UNIQUE,
                fire_detected INTEGER,
                smoke_detected INTEGER,
                severity TEXT,
                alert_type TEXT,
                confidence_score REAL,
                response_time_sec REAL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES fire_detection_inputs(input_id) ON DELETE CASCADE
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS crack_detection_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                filename TEXT NOT NULL,
                minio_input_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS crack_detection_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL UNIQUE,
                crack_detected INTEGER,
                crack_count INTEGER,
                frames_analyzed INTEGER,
                frames_with_cracks INTEGER,
                crack_rate_pct REAL,
                max_confidence REAL,
                avg_confidence REAL,
                severity TEXT,
                status TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES crack_detection_inputs(input_id) ON DELETE CASCADE
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS unsafe_behavior_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                filename TEXT NOT NULL,
                minio_input_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS unsafe_behavior_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                confidence REAL,
                bbox_json TEXT NOT NULL DEFAULT '[]',
                source TEXT,
                associated_person_box_json TEXT NOT NULL DEFAULT '[]',
                severity TEXT,
                status TEXT NOT NULL,
                frame_number INTEGER,
                timestamp_sec REAL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES unsafe_behavior_inputs(input_id) ON DELETE CASCADE
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS speed_estimation_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                zone_speed_limit_kmh REAL,
                filename TEXT NOT NULL,
                minio_video_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS speed_estimation_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL,
                object_id TEXT NOT NULL,
                object_type TEXT NOT NULL,
                detected_speed_kmh REAL,
                speed_limit_kmh REAL,
                is_overspeeding INTEGER,
                excess_speed_kmh REAL,
                confidence_score REAL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES speed_estimation_inputs(input_id) ON DELETE CASCADE,
                UNIQUE(input_id, object_id)
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS queue_management_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                counter_id TEXT,
                max_queue_limit INTEGER,
                filename TEXT NOT NULL,
                minio_video_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS queue_management_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL UNIQUE,
                queue_length INTEGER,
                estimated_wait_sec REAL,
                is_breached INTEGER,
                excess_count INTEGER,
                staff_count INTEGER,
                confidence_score REAL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES queue_management_inputs(input_id) ON DELETE CASCADE
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS class_wise_object_counting_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                filename TEXT NOT NULL,
                minio_video_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS class_wise_object_counting_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL,
                class_name TEXT NOT NULL,
                class_count INTEGER,
                expected_count INTEGER,
                count_difference INTEGER,
                total_objects_in_frame INTEGER,
                class_percentage REAL,
                confidence_score REAL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES class_wise_object_counting_inputs(input_id) ON DELETE CASCADE,
                UNIQUE(input_id, class_name)
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS object_tracking_inputs (
                input_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref TEXT NOT NULL UNIQUE,
                integration_run_id INTEGER,
                job_id INTEGER,
                camera_id TEXT NOT NULL,
                location TEXT NOT NULL,
                zone TEXT NOT NULL,
                filename TEXT NOT NULL,
                minio_video_link TEXT,
                output_video_link TEXT,
                input_bucket TEXT,
                input_object_key TEXT,
                output_object_key TEXT,
                load_time_sec REAL,
                processing_time_sec REAL,
                simulated_timestamp TEXT NOT NULL,
                processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_status TEXT NOT NULL DEFAULT 'processed',
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS object_tracking_outputs (
                output_id INTEGER PRIMARY KEY AUTOINCREMENT,
                input_id INTEGER NOT NULL,
                object_id TEXT NOT NULL,
                object_type TEXT NOT NULL,
                entry_time REAL,
                exit_time REAL,
                duration_in_zone_sec REAL,
                next_zone TEXT,
                path_sequence TEXT,
                is_anomaly INTEGER,
                confidence_score REAL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(input_id) REFERENCES object_tracking_inputs(input_id) ON DELETE CASCADE,
                UNIQUE(input_id, object_id)
            )
            """
        )
        connection.commit()

        # Migration: add columns if missing (for existing DBs)
        cursor = connection.execute("PRAGMA table_info(jobs)")
        columns = {row[1] for row in cursor.fetchall()}

        if "use_case_id" not in columns:
            connection.execute("ALTER TABLE jobs ADD COLUMN use_case_id TEXT NOT NULL DEFAULT ''")
            connection.commit()
        if "metrics" not in columns:
            connection.execute("ALTER TABLE jobs ADD COLUMN metrics TEXT NOT NULL DEFAULT '{}'")
            connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS fine_tuning_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usecase_slug TEXT NOT NULL,
                status TEXT NOT NULL,
                current_step INTEGER NOT NULL DEFAULT 1,
                selected_dataset_id INTEGER,
                starting_model_name TEXT,
                readiness_score INTEGER,
                recommended_next_action TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS datasets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usecase_slug TEXT NOT NULL,
                name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                minio_bucket TEXT,
                minio_prefix TEXT,
                media_type TEXT NOT NULL,
                file_count INTEGER NOT NULL DEFAULT 0,
                label_status TEXT NOT NULL DEFAULT 'unknown',
                audit_status TEXT NOT NULL DEFAULT 'not_run',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()

        # Migration: keep older Part-1 databases compatible with the Step-2
        # dataset picker without rebuilding the table.
        cursor = connection.execute("PRAGMA table_info(datasets)")
        dataset_columns = {row[1] for row in cursor.fetchall()}
        dataset_migrations = {
            "source_type": "TEXT NOT NULL DEFAULT 'minio'",
            "minio_bucket": "TEXT",
            "minio_prefix": "TEXT",
            "media_type": "TEXT NOT NULL DEFAULT 'unknown'",
            "file_count": "INTEGER NOT NULL DEFAULT 0",
            "label_status": "TEXT NOT NULL DEFAULT 'unknown'",
            "audit_status": "TEXT NOT NULL DEFAULT 'not_run'",
            "created_at": "TEXT",
            "updated_at": "TEXT",
        }
        for column, column_definition in dataset_migrations.items():
            if column not in dataset_columns:
                connection.execute(f"ALTER TABLE datasets ADD COLUMN {column} {column_definition}")
                connection.commit()
        connection.execute(
            """
            UPDATE datasets
            SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS dataset_audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset_id INTEGER NOT NULL,
                session_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                readiness_score INTEGER,
                issues_json TEXT NOT NULL DEFAULT '[]',
                recommendations_json TEXT NOT NULL DEFAULT '[]',
                summary_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
                FOREIGN KEY(session_id) REFERENCES fine_tuning_sessions(id) ON DELETE CASCADE
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS model_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usecase_slug TEXT NOT NULL,
                version_name TEXT NOT NULL,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0,
                quality_score REAL,
                latency_ms REAL,
                false_alarm_rate REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS fine_tuning_dataset_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset_id INTEGER NOT NULL,
                dataset_version_id TEXT NOT NULL,
                session_id INTEGER NOT NULL,
                data_fingerprint TEXT NOT NULL,
                manifest_uri TEXT NOT NULL,
                prepared_dataset_uri TEXT NOT NULL,
                annotation_format TEXT NOT NULL,
                task_type TEXT NOT NULL,
                item_count INTEGER NOT NULL DEFAULT 0,
                label_count INTEGER NOT NULL DEFAULT 0,
                readiness_score INTEGER,
                label_status TEXT NOT NULL,
                status TEXT NOT NULL,
                schema_version TEXT NOT NULL DEFAULT 'v1',
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
                FOREIGN KEY(session_id) REFERENCES fine_tuning_sessions(id) ON DELETE CASCADE,
                UNIQUE(session_id, dataset_version_id)
            )
            """
        )
        connection.commit()


@contextmanager
def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def create_job(
    *,
    use_case: str,
    use_case_id: str = "",
    filename: str,
    status: str,
    result_url: str,
    message: str,
    estimated_time: str,
    metrics: dict | None = None,
) -> dict[str, str | int]:
    metrics_json = json.dumps(metrics or {})
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO jobs (use_case, use_case_id, filename, status, result_url, message, estimated_time, metrics)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (use_case, use_case_id, filename, status, result_url, message, estimated_time, metrics_json),
        )
        connection.commit()
        job_id = cursor.lastrowid

        row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return _row_to_dict(row)


def list_jobs(*, limit: int | None = None, use_case_id: str | None = None) -> list[dict[str, str | int]]:
    query = "SELECT * FROM jobs"
    parameters: list = []
    conditions = []

    if use_case_id:
        conditions.append("use_case_id = ?")
        parameters.append(use_case_id)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY id DESC"

    if limit is not None:
        query += " LIMIT ?"
        parameters.append(limit)

    with get_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
        return [_row_to_dict(row) for row in rows]


def update_job(
    job_id: int,
    *,
    status: str,
    result_url: str,
    message: str,
    metrics: dict | None = None,
) -> dict[str, str | int]:
    with get_connection() as connection:
        if metrics is not None:
            connection.execute(
                """
                UPDATE jobs
                SET status = ?, result_url = ?, message = ?, metrics = ?
                WHERE id = ?
                """,
                (status, result_url, message, json.dumps(metrics), job_id),
            )
        else:
            connection.execute(
                """
                UPDATE jobs
                SET status = ?, result_url = ?, message = ?
                WHERE id = ?
                """,
                (status, result_url, message, job_id),
            )
        connection.commit()
        row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return _row_to_dict(row)


def get_job(job_id: int) -> dict | None:
    """Fetch a single job by ID."""
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            return None
        return _row_to_dict(row)


def create_integration_run(
    *,
    provider: str,
    use_case_id: str,
    bucket: str,
    input_key: str,
    output_key: str,
    status: str,
    message: str,
    metrics: dict | None = None,
) -> dict:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO integration_runs (provider, use_case_id, bucket, input_key, output_key, status, message, metrics)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (provider, use_case_id, bucket, input_key, output_key, status, message, json.dumps(metrics or {})),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM integration_runs WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _row_to_dict(row)


def get_integration_run(
    *,
    provider: str,
    use_case_id: str,
    bucket: str,
    input_key: str,
) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM integration_runs
            WHERE provider = ? AND use_case_id = ? AND bucket = ? AND input_key = ?
            """,
            (provider, use_case_id, bucket, input_key),
        ).fetchone()
        return _row_to_dict(row) if row is not None else None


def list_integration_runs(
    *,
    limit: int | None = None,
    provider: str | None = None,
    use_case_id: str | None = None,
    bucket: str | None = None,
) -> list[dict]:
    query = "SELECT * FROM integration_runs"
    parameters: list = []
    conditions = []

    if provider:
        conditions.append("provider = ?")
        parameters.append(provider)
    if use_case_id:
        conditions.append("use_case_id = ?")
        parameters.append(use_case_id)
    if bucket:
        conditions.append("bucket = ?")
        parameters.append(bucket)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY datetime(updated_at) DESC, id DESC"

    if limit is not None:
        query += " LIMIT ?"
        parameters.append(limit)

    with get_connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
        return [_row_to_dict(row) for row in rows]


def update_integration_run(
    run_id: int,
    *,
    status: str,
    output_key: str | None = None,
    message: str | None = None,
    metrics: dict | None = None,
) -> dict:
    assignments = ["status = ?", "updated_at = CURRENT_TIMESTAMP"]
    parameters: list = [status]

    if output_key is not None:
        assignments.append("output_key = ?")
        parameters.append(output_key)
    if message is not None:
        assignments.append("message = ?")
        parameters.append(message)
    if metrics is not None:
        assignments.append("metrics = ?")
        parameters.append(json.dumps(metrics))

    parameters.append(run_id)

    with get_connection() as connection:
        connection.execute(
            f"UPDATE integration_runs SET {', '.join(assignments)} WHERE id = ?",
            parameters,
        )
        connection.commit()
        row = connection.execute("SELECT * FROM integration_runs WHERE id = ?", (run_id,)).fetchone()
        return _row_to_dict(row)


def upsert_integration_run(
    *,
    provider: str,
    use_case_id: str,
    bucket: str,
    input_key: str,
    output_key: str,
    status: str,
    message: str,
    metrics: dict | None = None,
) -> dict:
    existing = get_integration_run(
        provider=provider,
        use_case_id=use_case_id,
        bucket=bucket,
        input_key=input_key,
    )
    if existing is None:
        return create_integration_run(
            provider=provider,
            use_case_id=use_case_id,
            bucket=bucket,
            input_key=input_key,
            output_key=output_key,
            status=status,
            message=message,
            metrics=metrics,
        )

    return update_integration_run(
        existing["id"],
        status=status,
        output_key=output_key,
        message=message,
        metrics=metrics,
    )


def upsert_ppe_detection_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    shift: str,
    filename: str,
    minio_video_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM ppe_detection_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            shift,
            filename,
            minio_video_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO ppe_detection_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone, shift,
                    filename, minio_video_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE ppe_detection_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?, shift = ?,
                    filename = ?, minio_video_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM ppe_detection_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_ppe_detection_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM ppe_detection_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO ppe_detection_outputs (
                    input_id, person_id, helmet_worn, vest_worn, shoes_worn, violation_type,
                    confidence_score, status, first_seen_frame, last_seen_frame, first_seen_sec,
                    last_seen_sec, notes, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("person_id"),
                    output.get("helmet_worn"),
                    output.get("vest_worn"),
                    output.get("shoes_worn"),
                    output.get("violation_type"),
                    output.get("confidence_score"),
                    output.get("status"),
                    output.get("first_seen_frame"),
                    output.get("last_seen_frame"),
                    output.get("first_seen_sec"),
                    output.get("last_seen_sec"),
                    output.get("notes", ""),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM ppe_detection_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def upsert_region_alert_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    zone_type: str,
    filename: str,
    minio_video_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM region_alert_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            zone_type,
            filename,
            minio_video_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO region_alert_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone, zone_type,
                    filename, minio_video_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE region_alert_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?, zone_type = ?,
                    filename = ?, minio_video_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM region_alert_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_region_alert_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM region_alert_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO region_alert_outputs (
                    input_id, object_type, authorized, entry_time, exit_time, duration_sec,
                    alert_type, severity, confidence_score, status, notes, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("object_type"),
                    output.get("authorized"),
                    output.get("entry_time"),
                    output.get("exit_time"),
                    output.get("duration_sec"),
                    output.get("alert_type"),
                    output.get("severity"),
                    output.get("confidence_score"),
                    output.get("status"),
                    output.get("notes", ""),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM region_alert_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def upsert_fire_detection_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    filename: str,
    minio_video_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM fire_detection_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            filename,
            minio_video_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO fire_detection_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone,
                    filename, minio_video_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE fire_detection_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?,
                    filename = ?, minio_video_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM fire_detection_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_fire_detection_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM fire_detection_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO fire_detection_outputs (
                    input_id, fire_detected, smoke_detected, severity, alert_type,
                    confidence_score, response_time_sec, status, notes, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("fire_detected"),
                    output.get("smoke_detected"),
                    output.get("severity"),
                    output.get("alert_type"),
                    output.get("confidence_score"),
                    output.get("response_time_sec"),
                    output.get("status"),
                    output.get("notes", ""),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM fire_detection_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def upsert_crack_detection_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    filename: str,
    minio_input_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM crack_detection_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            filename,
            minio_input_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO crack_detection_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone,
                    filename, minio_input_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE crack_detection_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?,
                    filename = ?, minio_input_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM crack_detection_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_crack_detection_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM crack_detection_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO crack_detection_outputs (
                    input_id, crack_detected, crack_count, frames_analyzed, frames_with_cracks,
                    crack_rate_pct, max_confidence, avg_confidence, severity, status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("crack_detected"),
                    output.get("crack_count"),
                    output.get("frames_analyzed"),
                    output.get("frames_with_cracks"),
                    output.get("crack_rate_pct"),
                    output.get("max_confidence"),
                    output.get("avg_confidence"),
                    output.get("severity"),
                    output.get("status"),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM crack_detection_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def upsert_unsafe_behavior_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    filename: str,
    minio_input_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM unsafe_behavior_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            filename,
            minio_input_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO unsafe_behavior_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone,
                    filename, minio_input_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE unsafe_behavior_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?,
                    filename = ?, minio_input_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM unsafe_behavior_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_unsafe_behavior_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM unsafe_behavior_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO unsafe_behavior_outputs (
                    input_id, event_type, confidence, bbox_json, source, associated_person_box_json,
                    severity, status, frame_number, timestamp_sec, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("event_type"),
                    output.get("confidence"),
                    json.dumps(output.get("bbox_json") or []),
                    output.get("source"),
                    json.dumps(output.get("associated_person_box_json") or []),
                    output.get("severity"),
                    output.get("status"),
                    output.get("frame_number"),
                    output.get("timestamp_sec"),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM unsafe_behavior_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def upsert_speed_estimation_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    zone_speed_limit_kmh: float | None,
    filename: str,
    minio_video_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM speed_estimation_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            zone_speed_limit_kmh,
            filename,
            minio_video_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO speed_estimation_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone, zone_speed_limit_kmh,
                    filename, minio_video_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE speed_estimation_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?, zone_speed_limit_kmh = ?,
                    filename = ?, minio_video_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM speed_estimation_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_speed_estimation_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM speed_estimation_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO speed_estimation_outputs (
                    input_id, object_id, object_type, detected_speed_kmh, speed_limit_kmh,
                    is_overspeeding, excess_speed_kmh, confidence_score, status, notes, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("object_id"),
                    output.get("object_type"),
                    output.get("detected_speed_kmh"),
                    output.get("speed_limit_kmh"),
                    output.get("is_overspeeding"),
                    output.get("excess_speed_kmh"),
                    output.get("confidence_score"),
                    output.get("status"),
                    output.get("notes", ""),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM speed_estimation_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def upsert_queue_management_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    counter_id: str | None,
    max_queue_limit: int | None,
    filename: str,
    minio_video_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM queue_management_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            counter_id,
            max_queue_limit,
            filename,
            minio_video_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO queue_management_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone, counter_id, max_queue_limit,
                    filename, minio_video_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE queue_management_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?, counter_id = ?, max_queue_limit = ?,
                    filename = ?, minio_video_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM queue_management_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_queue_management_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM queue_management_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO queue_management_outputs (
                    input_id, queue_length, estimated_wait_sec, is_breached, excess_count,
                    staff_count, confidence_score, status, notes, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("queue_length"),
                    output.get("estimated_wait_sec"),
                    output.get("is_breached"),
                    output.get("excess_count"),
                    output.get("staff_count"),
                    output.get("confidence_score"),
                    output.get("status"),
                    output.get("notes", ""),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM queue_management_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def upsert_class_wise_object_counting_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    filename: str,
    minio_video_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM class_wise_object_counting_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            filename,
            minio_video_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO class_wise_object_counting_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone,
                    filename, minio_video_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE class_wise_object_counting_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?,
                    filename = ?, minio_video_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM class_wise_object_counting_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_class_wise_object_counting_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM class_wise_object_counting_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO class_wise_object_counting_outputs (
                    input_id, class_name, class_count, expected_count, count_difference,
                    total_objects_in_frame, class_percentage, confidence_score, status, notes, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("class_name"),
                    output.get("class_count"),
                    output.get("expected_count"),
                    output.get("count_difference"),
                    output.get("total_objects_in_frame"),
                    output.get("class_percentage"),
                    output.get("confidence_score"),
                    output.get("status"),
                    output.get("notes", ""),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM class_wise_object_counting_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def upsert_object_tracking_input(
    *,
    source_ref: str,
    integration_run_id: int | None,
    job_id: int | None,
    camera_id: str,
    location: str,
    zone: str,
    filename: str,
    minio_video_link: str | None,
    output_video_link: str | None,
    input_bucket: str | None,
    input_object_key: str | None,
    output_object_key: str | None,
    load_time_sec: float | None,
    processing_time_sec: float | None,
    simulated_timestamp: str,
    run_status: str,
    metadata_json: dict | None = None,
) -> dict:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT input_id FROM object_tracking_inputs WHERE source_ref = ?",
            (source_ref,),
        ).fetchone()

        payload = (
            integration_run_id,
            job_id,
            camera_id,
            location,
            zone,
            filename,
            minio_video_link,
            output_video_link,
            input_bucket,
            input_object_key,
            output_object_key,
            load_time_sec,
            processing_time_sec,
            simulated_timestamp,
            run_status,
            json.dumps(metadata_json or {}),
        )

        if existing is None:
            cursor = connection.execute(
                """
                INSERT INTO object_tracking_inputs (
                    source_ref, integration_run_id, job_id, camera_id, location, zone,
                    filename, minio_video_link, output_video_link, input_bucket, input_object_key,
                    output_object_key, load_time_sec, processing_time_sec, simulated_timestamp,
                    run_status, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_ref, *payload),
            )
            input_id = cursor.lastrowid
        else:
            input_id = existing["input_id"]
            connection.execute(
                """
                UPDATE object_tracking_inputs
                SET integration_run_id = ?, job_id = ?, camera_id = ?, location = ?, zone = ?,
                    filename = ?, minio_video_link = ?, output_video_link = ?, input_bucket = ?,
                    input_object_key = ?, output_object_key = ?, load_time_sec = ?, processing_time_sec = ?,
                    simulated_timestamp = ?, processed_at = CURRENT_TIMESTAMP, run_status = ?, metadata_json = ?
                WHERE input_id = ?
                """,
                (*payload, input_id),
            )

        connection.commit()
        row = connection.execute(
            "SELECT * FROM object_tracking_inputs WHERE input_id = ?",
            (input_id,),
        ).fetchone()
        return _row_to_dict(row)


def replace_object_tracking_outputs(
    *,
    input_id: int,
    outputs: list[dict],
) -> list[dict]:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM object_tracking_outputs WHERE input_id = ?",
            (input_id,),
        )

        for output in outputs:
            connection.execute(
                """
                INSERT INTO object_tracking_outputs (
                    input_id, object_id, object_type, entry_time, exit_time,
                    duration_in_zone_sec, next_zone, path_sequence, is_anomaly,
                    confidence_score, status, notes, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    input_id,
                    output.get("object_id"),
                    output.get("object_type"),
                    output.get("entry_time"),
                    output.get("exit_time"),
                    output.get("duration_in_zone_sec"),
                    output.get("next_zone"),
                    output.get("path_sequence"),
                    output.get("is_anomaly"),
                    output.get("confidence_score"),
                    output.get("status"),
                    output.get("notes", ""),
                    json.dumps(output.get("metadata_json") or {}),
                ),
            )

        connection.commit()
        rows = connection.execute(
            "SELECT * FROM object_tracking_outputs WHERE input_id = ? ORDER BY output_id ASC",
            (input_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_open_fine_tuning_session(usecase_slug: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM fine_tuning_sessions
            WHERE usecase_slug = ? AND status IN ('draft', 'setup_started', 'in_progress')
            ORDER BY datetime(updated_at) DESC, id DESC
            LIMIT 1
            """,
            (usecase_slug,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def create_fine_tuning_session(
    *,
    usecase_slug: str,
    starting_model_name: str | None,
    selected_dataset_id: int | None = None,
    readiness_score: int | None = None,
    recommended_next_action: str = "Run data check before setup.",
) -> dict:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO fine_tuning_sessions (
                usecase_slug, status, current_step, selected_dataset_id,
                starting_model_name, readiness_score, recommended_next_action
            )
            VALUES (?, 'draft', 1, ?, ?, ?, ?)
            """,
            (usecase_slug, selected_dataset_id, starting_model_name, readiness_score, recommended_next_action),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM fine_tuning_sessions WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return _row_to_dict(row)


def get_fine_tuning_session(session_id: int) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM fine_tuning_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def update_fine_tuning_session(session_id: int, **fields) -> dict:
    allowed = {
        "status",
        "current_step",
        "selected_dataset_id",
        "starting_model_name",
        "readiness_score",
        "recommended_next_action",
    }
    assignments = []
    values = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        assignments.append(f"{key} = ?")
        values.append(value)
    assignments.append("updated_at = CURRENT_TIMESTAMP")

    with get_connection() as connection:
        if values:
            connection.execute(
                f"UPDATE fine_tuning_sessions SET {', '.join(assignments)} WHERE id = ?",
                (*values, session_id),
            )
            connection.commit()
        row = connection.execute(
            "SELECT * FROM fine_tuning_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        return _row_to_dict(row)


def get_latest_dataset(usecase_slug: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM datasets
            WHERE usecase_slug = ?
            ORDER BY datetime(updated_at) DESC, id DESC
            LIMIT 1
            """,
            (usecase_slug,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def list_datasets_for_usecase(usecase_slug: str) -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT * FROM datasets
            WHERE usecase_slug = ?
            ORDER BY datetime(updated_at) DESC, id DESC
            """,
            (usecase_slug,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_dataset(dataset_id: int) -> dict | None:
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM datasets WHERE id = ?", (dataset_id,)).fetchone()
        return _row_to_dict(row) if row else None


def create_dataset(
    *,
    usecase_slug: str,
    name: str,
    source_type: str,
    minio_bucket: str | None,
    minio_prefix: str | None,
    media_type: str,
    file_count: int = 0,
    label_status: str = "unknown",
    audit_status: str = "not_run",
) -> dict:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO datasets (
                usecase_slug, name, source_type, minio_bucket, minio_prefix,
                media_type, file_count, label_status, audit_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                usecase_slug,
                name,
                source_type,
                minio_bucket,
                minio_prefix,
                media_type,
                file_count,
                label_status,
                audit_status,
            ),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM datasets WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _row_to_dict(row)


def upsert_default_dataset(
    *,
    usecase_slug: str,
    name: str,
    source_type: str,
    minio_bucket: str | None,
    minio_prefix: str | None,
    media_type: str,
) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT * FROM datasets
            WHERE usecase_slug = ? AND source_type = ? AND COALESCE(minio_bucket, '') = COALESCE(?, '')
              AND COALESCE(minio_prefix, '') = COALESCE(?, '')
            ORDER BY id DESC
            LIMIT 1
            """,
            (usecase_slug, source_type, minio_bucket, minio_prefix),
        ).fetchone()
        if row:
            return _row_to_dict(row)

        cursor = connection.execute(
            """
            INSERT INTO datasets (
                usecase_slug, name, source_type, minio_bucket, minio_prefix,
                media_type, label_status, audit_status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'unknown', 'not_run')
            """,
            (usecase_slug, name, source_type, minio_bucket, minio_prefix, media_type),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM datasets WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _row_to_dict(row)


def update_dataset_audit_summary(
    dataset_id: int,
    *,
    file_count: int,
    label_status: str,
    audit_status: str,
) -> dict:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE datasets
            SET file_count = ?, label_status = ?, audit_status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (file_count, label_status, audit_status, dataset_id),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM datasets WHERE id = ?", (dataset_id,)).fetchone()
        return _row_to_dict(row)


def update_dataset_label_status(dataset_id: int, *, label_status: str) -> dict:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE datasets
            SET label_status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (label_status, dataset_id),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM datasets WHERE id = ?", (dataset_id,)).fetchone()
        return _row_to_dict(row)


def reassign_selected_dataset_for_sessions(previous_dataset_id: int, replacement_dataset_id: int | None) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE fine_tuning_sessions
            SET selected_dataset_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE selected_dataset_id = ?
            """,
            (replacement_dataset_id, previous_dataset_id),
        )
        connection.commit()


def delete_dataset_registration(dataset_id: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM dataset_audits WHERE dataset_id = ?", (dataset_id,))
        connection.execute("DELETE FROM fine_tuning_dataset_versions WHERE dataset_id = ?", (dataset_id,))
        connection.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        connection.commit()


def get_active_model_version(usecase_slug: str) -> dict | None:
    with get_connection() as connection:
        columns = _table_columns(connection, "model_versions")

        if {"usecase_slug", "role", "is_active"}.issubset(columns):
            row = connection.execute(
                """
                SELECT * FROM model_versions
                WHERE usecase_slug = ? AND role = 'production' AND is_active = 1
                ORDER BY datetime(created_at) DESC, id DESC
                LIMIT 1
                """,
                (usecase_slug,),
            ).fetchone()
            return _row_to_dict(row) if row else None

        if {"use_case_id", "status", "version_name"}.issubset(columns):
            row = connection.execute(
                """
                SELECT mv.*
                FROM active_models am
                JOIN model_versions mv ON mv.id = am.active_model_version_id
                WHERE am.use_case_id = ?
                LIMIT 1
                """,
                (usecase_slug,),
            ).fetchone()
            if row is None:
                row = connection.execute(
                    """
                    SELECT *
                    FROM model_versions
                    WHERE use_case_id = ? AND status = 'promoted'
                    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, id DESC
                    LIMIT 1
                    """,
                    (usecase_slug,),
                ).fetchone()
            if row is None:
                return None

            normalized = _row_to_dict(row)
            normalized.setdefault("usecase_slug", normalized.get("use_case_id", usecase_slug))
            normalized.setdefault("role", "production")
            normalized.setdefault("is_active", 1)
            normalized.setdefault("quality_score", None)
            normalized.setdefault("latency_ms", None)
            normalized.setdefault("false_alarm_rate", None)
            return normalized

        return None


def ensure_default_model_version(
    *,
    usecase_slug: str,
    version_name: str = "YOLOv8n baseline",
) -> dict:
    existing = get_active_model_version(usecase_slug)
    if existing:
        return existing
    with get_connection() as connection:
        columns = _table_columns(connection, "model_versions")

        if not {"usecase_slug", "role", "is_active"}.issubset(columns):
            return {
                "id": f"default-{usecase_slug}",
                "training_job_id": "",
                "use_case_id": usecase_slug,
                "usecase_slug": usecase_slug,
                "model_path": "yolov8n.pt",
                "version_name": version_name,
                "status": "production",
                "role": "production",
                "is_active": 1,
                "quality_score": None,
                "latency_ms": None,
                "false_alarm_rate": None,
                "created_at": "",
                "updated_at": "",
            }

        cursor = connection.execute(
            """
            INSERT INTO model_versions (
                usecase_slug, version_name, role, is_active, quality_score,
                latency_ms, false_alarm_rate
            )
            VALUES (?, ?, 'production', 1, NULL, NULL, NULL)
            """,
            (usecase_slug, version_name),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM model_versions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _row_to_dict(row)


def create_dataset_audit(
    *,
    dataset_id: int,
    session_id: int,
    status: str = "running",
) -> dict:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO dataset_audits (
                dataset_id, session_id, status, issues_json,
                recommendations_json, summary_json
            )
            VALUES (?, ?, ?, '[]', '[]', '{}')
            """,
            (dataset_id, session_id, status),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM dataset_audits WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _row_to_dict(row)


def complete_dataset_audit(
    audit_id: int,
    *,
    status: str,
    readiness_score: int,
    issues: list[dict],
    recommendations: list[dict],
    summary: dict,
) -> dict:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE dataset_audits
            SET status = ?, readiness_score = ?, issues_json = ?,
                recommendations_json = ?, summary_json = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                status,
                readiness_score,
                json.dumps(issues),
                json.dumps(recommendations),
                json.dumps(summary),
                audit_id,
            ),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM dataset_audits WHERE id = ?", (audit_id,)).fetchone()
        return _row_to_dict(row)


def get_latest_dataset_audit(*, session_id: int, completed_only: bool = False) -> dict | None:
    query = "SELECT * FROM dataset_audits WHERE session_id = ?"
    params: list = [session_id]
    if completed_only:
        query += " AND status IN ('ready', 'mostly_ready', 'needs_cleanup', 'not_ready', 'failed')"
    query += " ORDER BY datetime(created_at) DESC, id DESC LIMIT 1"
    with get_connection() as connection:
        row = connection.execute(query, params).fetchone()
        return _row_to_dict(row) if row else None


def get_latest_dataset_audit_for_dataset(
    *,
    dataset_id: int,
    session_id: int | None = None,
    completed_only: bool = False,
) -> dict | None:
    query = "SELECT * FROM dataset_audits WHERE dataset_id = ?"
    params: list = [dataset_id]
    if session_id is not None:
        query += " AND session_id = ?"
        params.append(session_id)
    if completed_only:
        query += " AND status IN ('ready', 'mostly_ready', 'needs_cleanup', 'not_ready', 'failed')"
    query += " ORDER BY datetime(created_at) DESC, id DESC LIMIT 1"
    with get_connection() as connection:
        row = connection.execute(query, params).fetchone()
        return _row_to_dict(row) if row else None


def get_dataset_audit(audit_id: int) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM dataset_audits WHERE id = ?",
            (audit_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def upsert_fine_tuning_dataset_version(
    *,
    dataset_id: int,
    dataset_version_id: str,
    session_id: int,
    data_fingerprint: str,
    manifest_uri: str,
    prepared_dataset_uri: str,
    annotation_format: str,
    task_type: str,
    item_count: int,
    label_count: int,
    readiness_score: int | None,
    label_status: str,
    status: str,
    schema_version: str,
    payload: dict,
) -> dict:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO fine_tuning_dataset_versions (
                dataset_id, dataset_version_id, session_id, data_fingerprint,
                manifest_uri, prepared_dataset_uri, annotation_format, task_type,
                item_count, label_count, readiness_score, label_status, status,
                schema_version, payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, dataset_version_id) DO UPDATE SET
                data_fingerprint = excluded.data_fingerprint,
                manifest_uri = excluded.manifest_uri,
                prepared_dataset_uri = excluded.prepared_dataset_uri,
                annotation_format = excluded.annotation_format,
                task_type = excluded.task_type,
                item_count = excluded.item_count,
                label_count = excluded.label_count,
                readiness_score = excluded.readiness_score,
                label_status = excluded.label_status,
                status = excluded.status,
                schema_version = excluded.schema_version,
                payload_json = excluded.payload_json
            """,
            (
                dataset_id,
                dataset_version_id,
                session_id,
                data_fingerprint,
                manifest_uri,
                prepared_dataset_uri,
                annotation_format,
                task_type,
                item_count,
                label_count,
                readiness_score,
                label_status,
                status,
                schema_version,
                json.dumps(payload),
            ),
        )
        connection.commit()
        row = connection.execute(
            """
            SELECT * FROM fine_tuning_dataset_versions
            WHERE session_id = ? AND dataset_version_id = ?
            """,
            (session_id, dataset_version_id),
        ).fetchone()
        return _row_to_dict(row)


def _row_to_dict(row) -> dict:
    """Convert a sqlite Row to dict, parsing JSON-ish columns."""
    d = dict(row)
    for json_key in ("metrics", "metadata_json", "issues_json", "recommendations_json", "summary_json", "payload_json"):
        if json_key in d and isinstance(d[json_key], str):
            try:
                d[json_key] = json.loads(d[json_key])
            except (json.JSONDecodeError, TypeError):
                d[json_key] = [] if json_key in {"issues_json", "recommendations_json"} else {}
    return d
