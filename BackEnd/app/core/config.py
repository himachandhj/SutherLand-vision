from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Sutherland Hub API"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    fine_tuning_internal_base_url: str = "http://127.0.0.1:8000"
    fine_tuning_use_mock_dataset_ready_payload: bool = False
    fine_tuning_mock_dataset_ready_status: str = "ready_for_training"
    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_secure: bool = False
    minio_bucket: str = "vision-demo"
    minio_input_prefix: str = "input/"
    minio_output_prefix: str = "output/"
    minio_demo_mode: bool = True
    minio_presigned_expiry_minutes: int = 60
    minio_auto_poll_interval_seconds: int = 10

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
