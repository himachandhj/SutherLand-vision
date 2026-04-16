"""
PPE Detection — Helmet / Vest / Shoes  (Accuracy-First v3)
============================================================
Fixes false positives caused by:
  - Gray/white hair triggering helmet detection
  - Adjacent person's vest bleeding into neighboring person's bbox
  - Background shelves/boxes triggering PPE color detection

Core strategy:
  1. SKIN + HAIR as primary NEGATIVE signals for helmet detection.
     If skin is visible on top of head → no helmet. Period.
  2. STRICT horizontal inset (15% each side) on all crops to prevent
     adjacent person color bleed-through.
  3. Tight PPE color ranges + minimum connected blob size to reject
     background noise.
  4. Shoes only evaluated when feet are unambiguously in-frame.
  5. Optional PPE model (HuggingFace) used as confirming signal when available.

Requirements:
    ultralytics>=8.3.0
    opencv-python>=4.8.0
    torch>=2.0.0
    numpy>=1.24.0

Install:
    pip install ultralytics opencv-python torch numpy

Run:
    python3 ppe_detection.py --input your_video.mp4
    python3 ppe_detection.py --input site.mp4 --output out.mp4 --show

Arguments:
    --input         -i   input video (required)
    --output        -o   output .mp4  (default: <input>_ppe.mp4)
    --model              YOLO person tracking model  (default: yolo11m.pt)
    --ppe-model          optional PPE YOLO model     (auto if available)
    --conf               person detection confidence (default: 0.40)
    --ppe-conf           PPE model confidence        (default: 0.30)
    --device             cpu / 0 / mps               (default: auto)
    --show               display while processing
    --line-width         box thickness               (default: 2)
    --smoothing          temporal smoothing window   (default: 11)
"""

import argparse
import os
import sys
import time
import warnings
from datetime import datetime, timezone

warnings.filterwarnings("ignore")

try:
    import cv2
except ImportError:
    sys.exit("opencv-python not found.  Run: pip install opencv-python")
try:
    import numpy as np
except ImportError:
    sys.exit("numpy not found.  Run: pip install numpy")
try:
    from ultralytics import YOLO
except ImportError:
    sys.exit("ultralytics not found.  Run: pip install ultralytics")


# ════════════════════════════════════════════════════════════════════════════
# Tuneable constants
# ════════════════════════════════════════════════════════════════════════════

SMOOTH_N          = 11   # temporal smoothing window
FEET_MARGIN_PX    = 10   # feet visible only when y2 <= frame_h - this
MIN_PERSON_H      = 50   # px — skip tiny detections
MIN_VIS_RATIO     = 0.40 # fraction of bbox that must be inside frame
H_INSET_FRAC      = 0.15 # horizontal inset fraction to avoid bbox bleed
SKIN_NO_HELMET_TH = 0.18 # if skin fraction > this → no helmet
SKIN_HAIR_NO_HELM = 0.45 # if skin+hair > this → no helmet
HELMET_BLOB_TH    = 0.10 # min large-blob fraction to call helmet present
VEST_COLOR_TH     = 0.04 # min fraction for vest colour match

PPE_OK      = "OK"
PPE_MISSING = "MISSING"
PPE_UNKNOWN = "UNKNOWN"

C_GREEN  = (0, 200, 0)
C_RED    = (0, 50, 230)
C_YELLOW = (0, 210, 230)
C_WHITE  = (255, 255, 255)
C_BLACK  = (0, 0, 0)
C_DARK   = (20, 20, 20)
C_GRAY   = (140, 140, 140)

# ════════════════════════════════════════════════════════════════════════════
# Morphology kernel
# ════════════════════════════════════════════════════════════════════════════

_K3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
_K5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

# ════════════════════════════════════════════════════════════════════════════
# PPE model class-name maps (for optional PPE YOLO model)
# ════════════════════════════════════════════════════════════════════════════

PPE_MODEL_SOURCES = ["ppe.pt"]

HELMET_OK_NAMES = {
    "helmet", "hardhat", "hard_hat", "hard hat", "hard-hat",
    "safety helmet", "protective helmet",
}
HELMET_NO_NAMES = {
    "no-helmet", "no_helmet", "no helmet", "no-hardhat", "no hardhat",
    "bare head",
}
VEST_OK_NAMES = {
    "vest", "safety vest", "safety_vest", "reflective vest",
    "hi-vis", "hivis", "high-vis", "high vis", "reflective_vest",
}
VEST_NO_NAMES = {
    "no-vest", "no_vest", "no vest", "no safety vest",
}


