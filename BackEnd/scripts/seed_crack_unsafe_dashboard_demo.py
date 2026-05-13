import json
import random
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import DB_PATH, init_db  # noqa: E402


RNG = random.Random(42)
CRACK_INPUT_COUNT = 108
UNSAFE_INPUT_COUNT = 35
NOW = datetime(2026, 5, 7, 12, 0, 0)


def table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    cursor = connection.execute(f"PRAGMA table_info({table_name})")
    return {str(row[1]) for row in cursor.fetchall()}


def build_insert_sql(table_name: str, columns: list[str]) -> str:
    placeholders = ", ".join("?" for _ in columns)
    joined_columns = ", ".join(columns)
    return f"INSERT INTO {table_name} ({joined_columns}) VALUES ({placeholders})"


def build_update_sql(table_name: str, columns: list[str], where_column: str) -> str:
    assignments = ", ".join(f"{column} = ?" for column in columns if column != where_column)
    return f"UPDATE {table_name} SET {assignments} WHERE {where_column} = ?"


def upsert_row(
    connection: sqlite3.Connection,
    *,
    table_name: str,
    unique_column: str,
    payload: dict,
) -> int:
    existing = connection.execute(
        f"SELECT input_id FROM {table_name} WHERE {unique_column} = ?",
        (payload[unique_column],),
    ).fetchone()

    if existing is None:
        columns = list(payload.keys())
        connection.execute(
            build_insert_sql(table_name, columns),
            [payload[column] for column in columns],
        )
        row = connection.execute(
            f"SELECT input_id FROM {table_name} WHERE {unique_column} = ?",
            (payload[unique_column],),
        ).fetchone()
        return int(row["input_id"])

    input_id = int(existing["input_id"])
    columns = list(payload.keys())
    connection.execute(
        build_update_sql(table_name, columns, unique_column),
        [payload[column] for column in columns if column != unique_column] + [payload[unique_column]],
    )
    return input_id


def replace_rows(
    connection: sqlite3.Connection,
    *,
    table_name: str,
    match_column: str,
    match_value: int,
    rows: list[dict],
) -> int:
    connection.execute(f"DELETE FROM {table_name} WHERE {match_column} = ?", (match_value,))
    if not rows:
        return 0
    columns = list(rows[0].keys())
    insert_sql = build_insert_sql(table_name, columns)
    for row in rows:
        connection.execute(insert_sql, [row[column] for column in columns])
    return len(rows)


def prune_demo_rows(
    connection: sqlite3.Connection,
    *,
    input_table: str,
    output_table: str,
    demo_prefix: str,
    keep_source_refs: list[str],
) -> None:
    placeholders = ", ".join("?" for _ in keep_source_refs)
    query = (
        f"SELECT input_id FROM {input_table} WHERE source_ref LIKE ? "
        f"AND source_ref NOT IN ({placeholders})"
    )
    obsolete_rows = connection.execute(query, [f"{demo_prefix}%"] + keep_source_refs).fetchall()
    obsolete_ids = [int(row["input_id"]) for row in obsolete_rows]
    if not obsolete_ids:
        return

    id_placeholders = ", ".join("?" for _ in obsolete_ids)
    connection.execute(f"DELETE FROM {output_table} WHERE input_id IN ({id_placeholders})", obsolete_ids)
    connection.execute(f"DELETE FROM {input_table} WHERE input_id IN ({id_placeholders})", obsolete_ids)


def choose_link_column(columns: set[str]) -> str | None:
    if "output_video_link" in columns:
        return "output_video_link"
    if "output_media_link" in columns:
        return "output_media_link"
    return None


def random_timestamp(index: int) -> datetime:
    days_back = index % 7
    hours_back = RNG.randint(0, 23)
    minutes_back = RNG.randint(0, 59)
    seconds_back = RNG.randint(0, 59)
    return NOW - timedelta(days=days_back, hours=hours_back, minutes=minutes_back, seconds=seconds_back)


