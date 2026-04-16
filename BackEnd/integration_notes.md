# Frontend + Backend integration

## Backend
1. Put `backend_api.py` in the same folder as `ppe_detection.py`.
2. Install dependencies:
   ```bash
   pip install -r requirements_backend.txt
   ```
3. Start the API:
   ```bash
   uvicorn backend_api:app --reload --host 0.0.0.0 --port 8001
   ```

## Frontend
The frontend should use:
```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
```

## Expected endpoints
- `POST /api/analyze-image` for uploaded images
- `POST /detect/` for uploaded videos
- `GET /health` to check the server

## Output paths
The video endpoint returns:
```json
{
  "message": "Video processed successfully.",
  "output_video": "outputs/<file>.mp4"
}
```
The frontend can prepend the base URL to display the result video.
