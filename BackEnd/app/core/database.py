import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "sutherland_hub.db"


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


def _row_to_dict(row) -> dict:
    """Convert a sqlite Row to dict, parsing JSON-ish columns."""
    d = dict(row)
    for json_key in ("metrics", "metadata_json"):
        if json_key in d and isinstance(d[json_key], str):
            try:
                d[json_key] = json.loads(d[json_key])
            except (json.JSONDecodeError, TypeError):
                d[json_key] = {}
    return d