def expand_weighted_values(distribution: list[tuple[str, int]]) -> list[str]:
    values: list[str] = []
    for label, count in distribution:
        values.extend([label] * count)
    return values


def crack_recommended_action(severity: str, crack_detected: bool) -> str:
    if not crack_detected:
        return "Monitor"
    if severity == "critical":
        return "Immediate inspection"
    if severity == "high":
        return "Repair required"
    if severity == "medium":
        return "Schedule maintenance review"
    return "Monitor"


def unsafe_recommended_action(event_type: str, severity: str) -> str:
    if severity in {"critical", "high"}:
        return "Immediate safety review"
    if event_type == "phone_usage":
        return "Policy violation review"
    if event_type in {"smoking", "cigarette"}:
        return "Supervisor review required"
    return "Review event evidence"


def event_label(event_type: str) -> str:
    labels = {
        "phone_usage": "Phone Usage",
        "smoking": "Smoking",
        "cigarette": "Cigarette",
        "unsafe_behavior": "Unsafe Behavior",
    }
    return labels[event_type]


def make_bbox() -> list[int]:
    x1 = RNG.randint(80, 520)
    y1 = RNG.randint(60, 260)
    width = RNG.randint(55, 180)
    height = RNG.randint(45, 140)
    return [x1, y1, x1 + width, y1 + height]


def make_person_bbox(bbox: list[int]) -> list[int]:
    x1, y1, x2, y2 = bbox
    pad_left = RNG.randint(10, 30)
    pad_top = RNG.randint(30, 70)
    pad_right = RNG.randint(20, 45)
    pad_bottom = RNG.randint(60, 120)
    return [max(0, x1 - pad_left), max(0, y1 - pad_top), x2 + pad_right, y2 + pad_bottom]


def generate_crack_plan() -> list[dict]:
    zone_pool = expand_weighted_values(
        [
            ("Loading Bay", 24),
            ("Warehouse Floor", 19),
            ("Dock Lane", 17),
            ("Machine Lane", 15),
            ("Inspection Area", 13),
            ("Forklift Bay", 11),
            ("Maintenance Yard", 9),
        ]
    )
    severity_pool = expand_weighted_values(
        [
            ("critical", 11),
            ("high", 24),
            ("medium", 39),
            ("low", 22),
            ("none", 12),
        ]
    )
    defect_type_pool = expand_weighted_values(
        [
            ("Crack", 38),
            ("Surface Damage", 24),
            ("Spalling", 14),
            ("Corrosion", 12),
            ("Pothole", 8),
        ]
    )
    camera_pool = (
        ["CAM-DEF-01"] * 20
        + ["CAM-DEF-02"] * 19
        + ["CAM-DEF-03"] * 18
        + ["CAM-DEF-04"] * 18
        + ["CAM-DEF-05"] * 17
        + ["CAM-DEF-06"] * 16
    )

    if not (len(zone_pool) == len(severity_pool) == len(camera_pool) == CRACK_INPUT_COUNT):
        raise ValueError("Crack demo distributions must match CRACK_INPUT_COUNT")

    RNG.shuffle(zone_pool)
    RNG.shuffle(severity_pool)
    RNG.shuffle(camera_pool)
    RNG.shuffle(defect_type_pool)

    location_by_zone = {
        "Loading Bay": "Logistics Hub",
        "Warehouse Floor": "Central Warehouse",
        "Dock Lane": "Loading Terminal",
        "Machine Lane": "North Plant",
        "Inspection Area": "Quality Center",
        "Forklift Bay": "Distribution Wing",
        "Maintenance Yard": "Service Yard",
    }

    plan: list[dict] = []
    defect_index = 0
    for index in range(CRACK_INPUT_COUNT):
        severity = severity_pool[index]
        crack_detected = severity != "none"
        if not crack_detected:
            status = "normal"
            defect_type = ""
        elif severity == "critical":
            status = RNG.choice(["open", "open", "needs_review"])
            defect_type = defect_type_pool[defect_index]
            defect_index += 1
        elif severity == "high":
            status = RNG.choice(["open", "needs_review", "needs_review", "resolved"])
            defect_type = defect_type_pool[defect_index]
            defect_index += 1
        elif severity == "medium":
            status = RNG.choice(["needs_review", "needs_review", "resolved", "open"])
            defect_type = defect_type_pool[defect_index]
            defect_index += 1
        else:
            status = RNG.choice(["monitoring", "resolved", "needs_review"])
            defect_type = defect_type_pool[defect_index]
            defect_index += 1

        zone = zone_pool[index]
        plan.append(
            {
                "camera_id": camera_pool[index],
                "location": location_by_zone[zone],
                "zone": zone,
                "severity": severity,
                "status": status,
                "crack_detected": crack_detected,
                "defect_type": defect_type,
            }
        )

    return plan


