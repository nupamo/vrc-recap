import {
  FaceDetector,
  FilesetResolver,
  type BoundingBox,
} from "@mediapipe/tasks-vision";

export type LocalFaceSample = {
  descriptor: number[];
  mirroredDescriptor: number[];
  score: number;
};

export type LocalFaceResult = {
  faces: LocalFaceSample[];
};

export type LocalFaceDetector = {
  analyze: (file: File) => Promise<LocalFaceResult>;
  close: () => void;
};

const DESCRIPTOR_WIDTH = 8;
const DESCRIPTOR_HEIGHT = 8;
const INPUT_WIDTH = 720;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function paddedBox(box: BoundingBox, width: number, height: number) {
  const paddingX = box.width * 0.2;
  const paddingY = box.height * 0.24;
  const left = clamp(box.originX - paddingX, 0, width);
  const top = clamp(box.originY - paddingY, 0, height);
  const right = clamp(box.originX + box.width + paddingX, 0, width);
  const bottom = clamp(box.originY + box.height + paddingY, 0, height);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function buildDescriptor(
  context: CanvasRenderingContext2D,
): { descriptor: number[]; mirroredDescriptor: number[] } {
  const data = context.getImageData(0, 0, DESCRIPTOR_WIDTH, DESCRIPTOR_HEIGHT).data;
  const descriptor: number[] = [];
  const mirroredDescriptor: number[] = [];

  const sample = (x: number, y: number): number[] => {
    const offset = (y * DESCRIPTOR_WIDTH + x) * 4;
    const red = data[offset] / 255;
    const green = data[offset + 1] / 255;
    const blue = data[offset + 2] / 255;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    return [
      Number(luminance.toFixed(3)),
      Number((red - green).toFixed(3)),
      Number((blue - green).toFixed(3)),
    ];
  };

  for (let y = 0; y < DESCRIPTOR_HEIGHT; y += 1) {
    for (let x = 0; x < DESCRIPTOR_WIDTH; x += 1) {
      descriptor.push(...sample(x, y));
      mirroredDescriptor.push(...sample(DESCRIPTOR_WIDTH - x - 1, y));
    }
  }
  return { descriptor, mirroredDescriptor };
}

export async function createLocalFaceDetector(): Promise<LocalFaceDetector> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const detector = await FaceDetector.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "/models/blaze_face_short_range.tflite",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.42,
    minSuppressionThreshold: 0.3,
  });

  return {
    async analyze(file) {
      const bitmap = await createImageBitmap(file, {
        resizeWidth: INPUT_WIDTH,
        resizeQuality: "medium",
      });
      const canvas = document.createElement("canvas");
      canvas.width = DESCRIPTOR_WIDTH;
      canvas.height = DESCRIPTOR_HEIGHT;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        bitmap.close();
        throw new Error("Unable to prepare the image.");
      }

      try {
        const detections = detector.detect(bitmap).detections
          .filter((detection) => detection.boundingBox)
          .sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))
          .slice(0, 12);

        const faces = detections.flatMap((detection): LocalFaceSample[] => {
          const box = detection.boundingBox;
          if (!box || box.width < 18 || box.height < 18) return [];
          const crop = paddedBox(box, bitmap.width, bitmap.height);
          context.clearRect(0, 0, DESCRIPTOR_WIDTH, DESCRIPTOR_HEIGHT);
          context.drawImage(
            bitmap,
            crop.left,
            crop.top,
            crop.width,
            crop.height,
            0,
            0,
            DESCRIPTOR_WIDTH,
            DESCRIPTOR_HEIGHT,
          );
          return [{
            ...buildDescriptor(context),
            score: detection.categories[0]?.score ?? 0,
          }];
        });
        return { faces };
      } finally {
        bitmap.close();
      }
    },
    close() {
      detector.close();
    },
  };
}
