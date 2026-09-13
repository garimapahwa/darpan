import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import { toBlendshapeMap, type BlendshapeMap } from "../lib/blendshapes";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const TARGET_FPS = 20;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

interface UseFaceLandmarkerResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  ready: boolean;
  error: string | null;
  blendshapes: BlendshapeMap | null;
}

export function useFaceLandmarker(enabled: boolean): UseFaceLandmarkerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blendshapes, setBlendshapes] = useState<BlendshapeMap | null>(null);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setReady(true);
        loop();
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - lastFrameTimeRef.current < FRAME_INTERVAL_MS) return;
      lastFrameTimeRef.current = now;

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      const result = landmarker.detectForVideo(video, now);
      const categories = result.faceBlendshapes?.[0]?.categories;
      setBlendshapes(categories ? toBlendshapeMap(categories) : null);
    }

    setup();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  return { videoRef, ready, error, blendshapes };
}