def generate_unsafe_plan() -> list[dict]:
    event_types = (
        ["phone_usage"] * 16
        + ["smoking"] * 9
        + ["cigarette"] * 5
        + ["unsafe_behavior"] * 5
    )
    severities = ["low"] * 7 + ["medium"] * 12 + ["high"] * 11 + ["critical"] * 5
    statuses = ["open"] * 12 + ["needs_review"] * 11 + ["violation"] * 7 + ["resolved"] * 5

    plan = []
    for index in range(UNSAFE_INPUT_COUNT):
        plan.append(
            {
                "event_type": event_types[index],
                "severity": severities[index],
                "status": statuses[index],
            }
        )

    RNG.shuffle(plan)
    return plan


def generate_crack_rows(columns: set[str], output_columns: set[str]) -> tuple[list[dict], list[dict], dict]:
    link_column = choose_link_column(columns)
    plan = generate_crack_plan()

    inputs = []
    outputs = []
    summary = {
        "total_crack_detections": 0,
        "critical_defects": 0,
        "open_defects": 0,
    }

    for index in range(1, CRACK_INPUT_COUNT + 1):
        planned = plan[index - 1]
        source_ref = f"demo_crack_{index:03d}"
        processed_at = random_timestamp(index)
        filename = f"crack_inspection_{index:03d}.mp4"
        output_link = (
            f"http://localhost:9000/vision-demo/crack/output/crack_inspection_{index:03d}_annotated.mp4"
        )
        input_metadata = {
            "source": "demo_seed",
            "is_demo": True,
            "seed_group": "crack_detection_dashboard",
        }
        if link_column is None:
            input_metadata["output_link"] = output_link

        input_payload = {
            "source_ref": source_ref,
            "integration_run_id": None,
            "job_id": None,
            "camera_id": planned["camera_id"],
            "location": planned["location"],
            "zone": planned["zone"],
            "filename": filename,
            "minio_input_link": f"http://localhost:9000/vision-demo/crack/input/{filename}",
            "input_bucket": "vision-demo" if "input_bucket" in columns else None,
            "input_object_key": f"crack/input/{filename}" if "input_object_key" in columns else None,
            "output_object_key": (
                f"crack/output/crack_inspection_{index:03d}_annotated.mp4"
                if "output_object_key" in columns
                else None
            ),
            "load_time_sec": round(RNG.uniform(0.5, 2.4), 2) if "load_time_sec" in columns else None,
            "processing_time_sec": (
                round(RNG.uniform(4.2, 18.8), 2) if "processing_time_sec" in columns else None
            ),
            "simulated_timestamp": processed_at.isoformat(timespec="seconds") + "Z",
            "processed_at": processed_at.isoformat(sep=" ", timespec="seconds"),
            "run_status": "needs_review" if index in {8, 21} else "completed",
            "metadata_json": json.dumps(input_metadata),
        }
        if link_column is not None:
            input_payload[link_column] = output_link

        filtered_input = {key: value for key, value in input_payload.items() if key in columns}
        inputs.append(filtered_input)

        crack_detected = planned["crack_detected"]
        severity = planned["severity"]
        status = planned["status"]
        defect_type = planned["defect_type"]
        if crack_detected:
            crack_count = {
                "critical": RNG.randint(28, 40),
                "high": RNG.randint(18, 30),
                "medium": RNG.randint(9, 18),
                "low": RNG.randint(2, 8),
            }[planned["severity"]]
        else:
            crack_count = 0
        frames_analyzed = RNG.randint(720, 1800)
        frames_with_cracks = RNG.randint(42, 260) if crack_detected else 0
        crack_rate_pct = round((frames_with_cracks / frames_analyzed) * 100, 2) if frames_analyzed else 0.0
        max_confidence = round(RNG.uniform(0.72, 0.97), 2) if crack_detected else round(RNG.uniform(0.0, 0.35), 2)
        avg_confidence = round(max(0.0, max_confidence - RNG.uniform(0.03, 0.18)), 2)
        recommended_action = crack_recommended_action(severity, crack_detected)

        defect_events = []
        if crack_detected:
            for _ in range(RNG.randint(1, 3)):
                event_confidence = round(min(max_confidence, RNG.uniform(avg_confidence, max_confidence)), 2)
                defect_events.append(
                    {
                        "frame_number": RNG.randint(20, max(20, frames_analyzed)),
                        "timestamp_sec": round(RNG.uniform(1.0, 42.0), 1),
                        "defect_type": defect_type,
                        "confidence": event_confidence,
                        "bbox": make_bbox(),
                        "severity": severity,
                        "recommended_action": recommended_action,
                    }
                )

        outputs.append(
            {
                "crack_detected": 1 if crack_detected else 0,
                "crack_count": crack_count,
                "frames_analyzed": frames_analyzed,
                "frames_with_cracks": frames_with_cracks,
                "crack_rate_pct": crack_rate_pct,
                "max_confidence": max_confidence,
                "avg_confidence": avg_confidence,
                "severity": severity,
                "status": status,
                "metadata_json": json.dumps(
                    {
                        "source": "demo_seed",
                        "is_demo": True,
                        "defect_type": defect_type,
                        "recommended_action": recommended_action,
                        "defect_events": defect_events,
                    }
                ),
            }
        )

        if crack_detected:
            summary["total_crack_detections"] += crack_count
        if severity == "critical":
            summary["critical_defects"] += 1
        if status == "open":
            summary["open_defects"] += 1

    filtered_outputs = [{key: value for key, value in row.items() if key in output_columns} for row in outputs]
    return inputs, filtered_outputs, summary


