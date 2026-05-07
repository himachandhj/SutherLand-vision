from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from pathlib import PurePosixPath
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error


VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass(frozen=True)
class MinioConnectionConfig:
    endpoint: str
    access_key: str
    secret_key: str
    bucket: str
    input_prefix: str = "input/"
    output_prefix: str = "output/"
    secure: bool = False

    def normalized(self) -> "MinioConnectionConfig":
        endpoint, secure = normalize_endpoint(self.endpoint, self.secure)
        return MinioConnectionConfig(
            endpoint=endpoint,
            access_key=self.access_key.strip(),
            secret_key=self.secret_key.strip(),
            bucket=self.bucket.strip(),
            input_prefix=normalize_prefix(self.input_prefix, "input/"),
            output_prefix=normalize_prefix(self.output_prefix, "output/"),
            secure=secure,
        )

    @property
    def display_endpoint(self) -> str:
        scheme = "https" if self.secure else "http"
        return f"{scheme}://{self.endpoint}"


def normalize_endpoint(endpoint: str, secure: bool | None = None) -> tuple[str, bool]:
    raw = endpoint.strip()
    if not raw:
        raise ValueError("MinIO endpoint is required.")

    parsed = urlparse(raw if "://" in raw else f"http://{raw}")
    host = parsed.netloc or parsed.path
    host = host.rstrip("/")
    if not host:
        raise ValueError("MinIO endpoint is invalid.")

    resolved_secure = secure if secure is not None else parsed.scheme == "https"
    return host, resolved_secure


def normalize_prefix(prefix: str | None, fallback: str) -> str:
    candidate = (prefix or fallback or "").strip().strip("/")
    if not candidate:
        return ""
    return f"{candidate}/"


def create_client(config: MinioConnectionConfig) -> Minio:
    normalized = config.normalized()
    return Minio(
        normalized.endpoint,
        access_key=normalized.access_key,
        secret_key=normalized.secret_key,
        secure=normalized.secure,
    )


def validate_bucket_access(client: Minio, bucket: str, *, auto_create: bool = False) -> bool:
    try:
        exists = client.bucket_exists(bucket)
    except S3Error as error:
        raise ValueError(f"Unable to access bucket '{bucket}': {error}") from error

    if exists:
        return False

    if not auto_create:
        raise ValueError(
            f"Bucket '{bucket}' does not exist. Create it first or use local demo mode so it can be created automatically."
        )

    try:
        client.make_bucket(bucket)
        return True
    except S3Error as error:
        raise ValueError(
            f"Bucket '{bucket}' was missing and automatic creation failed: {error}"
        ) from error


def list_media_objects(
    client: Minio,
    bucket: str,
    prefix: str,
    *,
    allowed_extensions: set[str] | None = None,
) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    extensions = allowed_extensions or VIDEO_EXTENSIONS
    for obj in client.list_objects(bucket, prefix=prefix, recursive=True):
        if getattr(obj, "is_dir", False):
            continue
        suffix = PurePosixPath(obj.object_name).suffix.lower()
        if suffix not in extensions:
            continue
        items.append(
            {
                "object_key": obj.object_name,
                "name": PurePosixPath(obj.object_name).name,
                "size_bytes": int(getattr(obj, "size", 0) or 0),
                "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
            }
        )
    return sorted(items, key=lambda item: item["last_modified"] or "", reverse=True)


def list_video_objects(client: Minio, bucket: str, prefix: str) -> list[dict[str, object]]:
    return list_media_objects(client, bucket, prefix, allowed_extensions=VIDEO_EXTENSIONS)


def build_output_object_key(
    input_key: str,
    input_prefix: str,
    output_prefix: str,
    use_case_suffix: str = "ppe_detection",
) -> str:
    normalized_input = input_key.lstrip("/")
    normalized_input_prefix = normalize_prefix(input_prefix, "")
    normalized_output_prefix = normalize_prefix(output_prefix, "")

    if normalized_input_prefix and normalized_input.startswith(normalized_input_prefix):
        relative = normalized_input[len(normalized_input_prefix):]
    else:
        relative = PurePosixPath(normalized_input).name

    relative_path = PurePosixPath(relative)
    parent = "" if str(relative_path.parent) == "." else f"{relative_path.parent.as_posix()}/"
    suffix = relative_path.suffix or ".mp4"
    stem = relative_path.stem
    return f"{normalized_output_prefix}{parent}{stem}_{use_case_suffix}{suffix}"


def object_exists(client: Minio, bucket: str, object_key: str) -> bool:
    try:
        client.stat_object(bucket, object_key)
        return True
    except S3Error:
        return False


def build_presigned_get_url(
    client: Minio,
    bucket: str,
    object_key: str,
    expires_minutes: int,
) -> str | None:
    if not object_key:
        return None
    try:
        return client.presigned_get_object(
            bucket,
            object_key,
            expires=timedelta(minutes=expires_minutes),
        )
    except Exception:
        return None
