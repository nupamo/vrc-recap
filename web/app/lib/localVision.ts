import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

export type LocalVisionResult = {
  avatarCount: number;
  highestScore: number;
};

export type LocalAvatarDetector = {
  analyze: (file: File) => Promise<LocalVisionResult>;
  close: () => void;
};

export const LOCAL_VISION_MODEL = "EfficientDet Lite0";

const AVATAR_LIKE_CATEGORIES = new Set([
  "person",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "bear",
  "teddy bear",
]);

/**
 * Loads MediaPipe and EfficientDet from same-origin static assets. Inference is
 * performed synchronously inside the browser; the selected image is never sent
 * to a server and no biometric template is created or retained.
 */
export async function createLocalAvatarDetector(): Promise<LocalAvatarDetector> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const detector = await ObjectDetector.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "/models/efficientdet_lite0_uint8.tflite",
    },
    maxResults: 16,
    runningMode: "IMAGE",
    scoreThreshold: 0.28,
  });

  return {
    async analyze(file) {
      const bitmap = await createImageBitmap(file, {
        resizeWidth: 640,
        resizeQuality: "medium",
      });
      try {
        const detections = detector.detect(bitmap).detections.filter((detection) => {
          const category = detection.categories[0];
          return category && AVATAR_LIKE_CATEGORIES.has(category.categoryName.toLocaleLowerCase("en-US"));
        });
        return {
          avatarCount: detections.length,
          highestScore: detections.reduce(
            (highest, detection) => Math.max(highest, detection.categories[0]?.score ?? 0),
            0,
          ),
        };
      } finally {
        bitmap.close();
      }
    },
    close() {
      detector.close();
    },
  };
}