def generate_unsafe_rows(columns: set[str], output_columns: set[str]) -> tuple[list[dict], list[dict], dict]:
    cameras = ["CAM-SAFE-01", "CAM-SAFE-02", "CAM-SAFE-03", "CAM-SAFE-04"]
    locations = ["Plant A", "Assembly Unit", "Warehouse 2", "Production Block"]
    zones = [
        "Assembly Line",
        "Loading Area",
        "Storage Zone",
        "Production Floor",
        "Restricted Area",
        "Packing Zone",
    ]
    link_column = choose_link_column(columns)
    plan = generate_unsafe_plan()

    inputs = []
    outputs = []
    summary = {
        "phone_usage_events": 0,
        "smoking_or_cigarette_events": 0,
        "high_or_critical_events": 0,
        "open_events": 0,
    }

    for index in range(1, UNSAFE_INPUT_COUNT + 1):
        planned = plan[index - 1]
        source_ref = f"demo_unsafe_{index:03d}"
        processed_at = random_timestamp(index + 100)
        filename = f"unsafe_behavior_{index:03d}.mp4"
        output_link = (
            "http://localhost:9000/vision-demo/unsafe_behavior/output/"
            f"unsafe_behavior_{index:03d}_annotated.mp4"
        )
        input_metadata = {
            "source": "demo_seed",
            "is_demo": True,
            "seed_group": "unsafe_behavior_dashboard",
        }
        if link_column is None:
            input_metadata["output_link"] = output_link

        input_payload = {
            "source_ref": source_ref,
            "integration_run_id": None,
            "job_id": None,
            "camera_id": cameras[(index - 1) % len(cameras)],
            "location": locations[(index - 1) % len(locations)],
            "zone": zones[(index - 1) % len(zones)],
            "filename": filename,
            "minio_input_link": f"http://localhost:9000/vision-demo/unsafe_behavior/input/{filename}",
            "input_bucket": "vision-demo" if "input_bucket" in columns else None,
            "input_object_key": (
                f"unsafe_behavior/input/{filename}" if "input_object_key" in columns else None
            ),
            "output_object_key": (
                f"unsafe_behavior/output/unsafe_behavior_{index:03d}_annotated.mp4"
                if "output_object_key" in columns
                else None
            ),
            "load_time_sec": round(RNG.uniform(0.4, 2.0), 2) if "load_time_sec" in columns else None,
            "processing_time_sec": (
                round(RNG.uniform(3.8, 14.9), 2) if "processing_time_sec" in columns else None
            ),
            "simulated_timestamp": processed_at.isoformat(timespec="seconds") + "Z",
            "processed_at": processed_at.isoformat(sep=" ", timespec="seconds"),
            "run_status": "completed",
            "metadata_json": json.dumps(input_metadata),
        }
        if link_column is not None:
            input_payload[link_column] = output_link

        filtered_input = {key: value for key, value in input_payload.items() if key in columns}
        inputs.append(filtered_input)

        event_type = planned["event_type"]
        severity = planned["severity"]
        status = planned["status"]
        bbox = make_bbox()
        person_bbox = make_person_bbox(bbox)
        confidence = round(RNG.uniform(0.65, 0.97), 2)
        recommended_action = unsafe_recommended_action(event_type, severity)
        notes = {
            "phone_usage": "Person appears to be handling a phone near an active work area",
            "smoking": "Smoking detected inside an operational zone",
            "cigarette": "Cigarette-like object detected near personnel",
            "unsafe_behavior": "Behavior pattern flagged as unsafe by monitoring rules",
        }[event_type]

        outputs.append(
            {
                "event_type": event_type,
                "confidence": confidence,
                "bbox_json": json.dumps(bbox),
                "source": "demo_seed",
                "associated_person_box_json": json.dumps(person_bbox),
                "severity": severity,
                "status": status,
                "frame_number": RNG.randint(20, 900),
                "timestamp_sec": round(RNG.uniform(1.0, 45.0), 1),
                "metadata_json": json.dumps(
                    {
                        "source": "demo_seed",
                        "is_demo": True,
                        "event_label": event_label(event_type),
                        "recommended_action": recommended_action,
                        "notes": notes,
                    }
                ),
            }
        )

        if event_type == "phone_usage":
            summary["phone_usage_events"] += 1
        if event_type in {"smoking", "cigarette"}:
            summary["smoking_or_cigarette_events"] += 1
        if severity in {"high", "critical"}:
            summary["high_or_critical_events"] += 1
        if status in {"open", "needs_review"}:
            summary["open_events"] += 1

    filtered_outputs = [{key: value for key, value in row.items() if key in output_columns} for row in outputs]
    return inputs, filtered_outputs, summary


