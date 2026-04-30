import sys
from typing import Any

import requests


BASE_URL = "http://127.0.0.1:8000"
SESSION_ID = "demo-session-1"
TRAINING_PLAN_PAYLOAD = {
    "base_model": "yolo_pretrained",
    "epochs": 3,
    "batch_size": 2,
    "img_size": 640,
}


def print_response(title: str, payload: dict[str, Any]) -> None:
    print(f"\n{title}")
    print("-" * len(title))
    for key, value in payload.items():
        print(f"{key}: {value}")


def post_json(url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    response = requests.post(url, json=payload or {}, timeout=30)
    try:
        response_payload = response.json()
    except ValueError:
        response_payload = {"raw_response": response.text}

    if not response.ok:
        detail = response_payload.get("detail", response_payload)
        raise RuntimeError(f"HTTP {response.status_code}: {detail}")

    return response_payload


def main() -> int:
    training_plan_url = f"{BASE_URL}/api/fine-tuning/{SESSION_ID}/training-plan"

    print("Creating training job...")
    try:
        step_4_response = post_json(training_plan_url, TRAINING_PLAN_PAYLOAD)
    except Exception as error:
        print(f"Step 4 failed: {error}")
        print("\nRun using: python run_training_pipeline.py")
        return 1

    print_response("Step 4 response", step_4_response)

    training_job_id = step_4_response.get("training_job_id")
    if not training_job_id:
        print("Step 4 failed: response did not include training_job_id.")
        print("\nRun using: python run_training_pipeline.py")
        return 1

    print(f"\nTraining job ID: {training_job_id}")
    print("Starting training...")

    run_url = f"{BASE_URL}/api/fine-tuning/{training_job_id}/run"
    try:
        step_5_response = post_json(run_url)
    except Exception as error:
        print(f"Step 5 failed: {error}")
        print("\nRun using: python run_training_pipeline.py")
        return 1

    print_response("Step 5 response", step_5_response)

    final_status = step_5_response.get("status", "unknown")
    print(f"\nFinal job status: {final_status}")
    if final_status == "completed":
        print("Training completed!")

    print("\nRun using: python run_training_pipeline.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
