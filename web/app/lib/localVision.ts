import {
  FaceDetector,
  FilesetResolver,
  ImageEmbedder,
  ObjectDetector,
  type BoundingBox,
  type ImageEmbedderResult,
} from "@mediapipe/tasks-vision";

export type LocalVisualSubject = {
  descriptor: number[];
  score: number;
  source: "face" | "person" | "portrait";
};

export type LocalVisualResult = {
  sceneDescriptor: number[];
  selfieScore: number;
  subjects: LocalVisualSubject[];
};

export type LocalVisualAnalyzer = {
  analyze: (file: File) => Promise<LocalVisualResult>;
  close: () => void;
};

type VisualCandidate = {
  box: BoundingBox;
  score: number;
  source: "face" | "person";
};

const INPUT_WIDTH = 720;
const MAX_SUBJECTS = 8;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function paddedBox(
  box: BoundingBox,
  width: number,
  height: number,
  source: VisualCandidate["source"],
) {
  const paddingX = box.width * (source === "face" ? 0.42 : 0.08);
  const paddingTop = box.height * (source === "face" ? 0.48 : 0.08);
  const paddingBottom = box.height * (source === "face" ? 0.7 : 0.08);
  const left = clamp(box.originX - paddingX, 0, width);
  const top = clamp(box.originY - paddingTop, 0, height);
  const right = clamp(box.originX + box.width + paddingX, 0, width);
  const bottom = clamp(box.originY + box.height + paddingBottom, 0, height);
  return {
    bottom: bottom / height,
    left: left / width,
    right: right / width,
    top: top / height,
  };
}

function embeddingVector(result: ImageEmbedderResult): number[] {
  const embedding = result.embeddings[0];
  if (embedding?.floatEmbedding?.length) {
    return embedding.floatEmbedding;
  }
  if (embedding?.quantizedEmbedding?.length) {
    return Array.from(embedding.quantizedEmbedding, (value) => (value - 128) / 128);
  }
  return [];
}

function detectionCandidates(
  detections: ReturnType<FaceDetector["detect"]>["detections"],
  source: VisualCandidate["source"],
): VisualCandidate[] {
  return detections
    .filter((detection) => detection.boundingBox)
    .sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))
    .slice(0, MAX_SUBJECTS)
    .flatMap((detection): VisualCandidate[] => detection.boundingBox
      ? [{
        box: detection.boundingBox,
        score: detection.categories[0]?.score ?? 0,
        source,
      }]
      : []);
}

function faceCenterIsInsidePerson(
  face: VisualCandidate,
  person: VisualCandidate,
): boolean {
  const centerX = face.box.originX + face.box.width / 2;
  const centerY = face.box.originY + face.box.height / 2;
  return centerX >= person.box.originX
    && centerX <= person.box.originX + person.box.width
    && centerY >= person.box.originY
    && centerY <= person.box.originY + person.box.height;
}

function mergeCandidates(
  faces: VisualCandidate[],
  people: VisualCandidate[],
): VisualCandidate[] {
  const peopleWithoutDetectedFaces = people.filter(
    (person) => !faces.some((face) => faceCenterIsInsidePerson(face, person)),
  );
  return [...faces, ...peopleWithoutDetectedFaces]
    .sort((left, right) => {
      if (left.source !== right.source) return left.source === "face" ? -1 : 1;
      return right.score - left.score;
    })
    .slice(0, MAX_SUBJECTS);
}

function candidateFramingScore(
  candidate: VisualCandidate,
  width: number,
  height: number,
): number {
  const centerX = (candidate.box.originX + candidate.box.width / 2) / width;
  const centerY = (candidate.box.originY + candidate.box.height / 2) / height;
  const centerDistance = Math.sqrt((centerX - 0.5) ** 2 + (centerY - 0.48) ** 2);
  const centerScore = 1 - clamp(centerDistance / 0.65, 0, 1);
  const area = (candidate.box.width * candidate.box.height) / (width * height);
  const sizeMultiplier = candidate.source === "face" ? 3.2 : 1.55;
  const sizeScore = clamp(Math.sqrt(area) * sizeMultiplier, 0, 1);
  return sizeScore * 0.55 + centerScore * 0.25 + candidate.score * 0.2;
}

function selfieScore(
  faceCandidates: VisualCandidate[],
  personCandidates: VisualCandidate[],
  width: number,
  height: number,
): number {
  const candidates = faceCandidates.length ? faceCandidates : personCandidates;
  if (!candidates.length) return 0;
  const bestFraming = Math.max(
    ...candidates.map((candidate) => candidateFramingScore(candidate, width, height)),
  );
  const countBonus = candidates.length === 2
    ? 0.16
    : candidates.length === 1
      ? 0.1
      : candidates.length <= 4
        ? 0.04
        : -0.08;
  const faceBonus = faceCandidates.length ? 0.08 : 0;
  return Number(clamp(bestFraming + countBonus + faceBonus, 0, 1).toFixed(4));
}

export async function createLocalVisualAnalyzer(): Promise<LocalVisualAnalyzer> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const [faceDetector, personDetector, imageEmbedder] = await Promise.all([
    FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/models/blaze_face_short_range.tflite",
      },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.18,
      minSuppressionThreshold: 0.3,
    }),
    ObjectDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/models/efficientdet_lite0_uint8.tflite",
      },
      categoryAllowlist: ["person"],
      maxResults: MAX_SUBJECTS,
      runningMode: "IMAGE",
      scoreThreshold: 0.08,
    }),
    ImageEmbedder.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/models/mobilenet_v3_small.tflite",
      },
      runningMode: "IMAGE",
    }),
  ]);

  return {
    async analyze(file) {
      const bitmap = await createImageBitmap(file, {
        resizeWidth: INPUT_WIDTH,
        resizeQuality: "medium",
      });

      try {
        const personCandidates = detectionCandidates(
          personDetector.detect(bitmap).detections,
          "person",
        );
        const faceCandidates = detectionCandidates(
          faceDetector.detect(bitmap).detections,
          "face",
        );
        const candidates = mergeCandidates(faceCandidates, personCandidates);
        const sceneDescriptor = embeddingVector(imageEmbedder.embed(bitmap));
        let subjects = candidates.flatMap((candidate): LocalVisualSubject[] => {
          if (candidate.box.width < 18 || candidate.box.height < 18) return [];
          const descriptor = embeddingVector(imageEmbedder.embed(bitmap, {
            regionOfInterest: paddedBox(
              candidate.box,
              bitmap.width,
              bitmap.height,
              candidate.source,
            ),
          }));
          return descriptor.length
            ? [{
              descriptor,
              score: candidate.score,
              source: candidate.source,
            }]
            : [];
        });
        if (!subjects.length) {
          const portraitDescriptor = embeddingVector(imageEmbedder.embed(bitmap, {
            regionOfInterest: {
              bottom: 0.96,
              left: 0.16,
              right: 0.84,
              top: 0.04,
            },
          }));
          if (portraitDescriptor.length) {
            subjects = [{
              descriptor: portraitDescriptor,
              score: 0,
              source: "portrait",
            }];
          }
        }

        return {
          sceneDescriptor,
          selfieScore: selfieScore(
            faceCandidates,
            personCandidates,
            bitmap.width,
            bitmap.height,
          ),
          subjects,
        };
      } finally {
        bitmap.close();
      }
    },
    close() {
      faceDetector.close();
      personDetector.close();
      imageEmbedder.close();
    },
  };
}