def seed_crack_detection_demo(connection: sqlite3.Connection) -> tuple[dict, dict]:
    input_columns = table_columns(connection, "crack_detection_inputs")
    output_columns = table_columns(connection, "crack_detection_outputs")
    input_rows, output_rows, summary = generate_crack_rows(input_columns, output_columns)
    keep_refs = [row["source_ref"] for row in input_rows]

    prune_demo_rows(
        connection,
        input_table="crack_detection_inputs",
        output_table="crack_detection_outputs",
        demo_prefix="demo_crack_",
        keep_source_refs=keep_refs,
    )

    for input_payload, output_payload in zip(input_rows, output_rows, strict=True):
        input_id = upsert_row(
            connection,
            table_name="crack_detection_inputs",
            unique_column="source_ref",
            payload=input_payload,
        )
        replace_rows(
            connection,
            table_name="crack_detection_outputs",
            match_column="input_id",
            match_value=input_id,
            rows=[{"input_id": input_id, **output_payload}],
        )

    counts = connection.execute(
        """
        SELECT
            COUNT(*) AS input_count,
            (
                SELECT COUNT(*)
                FROM crack_detection_outputs o
                JOIN crack_detection_inputs i ON i.input_id = o.input_id
                WHERE i.source_ref LIKE 'demo_crack_%'
            ) AS output_count
        FROM crack_detection_inputs
        WHERE source_ref LIKE 'demo_crack_%'
        """
    ).fetchone()

    return {
        "inputs": int(counts["input_count"]),
        "outputs": int(counts["output_count"]),
        **summary,
    }, {"input_columns": input_columns, "output_columns": output_columns}