def _classify_ppe_class(name: str):
    n = name.lower().strip()
    if n in HELMET_OK_NAMES: return "helmet_ok"
    if n in HELMET_NO_NAMES: return "helmet_no"
    if n in VEST_OK_NAMES:   return "vest_ok"
    if n in VEST_NO_NAMES:   return "vest_no"
    for kw in ("helmet", "hardhat", "hard hat"):
        if kw in n:
            return "helmet_no" if any(x in n for x in ("no ", "no-")) else "helmet_ok"
    for kw in ("vest", "hi-vis", "reflective"):
        if kw in n:
            return "vest_no" if any(x in n for x in ("no ", "no-")) else "vest_ok"
    return None


def load_ppe_model(user_path=None):
    srcs = ([user_path] if user_path else []) + PPE_MODEL_SOURCES
    for s in srcs:
        if not s or not os.path.isfile(s):
            continue
        try:
            m = YOLO(s)
            names = {int(k): str(v).lower() for k, v in m.names.items()}
            return m, names
        except Exception:
            continue
    return None, {}


# ════════════════════════════════════════════════════════════════════════════
# Geometry helpers
# ════════════════════════════════════════════════════════════════════════════

def _iou(a, b):
    ix1 = max(a[0], b[0]); iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2]); iy2 = min(a[3], b[3])
    inter = max(0, ix2-ix1) * max(0, iy2-iy1)
    if inter == 0: return 0.0
    return inter / max(1, (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter)


def _contain(inner, outer):
    ix1 = max(inner[0], outer[0]); iy1 = max(inner[1], outer[1])
    ix2 = min(inner[2], outer[2]); iy2 = min(inner[3], outer[3])
    return max(0,ix2-ix1)*max(0,iy2-iy1) / max(1,(inner[2]-inner[0])*(inner[3]-inner[1]))


def _ctr_in(small, big):
    cx = (small[0]+small[2])/2; cy = (small[1]+small[3])/2
    return big[0] <= cx <= big[2] and big[1] <= cy <= big[3]


# ════════════════════════════════════════════════════════════════════════════
# Visibility validator
# ════════════════════════════════════════════════════════════════════════════

def check_vis(bbox, fh, fw):
    x1, y1, x2, y2 = map(int, bbox)
    bw = max(1, x2-x1); bh = max(1, y2-y1)
    vis = (max(0, min(fw,x2)-max(0,x1)) *
           max(0, min(fh,y2)-max(0,y1))) / (bw * bh)
    ok    = vis >= MIN_VIS_RATIO and bh >= MIN_PERSON_H
    head  = ok and y1 >= 0 and (y1+int(bh*0.25)) <= fh and x1 >= 0 and x2 <= fw
    torso = ok
    feet  = ok and y2 <= (fh - FEET_MARGIN_PX) and x1 >= 0 and x2 <= fw
    return {"ok": ok, "head": head, "torso": torso, "feet": feet}


# ════════════════════════════════════════════════════════════════════════════
# Core PPE detector — accuracy-first HSV with negative signals
# ════════════════════════════════════════════════════════════════════════════

class PPEDetector:
    """
    Detects helmet, vest, shoes using a three-layer approach:
      Layer 1: Optional PPE YOLO model (most accurate when available)
      Layer 2: Skin/hair NEGATIVE detection for helmets (catches bare heads)
      Layer 3: Strict-crop HSV positive detection with tight ranges
    """

    # ── Vest HSV ranges — tight fluorescent colours ───────────────────────
    _VEST_RANGES = [
        (np.array([18,  70, 130]), np.array([48, 255, 255])),  # fl-yellow
        (np.array([ 7, 130, 130]), np.array([25, 255, 255])),  # fl-orange
        (np.array([35,  70, 130]), np.array([82, 255, 255])),  # fl-green / lime
        (np.array([ 5, 155,  90]), np.array([20, 255, 255])),  # bright orange
    ]

    # ── Helmet HSV ranges — tight; deliberately exclude white (catches hair) ─
    _HELMET_RANGES = [
        (np.array([18, 120, 120]), np.array([38, 255, 255])),  # yellow
        (np.array([ 8, 140, 100]), np.array([22, 255, 255])),  # orange
        (np.array([ 0, 110,  90]), np.array([10, 255, 255])),  # red lo
        (np.array([165,110,  90]), np.array([180,255, 255])),  # red hi
        (np.array([100, 100,  80]), np.array([135,255, 255])), # blue
        (np.array([ 35, 100,  80]), np.array([ 85,255, 255])),# green
        (np.array([  0,   0, 225]), np.array([180,  12, 255])),# TRUE white (very tight)
    ]

    # ── Shoe HSV ranges ───────────────────────────────────────────────────
    _SHOE_RANGES = [
        (np.array([ 0,   0,   5]), np.array([180, 255,  75])),  # black
        (np.array([ 0,   0,  30]), np.array([180,  55, 130])),  # dark gray
        (np.array([ 5,  35,  25]), np.array([ 22, 210, 165])),  # brown
        (np.array([ 0,   0, 180]), np.array([180,  40, 255])),  # white shoe
        (np.array([18,  60, 100]), np.array([ 38, 255, 255])),  # safety yellow cap
    ]

    def __init__(self, ppe_model=None, ppe_names=None, ppe_conf=0.30, device="cpu"):
        self.ppe_model  = ppe_model
        self.ppe_names  = ppe_names or {}
        self.ppe_conf   = ppe_conf
        self.device     = device
        self.has_model  = ppe_model is not None

    # ── Helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _crop(frame, x1, y1, x2, y2):
        fh, fw = frame.shape[:2]
        x1 = max(0, x1); y1 = max(0, y1)
        x2 = min(fw, x2); y2 = min(fh, y2)
        if x2 <= x1 or y2 <= y1:
            return None
        return frame[y1:y2, x1:x2]

    @staticmethod
    def _best_range_cov(roi, ranges):
        if roi is None or roi.size == 0 or roi.shape[0] < 3 or roi.shape[1] < 3:
            return 0.0
        hsv   = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        total = roi.shape[0] * roi.shape[1]
        best  = 0.0
        for lo, hi in ranges:
            m = cv2.morphologyEx(cv2.inRange(hsv, lo, hi),
                                 cv2.MORPH_CLOSE, _K3, iterations=1)
            c = np.count_nonzero(m) / total
            if c > best: best = c
        return best

    @staticmethod
    def _largest_blob_frac(roi, ranges):
        """Coverage of the LARGEST connected component of any PPE colour."""
        if roi is None or roi.size == 0 or roi.shape[0] < 3 or roi.shape[1] < 3:
            return 0.0
        hsv   = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        total = roi.shape[0] * roi.shape[1]
        best  = 0.0
        for lo, hi in ranges:
            m = cv2.morphologyEx(cv2.inRange(hsv, lo, hi),
                                 cv2.MORPH_CLOSE, _K5, iterations=2)
            m = cv2.morphologyEx(m, cv2.MORPH_OPEN,  _K3, iterations=1)
            n, _, stats, _ = cv2.connectedComponentsWithStats(m)
            if n >= 2 and len(stats) > 1:
                blob = stats[1:, cv2.CC_STAT_AREA].max() / total
                if blob > best: best = blob
        return best

    # ── Skin + hair negative signal ───────────────────────────────────────

    @staticmethod
    def _skin_hair_fractions(roi):
        """Returns (skin_frac, hair_frac) for a given BGR region."""
        if roi is None or roi.size == 0:
            return 0.0, 0.0
        hsv   = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        total = roi.shape[0] * roi.shape[1]

        # Skin: low-mid hue, moderate saturation, medium-high value
        sk1 = cv2.inRange(hsv, np.array([ 0, 15, 60]), np.array([22, 200, 255]))
        sk2 = cv2.inRange(hsv, np.array([170, 15, 60]), np.array([180, 200, 255]))
        skin = np.count_nonzero(cv2.bitwise_or(sk1, sk2)) / total

        # Gray/dark hair: very low saturation, any hue, medium value
        hair = cv2.inRange(hsv, np.array([0, 0, 40]), np.array([180, 40, 215]))
        hair_f = np.count_nonzero(hair) / total

        return skin, hair_f

    # ── PPE model helpers ─────────────────────────────────────────────────

    def _run_ppe_model(self, frame):
        if not self.has_model:
            return []
        try:
            res = self.ppe_model(frame, conf=self.ppe_conf, verbose=False, device=self.device)
            out = []
            if res and res[0].boxes is not None:
                det  = res[0].boxes
                bbs  = det.xyxy.cpu().numpy()
                cids = det.cls.cpu().numpy().astype(int)
                for i, bb in enumerate(bbs):
                    ct = _classify_ppe_class(self.ppe_names.get(cids[i], ""))
                    if ct:
                        out.append((bb, ct))
            return out
        except Exception:
            return []

    def _model_assign(self, p_bbox, ppe_items):
        """Assign model detections to a person box. Returns (helmet, vest) statuses."""
        x1, y1, x2, y2 = map(int, p_bbox)
        bh = y2 - y1
        head_box  = [x1, y1,           x2, y1 + int(bh * 0.35)]
        torso_box = [x1, y1 + int(bh*0.15), x2, y1 + int(bh * 0.78)]
        helmet = PPE_UNKNOWN
        vest   = PPE_UNKNOWN

        for bb, ct in ppe_items:
            inside = (_ctr_in(bb, p_bbox) or
                      _contain(bb, p_bbox) >= 0.28 or
                      _iou(bb, p_bbox)     >= 0.06)
            if not inside:
                continue
            if "helmet" in ct:
                h_ok = (_ctr_in(bb, head_box) or _iou(bb, head_box) >= 0.04)
                if h_ok:
                    if ct == "helmet_ok" and helmet != PPE_MISSING:
                        helmet = PPE_OK
                    elif ct == "helmet_no" and helmet != PPE_OK:
                        helmet = PPE_MISSING
            elif "vest" in ct:
                t_ok = (_ctr_in(bb, torso_box) or _iou(bb, torso_box) >= 0.04)
                if t_ok:
                    if ct == "vest_ok" and vest != PPE_MISSING:
                        vest = PPE_OK
                    elif ct == "vest_no" and vest != PPE_OK:
                        vest = PPE_MISSING

        return helmet, vest

    # ── Per-person detection ──────────────────────────────────────────────

    def detect(self, frame, bbox, vis, ppe_items=None):
        """
        Returns {"helmet": PPE_*/PPE_MISSING/PPE_UNKNOWN,
                 "vest":   ...,
                 "shoes":  ...}

        Key accuracy features:
        - Horizontal inset crop prevents adjacent-person bleed
        - Skin/hair detection as NEGATIVE signal for helmet
        - Tight colour ranges + blob-size filter
        - PPE model confirmation when available
        """
        if not vis["ok"]:
            return {"helmet": PPE_UNKNOWN, "vest": PPE_UNKNOWN, "shoes": PPE_UNKNOWN}

        x1, y1, x2, y2 = map(int, bbox)
        bw = x2 - x1
        bh = y2 - y1
        fh, fw = frame.shape[:2]

        # ── Horizontal inset — prevents adjacent person bleed ─────────────
        h_ins = max(6, int(bw * H_INSET_FRAC))
        sx1   = x1 + h_ins
        sx2   = x2 - h_ins

        # ── Get model-level detections if model is available ──────────────
        m_helmet, m_vest = PPE_UNKNOWN, PPE_UNKNOWN
        if ppe_items is not None:
            m_helmet, m_vest = self._model_assign(bbox, ppe_items)

        # ════════════════════════════════════════════════════════════════════
        # HELMET
        # ════════════════════════════════════════════════════════════════════
        if vis["head"]:
            pad     = max(4, int(bh * 0.10))
            head_h  = int(bh * 0.30)
            head_roi = self._crop(frame, sx1, y1 - pad, sx2, y1 + head_h)

            if head_roi is not None and head_roi.size > 0:
                skin_f, hair_f = self._skin_hair_fractions(head_roi)
                ppe_blob       = self._largest_blob_frac(head_roi, self._HELMET_RANGES)

                # Primary decision via skin/hair negative signal
                bare_head = (skin_f > SKIN_NO_HELMET_TH or
                             (skin_f + hair_f) > SKIN_HAIR_NO_HELM)

                if bare_head:
                    # Strong negative signal — override even model if model says OK
                    # (model can confuse fair skin with white helmet at distance)
                    hsv_helmet = PPE_MISSING
                elif ppe_blob >= HELMET_BLOB_TH:
                    hsv_helmet = PPE_OK
                else:
                    hsv_helmet = PPE_MISSING

                # Merge: PPE model is confirmatory; negative signal wins
                if m_helmet == PPE_OK and not bare_head:
                    helmet = PPE_OK
                elif m_helmet == PPE_MISSING or bare_head:
                    helmet = PPE_MISSING
                else:
                    helmet = hsv_helmet
            else:
                helmet = PPE_UNKNOWN
        else:
            helmet = PPE_UNKNOWN

        # ════════════════════════════════════════════════════════════════════
        # VEST
        # ════════════════════════════════════════════════════════════════════
        if vis["torso"]:
            t_top  = y1 + int(bh * 0.22)
            t_bot  = y1 + int(bh * 0.72)
            torso_roi = self._crop(frame, sx1, t_top, sx2, t_bot)

            if torso_roi is not None and torso_roi.size > 0:
                cov = self._best_range_cov(torso_roi, self._VEST_RANGES)
                hsv_vest = PPE_OK if cov >= VEST_COLOR_TH else PPE_MISSING

                # Model confirmation
                if m_vest == PPE_OK:
                    vest = PPE_OK
                elif m_vest == PPE_MISSING:
                    vest = PPE_MISSING
                else:
                    vest = hsv_vest
            else:
                vest = PPE_UNKNOWN
        else:
            vest = PPE_UNKNOWN

        # ════════════════════════════════════════════════════════════════════
        # SHOES — only when feet are genuinely in-frame
        # ════════════════════════════════════════════════════════════════════
        if vis["feet"]:
            f_top   = y2 - int(bh * 0.20)
            foot_roi = self._crop(frame, sx1, f_top, sx2, y2)
            if foot_roi is not None and foot_roi.size > 0:
                cov  = self._best_range_cov(foot_roi, self._SHOE_RANGES)
                shoes = PPE_OK if cov >= 0.06 else PPE_MISSING
            else:
                shoes = PPE_UNKNOWN
        else:
            shoes = PPE_UNKNOWN  # feet not visible → cannot determine

        return {"helmet": helmet, "vest": vest, "shoes": shoes}

    def evaluate_frame(self, frame, bboxes, visibilities):
        """Evaluate all persons in a frame — runs PPE model once for efficiency."""
        ppe_items = self._run_ppe_model(frame) if self.has_model else None
        return [self.detect(frame, b, v, ppe_items) for b, v in zip(bboxes, visibilities)]


# ════════════════════════════════════════════════════════════════════════════
# Per-worker temporal state
# ════════════════════════════════════════════════════════════════════════════

class WorkerState:
    def __init__(self, tid: int, window: int = SMOOTH_N):
        self.tid        = tid
        self.window     = window
        self.h_hist:list= []
        self.v_hist:list= []
        self.s_hist:list= []
        self.last_frame = 0

    def _enc(self, s):
        return True if s == PPE_OK else (False if s == PPE_MISSING else None)

    def update(self, frame_num: int, ppe: dict):
        self.last_frame = frame_num
        self.h_hist.append(self._enc(ppe["helmet"]))
        self.v_hist.append(self._enc(ppe["vest"]))
        self.s_hist.append(self._enc(ppe["shoes"]))

    def _smooth(self, hist) -> str:
        recent = [v for v in hist[-self.window:] if v is not None]
        if not recent: return PPE_UNKNOWN
        # 40% OK votes sufficient → generous to avoid false MISSING
        return PPE_OK if sum(recent) / len(recent) >= 0.40 else PPE_MISSING

    @property
    def helmet(self): return self._smooth(self.h_hist)
    @property
    def vest(self):   return self._smooth(self.v_hist)
    @property
    def shoes(self):  return self._smooth(self.s_hist)

    @property
    def is_passing(self):
        return not any(s == PPE_MISSING for s in [self.helmet, self.vest, self.shoes])

    @property
    def missing_items(self):
        m = []
        if self.helmet == PPE_MISSING: m.append("Helmet")
        if self.vest   == PPE_MISSING: m.append("Vest")
        if self.shoes  == PPE_MISSING: m.append("Shoes")
        return m


# ════════════════════════════════════════════════════════════════════════════
# Drawing
# ════════════════════════════════════════════════════════════════════════════

_FONT = cv2.FONT_HERSHEY_SIMPLEX


def _sym(s): return "Y" if s == PPE_OK else ("N" if s == PPE_MISSING else "?")
def _sc(s):  return C_GREEN if s == PPE_OK else (C_RED if s == PPE_MISSING else C_YELLOW)


def draw_person(frame, bbox, w: WorkerState, lw: int = 2):
    x1, y1, x2, y2 = map(int, bbox)
    fh, fw = frame.shape[:2]
    passing = w.is_passing
    bc      = C_GREEN if passing else C_RED

    cv2.rectangle(frame, (x1, y1), (x2, y2), bc, lw)

    # PPE badges — right side of box
    ix = min(x2 + 3, fw - 35)
    for k, (lbl, stat) in enumerate([("H", w.helmet), ("V", w.vest), ("S", w.shoes)]):
        iy = y1 + k * 20
        if iy + 18 > fh: break
        cv2.rectangle(frame, (ix, iy), (ix + 32, iy + 18), _sc(stat), -1)
        cv2.putText(frame, f"{lbl}:{_sym(stat)}", (ix + 2, iy + 13),
                    _FONT, 0.35, C_WHITE, 1, cv2.LINE_AA)

    # Top label bar
    tag   = "PASS" if passing else "FAIL"
    label = f"#{w.tid} {tag}"
    (tw, th), _ = cv2.getTextSize(label, _FONT, 0.42, 1)
    ly = max(0, y1 - th - 8)
    cv2.rectangle(frame, (x1, ly), (x1 + tw + 8, y1), bc, -1)
    cv2.putText(frame, label, (x1 + 4, y1 - 4),
                _FONT, 0.42, C_BLACK if passing else C_WHITE, 1, cv2.LINE_AA)

    # Missing PPE strip below box
    if not passing and w.missing_items:
        miss = "! " + " | ".join(w.missing_items)
        (mw, mh), _ = cv2.getTextSize(miss, _FONT, 0.33, 1)
        my = min(y2 + mh + 5, fh - 2)
        cv2.rectangle(frame, (x1, y2 + 2), (x1 + mw + 6, my + 3), C_RED, -1)
        cv2.putText(frame, miss, (x1 + 3, my), _FONT, 0.33, C_WHITE, 1, cv2.LINE_AA)


def draw_hud(frame, workers: dict, frame_num: int, total: int, fps: float):
    fh, fw  = frame.shape[:2]
    active  = list(workers.values())
    failing = sum(1 for w in active if not w.is_passing)
    passing = len(active) - failing

    dw, dh = 192, 118
    m = 6
    x1, y1 = fw - dw - m, m
    x2, y2 = fw - m, y1 + dh

    ov = frame.copy()
    cv2.rectangle(ov, (x1, y1), (x2, y2), C_DARK, -1)
    cv2.addWeighted(ov, 0.82, frame, 0.18, 0, frame)
    cv2.rectangle(frame, (x1, y1), (x2, y2), (70, 70, 70), 1)

    y = y1 + 18
    for text, color, fs, bold in [
        ("PPE MONITOR",          C_WHITE, 0.38, True),
        (f"Workers:  {len(active)}", C_GRAY, 0.31, False),
        (f"Pass:     {passing}",  C_GREEN, 0.31, False),
        (f"Fail:     {failing}",  C_RED if failing else C_GREEN, 0.31, False),
        (f"FPS:      {fps:.1f}", C_GRAY,  0.31, False),
    ]:
        cv2.putText(frame, text, (x1 + 7, y), _FONT, fs, color,
                    2 if bold else 1, cv2.LINE_AA)
        y += 18

    if total > 0:
        cv2.putText(frame, f"{frame_num}/{total}",
                    (x1 + 7, y2 - 4), _FONT, 0.24, (100, 100, 100), 1, cv2.LINE_AA)

    if failing > 0:
        bh_b  = 26
        flash = int(time.time() * 2.5) % 2 == 0
        ov2   = frame.copy()
        cv2.rectangle(ov2, (0, fh - bh_b), (fw, fh),
                      (0, 0, 190) if flash else (0, 0, 100), -1)
        cv2.addWeighted(ov2, 0.75, frame, 0.25, 0, frame)
        msg = f"  PPE VIOLATION — {failing} WORKER(S) NON-COMPLIANT  "
        (tw, th2), _ = cv2.getTextSize(msg, _FONT, 0.44, 1)
        cv2.putText(frame, msg, ((fw - tw) // 2, fh - bh_b // 2 + th2 // 2),
                    _FONT, 0.44, C_WHITE, 1, cv2.LINE_AA)


# ════════════════════════════════════════════════════════════════════════════
# Utilities
# ════════════════════════════════════════════════════════════════════════════

def auto_device():
    try:
        import torch
        if torch.cuda.is_available(): return "0"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available(): return "mps"
    except Exception: pass
    return "cpu"


def build_out(inp, out):
    if out:
        return os.path.abspath(out if out.lower().endswith(".mp4") else out + ".mp4")
    base = os.path.splitext(os.path.basename(inp))[0]
    return os.path.abspath(
        os.path.join(os.path.dirname(os.path.abspath(inp)), base + "_ppe.mp4"))


def open_video(path):
    if not os.path.isfile(path): raise RuntimeError(f"Input not found: {path}")
    cap = cv2.VideoCapture(path)
    if not cap.isOpened(): raise RuntimeError(f"Cannot open: {path}")
    return cap


def create_writer(path, fps, w, h):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    width = int(w)
    height = int(h)
    safe_fps = float(fps) if fps and fps > 0 else 30.0
    if width <= 0 or height <= 0:
        raise RuntimeError(f"Invalid video dimensions for output writer: width={width}, height={height}")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    wr = cv2.VideoWriter(path, fourcc, safe_fps, (width, height))
    if not wr.isOpened():
        wr.release()
        raise RuntimeError(f"VideoWriter failed to open for {path}")
    return wr


def _status_vote_bucket(status: str) -> str:
    if status == PPE_OK:
        return "ok"
    if status == PPE_MISSING:
        return "missing"
    return "unknown"


def _summarize_votes(votes: dict[str, int], last_status: str) -> bool | None:
    if votes["ok"] == 0 and votes["missing"] == 0:
        return None
    if votes["ok"] > votes["missing"]:
        return True
    if votes["missing"] > votes["ok"]:
        return False
    if last_status == PPE_OK:
        return True
    if last_status == PPE_MISSING:
        return False
    return None


def _build_violation_type(helmet_worn: bool | None, vest_worn: bool | None, shoes_worn: bool | None) -> str | None:
    missing = []
    if helmet_worn is False:
        missing.append("helmet_missing")
    if vest_worn is False:
        missing.append("vest_missing")
    if shoes_worn is False:
        missing.append("shoes_missing")
    return "+".join(missing) if missing else None


# ════════════════════════════════════════════════════════════════════════════
# CLI
# ════════════════════════════════════════════════════════════════════════════

def parse_args():
    p = argparse.ArgumentParser(
        description="PPE Detection — Helmet / Vest / Shoes (accuracy-first v3)",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input",  "-i", required=True)
    p.add_argument("--output", "-o", default=None)
    p.add_argument("--model",        default="yolov8n.pt",
                   help="YOLO person tracking model (default: yolov8n.pt)")
    p.add_argument("--ppe-model",    default=None,
                   help="Optional PPE YOLO model (auto-download if not set)")
    p.add_argument("--conf",         type=float, default=0.40)
    p.add_argument("--ppe-conf",     type=float, default=0.30)
    p.add_argument("--device",       default=None)
    p.add_argument("--show",         action="store_true")
    p.add_argument("--line-width",   type=int, default=2)
    p.add_argument("--smoothing",    type=int, default=SMOOTH_N)
    return p.parse_args()


# ════════════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════════════

def process_video(
    *,
    input_path: str,
    output_path: str | None = None,
    model_path: str = "yolov8n.pt",
    ppe_model_path: str | None = None,
    conf: float = 0.40,
    ppe_conf: float = 0.30,
    device: str | None = None,
    show: bool = False,
    line_width: int = 2,
    smoothing: int = SMOOTH_N,
    **kwargs,
) -> dict:
    device  = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p   = build_out(input_p, output_path)

    try:
        person_model = YOLO(model_path)
    except Exception as e:
        raise RuntimeError(f"Failed to load person model '{model_path}': {e}") from e

    ppe_model, ppe_names = load_ppe_model(ppe_model_path)
    detector = PPEDetector(ppe_model, ppe_names, ppe_conf, device)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

    workers   = {}
    all_worker_ids: set[int] = set()  # track every unique worker ever seen
    person_stats: dict[int, dict] = {}
    timeout   = int(sfps * 3.0)
    frame_num = 0
    fail_rd   = 0
    t0        = time.time()
    fps_live  = 0.0
    # Compliance tracking: snapshot each frame
    frame_pass_counts: list[tuple[int, int]] = []  # (passing, total) per sampled frame

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                fail_rd += 1
                if fail_rd > 15: break
                continue
            fail_rd   = 0
            frame_num += 1

            try:
                res = person_model.track(
                    source=frame, classes=[0], conf=conf,
                    iou=0.70, device=device, persist=True, verbose=False)
            except Exception:
                writer.write(frame)
                continue

            boxes, tids, confs = [], [], []
            if res and res[0].boxes is not None:
                det = res[0].boxes
                if det.xyxy is not None and len(det.xyxy) > 0:
                    boxes = det.xyxy.cpu().numpy()
                    tids  = (det.id.cpu().numpy().astype(int).tolist()
                             if det.id is not None else list(range(len(boxes))))
                    confs = (det.conf.cpu().numpy().tolist()
                             if det.conf is not None else [1.0] * len(boxes))

            vis_list = [check_vis(b, fh, fw) for b in boxes]
            ppe_list = detector.evaluate_frame(frame, boxes, vis_list)

            for i, (bbox, vis) in enumerate(zip(boxes, vis_list)):
                if not vis["ok"]: continue
                tid = tids[i] if i < len(tids) else i
                conf = float(confs[i]) if i < len(confs) else 1.0
                all_worker_ids.add(tid)
                if tid not in workers:
                    workers[tid] = WorkerState(tid, smoothing)
                workers[tid].update(frame_num, ppe_list[i])
                draw_person(frame, bbox, workers[tid], line_width)

                if tid not in person_stats:
                    person_stats[tid] = {
                        "person_id": str(tid),
                        "first_seen_frame": frame_num,
                        "last_seen_frame": frame_num,
                        "observations": 0,
                        "confidence_sum": 0.0,
                        "confidence_max": 0.0,
                        "helmet_votes": {"ok": 0, "missing": 0, "unknown": 0},
                        "vest_votes": {"ok": 0, "missing": 0, "unknown": 0},
                        "shoes_votes": {"ok": 0, "missing": 0, "unknown": 0},
                        "last_helmet": PPE_UNKNOWN,
                        "last_vest": PPE_UNKNOWN,
                        "last_shoes": PPE_UNKNOWN,
                    }

                stats = person_stats[tid]
                stats["last_seen_frame"] = frame_num
                stats["observations"] += 1
                stats["confidence_sum"] += conf
                stats["confidence_max"] = max(stats["confidence_max"], conf)
                stats["last_helmet"] = workers[tid].helmet
                stats["last_vest"] = workers[tid].vest
                stats["last_shoes"] = workers[tid].shoes
                stats["helmet_votes"][_status_vote_bucket(workers[tid].helmet)] += 1
                stats["vest_votes"][_status_vote_bucket(workers[tid].vest)] += 1
                stats["shoes_votes"][_status_vote_bucket(workers[tid].shoes)] += 1

            # Prune stale workers
            for tid in [t for t, w in workers.items()
                        if frame_num - w.last_frame > timeout]:
                del workers[tid]

            active   = {t: w for t, w in workers.items()
                        if frame_num - w.last_frame <= timeout}
            fps_live = frame_num / max(1e-6, time.time() - t0)

            # Sample compliance every 10 frames to avoid overhead
            if frame_num % 10 == 0 and active:
                n_pass = sum(1 for w in active.values() if w.is_passing)
                frame_pass_counts.append((n_pass, len(active)))

            draw_hud(frame, active, frame_num, total, fps_live)
            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("PPE Detection", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"): break

    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    if not os.path.isfile(out_p):
        raise RuntimeError(f"Output missing: {out_p}")
    print("Output:", out_p)
    print("Size:", os.path.getsize(out_p))
    if os.path.getsize(out_p) <= 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

    processing_time_sec = round(time.time() - t0, 2)
    duration_sec = round(frame_num / sfps, 2) if sfps else None

    person_summaries = []
    for tid, stats in sorted(person_stats.items(), key=lambda item: int(item[0])):
        helmet_worn = _summarize_votes(stats["helmet_votes"], stats["last_helmet"])
        vest_worn = _summarize_votes(stats["vest_votes"], stats["last_vest"])
        shoes_worn = _summarize_votes(stats["shoes_votes"], stats["last_shoes"])
        violation_type = _build_violation_type(helmet_worn, vest_worn, shoes_worn)

        if violation_type:
            person_status = "violation"
        elif any(value is True for value in (helmet_worn, vest_worn, shoes_worn)):
            person_status = "compliant"
        else:
            person_status = "unknown"

        person_summaries.append(
            {
                "person_id": stats["person_id"],
                "helmet_worn": helmet_worn,
                "vest_worn": vest_worn,
                "shoes_worn": shoes_worn,
                "violation_type": violation_type,
                "confidence_score": round(stats["confidence_sum"] / max(1, stats["observations"]), 4),
                "status": person_status,
                "first_seen_frame": stats["first_seen_frame"],
                "last_seen_frame": stats["last_seen_frame"],
                "first_seen_sec": round(stats["first_seen_frame"] / sfps, 2) if sfps else None,
                "last_seen_sec": round(stats["last_seen_frame"] / sfps, 2) if sfps else None,
                "notes": "person_id is the tracker ID within this video only; it is not a persistent identity across videos.",
                "metadata": {
                    "observations": stats["observations"],
                    "max_confidence": round(stats["confidence_max"], 4),
                    "helmet_votes": stats["helmet_votes"],
                    "vest_votes": stats["vest_votes"],
                    "shoes_votes": stats["shoes_votes"],
                },
            }
        )

    # ── Compute final metrics ─────────────────────────────────────────────
    total_workers_seen = len(all_worker_ids)
    total_violations = sum(1 for summary in person_summaries if summary["status"] == "violation")
    # Average compliance rate from sampled frames
    if frame_pass_counts:
        rates = [p / t * 100.0 for p, t in frame_pass_counts if t > 0]
        avg_compliance = round(sum(rates) / len(rates), 1) if rates else 0.0
    else:
        avg_compliance = 100.0 if total_workers_seen == 0 else 0.0

    return {
        "output_video": out_p,
        "metrics": {
            "total_workers": total_workers_seen,
            "total_violations": total_violations,
            "frames_analyzed": frame_num,
            "avg_compliance_rate": avg_compliance,
            "processing_time_sec": processing_time_sec,
            "video_duration_sec": duration_sec,
            "person_rows_generated": len(person_summaries),
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(sfps), 2) if sfps else None,
                "duration_sec": duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "person_summaries": person_summaries,
        },
    }


def main():
    args = parse_args()
    try:
        process_video(
            input_path=args.input,
            output_path=args.output,
            model_path=args.model,
            ppe_model_path=args.ppe_model,
            conf=args.conf,
            ppe_conf=args.ppe_conf,
            device=args.device,
            show=args.show,
            line_width=args.line_width,
            smoothing=args.smoothing,
        )
    except Exception as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