def seed_unsafe_behavior_demo(connection: sqlite3.Connection) -> tuple[dict, dict]:
    input_columns = table_columns(connection, "unsafe_behavior_inputs")
    output_columns = table_columns(connection, "unsafe_behavior_outputs")
    input_rows, output_rows, summary = generate_unsafe_rows(input_columns, output_columns)
    keep_refs = [row["source_ref"] for row in input_rows]

    prune_demo_rows(
        connection,
        input_table="unsafe_behavior_inputs",
        output_table="unsafe_behavior_outputs",
        demo_prefix="demo_unsafe_",
        keep_source_refs=keep_refs,
    )

    for input_payload, output_payload in zip(input_rows, output_rows, strict=True):
        input_id = upsert_row(
            connection,
            table_name="unsafe_behavior_inputs",
            unique_column="source_ref",
            payload=input_payload,
        )
        replace_rows(
            connection,
            table_name="unsafe_behavior_outputs",
            match_column="input_id",
            match_value=input_id,
            rows=[{"input_id": input_id, **output_payload}],
        )

    counts = connection.execute(
        """
        SELECT
            COUNT(*) AS input_count,
            (
                SELECT COUNT(*)
                FROM unsafe_behavior_outputs o
                JOIN unsafe_behavior_inputs i ON i.input_id = o.input_id
                WHERE i.source_ref LIKE 'demo_unsafe_%'
            ) AS output_count
        FROM unsafe_behavior_inputs
        WHERE source_ref LIKE 'demo_unsafe_%'
        """
    ).fetchone()

    return {
        "inputs": int(counts["input_count"]),
        "outputs": int(counts["output_count"]),
        **summary,
    }, {"input_columns": input_columns, "output_columns": output_columns}


def main() -> None:
    init_db()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        crack_summary, _ = seed_crack_detection_demo(connection)
        unsafe_summary, _ = seed_unsafe_behavior_demo(connection)
        connection.commit()
    finally:
        connection.close()

    print("Seeded crack detection demo dashboard rows:")
    print(f"- inputs: {crack_summary['inputs']}")
    print(f"- outputs: {crack_summary['outputs']}")
    print(f"- total crack detections: {crack_summary['total_crack_detections']}")
    print(f"- critical defects: {crack_summary['critical_defects']}")
    print(f"- open defects: {crack_summary['open_defects']}")
    print("")
    print("Seeded unsafe behavior demo dashboard rows:")
    print(f"- inputs: {unsafe_summary['inputs']}")
    print(f"- outputs: {unsafe_summary['outputs']}")
    print(f"- phone usage events: {unsafe_summary['phone_usage_events']}")
    print(f"- smoking/cigarette events: {unsafe_summary['smoking_or_cigarette_events']}")
    print(f"- high/critical events: {unsafe_summary['high_or_critical_events']}")
    print(f"- open events: {unsafe_summary['open_events']}")
    print("")
    print("Done.")


if __name__ == "__main__":
    main()
