import assert from "node:assert/strict";
import test from "node:test";
import {
  inferMetadataPeople,
  inferRecurringFaces,
  inferRecurringScenes,
  inferTemporalScenes,
  selectSceneResults,
  summarizeRecapPeriods,
} from "../.test-dist/recapInference.js";

function photo(id, day, participants, selfieScore = 0) {
  return {
    date: new Date(`${day}T12:00:00Z`),
    id,
    participants,
    selfieScore,
  };
}

const self = { key: "usr_self", name: "MyNickname" };
const special = { key: "usr_special", name: "SomeoneSpecial" };
const friend = { key: "usr_friend", name: "AnotherFriend" };

test("the nickname appearing in the most photos is inferred as self", () => {
  const result = inferMetadataPeople([
    photo("1", "2025-01-01", [self, special]),
    photo("2", "2025-01-02", [self, special]),
    photo("3", "2025-01-03", [self, friend]),
    photo("4", "2025-01-04", [self]),
  ]);

  assert.equal(result.self?.key, self.key);
  assert.equal(result.self?.name, self.name);
  assert.equal(result.self?.photoCount, 4);
});

test("only exact two-person photos count toward the special relationship", () => {
  const result = inferMetadataPeople([
    photo("pair-1", "2025-01-01", [self, special], 0.2),
    photo("pair-1-selfie", "2025-01-01", [self, special], 0.9),
    photo("pair-2", "2025-01-02", [special, self]),
    photo("group", "2025-01-03", [self, special, friend]),
    photo("friend-pair", "2025-01-04", [self, friend]),
    photo("special-without-self", "2025-01-05", [special, friend]),
  ]);

  assert.equal(result.special?.key, special.key);
  assert.deepEqual(result.special?.pairDayPhotoIds, ["pair-1", "pair-2"]);
  assert.equal(
    result.people.find((person) => person.key === friend.key)?.pairDayPhotoIds.length,
    1,
  );
});

test("recurring faces infer self and the strongest two-face pairing without metadata", () => {
  const faceSelf = {
    days: new Set(["2025-01-01", "2025-01-02", "2025-01-03"]),
    id: "face-self",
    photoIds: new Set(["a", "a-selfie", "b", "c", "d"]),
  };
  const faceSpecial = {
    days: new Set(["2025-01-01", "2025-01-02"]),
    id: "face-special",
    photoIds: new Set(["a", "a-selfie", "b", "x"]),
  };
  const faceOther = {
    days: new Set(["2025-01-03", "2025-01-04"]),
    id: "face-other",
    photoIds: new Set(["c", "y"]),
  };
  const noise = {
    days: new Set(["2025-01-04"]),
    id: "face-noise",
    photoIds: new Set(["z"]),
  };
  const result = inferRecurringFaces(
    [faceSelf, faceSpecial, faceOther, noise],
    [
      { date: new Date("2025-01-01"), faceClusterIds: ["face-self", "face-special"], id: "a", selfieScore: 0.25 },
      { date: new Date("2025-01-01T18:00:00"), faceClusterIds: ["face-self", "face-special"], id: "a-selfie", selfieScore: 0.92 },
      { date: new Date("2025-01-02"), faceClusterIds: ["face-special", "face-self"], id: "b" },
      { date: new Date("2025-01-03"), faceClusterIds: ["face-self", "face-other"], id: "c" },
      { date: new Date("2025-01-04"), faceClusterIds: ["face-self", "face-special", "face-other"], id: "group" },
    ],
    false,
  );

  assert.equal(result.recurringFaceCount, 3);
  assert.equal(result.selfFaceId, "face-self");
  assert.equal(result.specialFaceId, "face-special");
  assert.deepEqual(result.specialPhotoIds, ["a", "b"]);
  assert.deepEqual(
    result.visualPeople.map((person) => person.id),
    ["face-special", "face-other"],
  );
  assert.deepEqual(result.visualPeople[0].pairDayPhotoIds, ["a", "b"]);
});

test("face identities do not replace an available metadata identity", () => {
  const result = inferRecurringFaces(
    [{
      days: new Set(["2025-01-01", "2025-01-02"]),
      id: "face-self",
      photoIds: new Set(["a", "b"]),
    }],
    [],
    true,
  );

  assert.equal(result.recurringFaceCount, 1);
  assert.equal(result.selfFaceId, undefined);
  assert.equal(result.specialFaceId, undefined);
  assert.deepEqual(result.visualPeople, []);
});

test("same-day scene bursts are excluded and recurring scenes require multiple days", () => {
  const result = inferRecurringScenes([
    {
      days: new Set(["2025-01-01"]),
      id: "burst",
      photoIds: new Set(["a", "b", "c"]),
    },
    {
      days: new Set(["2025-01-01", "2025-02-01", "2025-03-01"]),
      id: "returning-place",
      photoIds: new Set(["d", "e", "f"]),
    },
    {
      days: new Set(["2025-04-01"]),
      id: "single",
      photoIds: new Set(["g"]),
    },
  ]);

  assert.deepEqual(result.map((scene) => scene.id), ["returning-place"]);
  assert.equal(result[0].activeDays, 3);
});

test("metadata-free photos always form meaningful month chapters when scenes do not repeat", () => {
  const result = inferTemporalScenes([
    { date: new Date("2026-01-01T12:00:00"), id: "jan-a" },
    { date: new Date("2026-01-02T12:00:00"), id: "jan-b" },
    { date: new Date("2026-01-02T18:00:00"), id: "jan-burst" },
    { date: new Date("2026-02-03T12:00:00"), id: "feb-a" },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "period-2026-01");
  assert.equal(result[0].activeDays, 2);
  assert.deepEqual(result[0].photoIds, ["jan-a", "jan-b", "jan-burst"]);
  assert.equal(result[1].month, 2);
});

test("the busiest photo time is calculated as an exact local hour", () => {
  const result = summarizeRecapPeriods([
    { date: new Date(2026, 2, 1, 22, 5) },
    { date: new Date(2026, 2, 1, 23, 10) },
    { date: new Date(2026, 2, 2, 23, 45) },
    { date: new Date(2026, 2, 3, 1, 0) },
  ]);

  assert.equal(result.topHour, 23);
});

test("recaps shorter than 180 days use a top day, then switch to a top month", () => {
  const start = new Date(2025, 0, 1, 12);
  const afterDays = (days) => {
    const date = new Date(start);
    date.setDate(date.getDate() + days);
    return date;
  };

  const shortRecap = summarizeRecapPeriods([
    { date: start },
    { date: afterDays(179) },
  ]);
  const longRecap = summarizeRecapPeriods([
    { date: start },
    { date: afterDays(180) },
  ]);

  assert.equal(shortRecap.spanDays, 179);
  assert.equal(shortRecap.topPeriod, "day");
  assert.equal(longRecap.spanDays, 180);
  assert.equal(longRecap.topPeriod, "month");
});

test("scene results fall back from metadata to visual matches to month chapters", () => {
  const temporal = [{ id: "january" }];
  assert.deepEqual(selectSceneResults([], [], temporal), temporal);
  assert.deepEqual(
    selectSceneResults([], [{ id: "visual" }], temporal),
    [{ id: "visual" }],
  );
  assert.deepEqual(
    selectSceneResults([{ id: "metadata" }], [{ id: "visual" }], temporal),
    [{ id: "metadata" }],
  );
});

test("same-day two-person bursts cannot become the special relationship", () => {
  const result = inferRecurringFaces(
    [
      {
        days: new Set(["2025-01-01", "2025-01-02"]),
        id: "self",
        photoIds: new Set(["a", "b", "c"]),
      },
      {
        days: new Set(["2025-01-01", "2025-01-02"]),
        id: "candidate",
        photoIds: new Set(["a", "b", "elsewhere"]),
      },
    ],
    [
      { date: new Date("2025-01-01T10:00:00"), faceClusterIds: ["self", "candidate"], id: "a" },
      { date: new Date("2025-01-01T11:00:00"), faceClusterIds: ["self", "candidate"], id: "b" },
      { date: new Date("2025-01-02T10:00:00"), faceClusterIds: ["self"], id: "c" },
      { date: new Date("2025-01-02T11:00:00"), faceClusterIds: ["candidate"], id: "elsewhere" },
    ],
    false,
  );

  assert.equal(result.specialFaceId, undefined);
  assert.deepEqual(result.specialPhotoIds, []);
  assert.deepEqual(result.visualPeople[0].pairDayPhotoIds, ["a"]);
});

test("a photo with a third detected subject is never used as a two-person memory", () => {
  const result = inferRecurringFaces(
    [
      {
        days: new Set(["2025-01-01", "2025-01-02", "2025-01-03"]),
        id: "self",
        photoIds: new Set(["clean", "group", "solo"]),
      },
      {
        days: new Set(["2025-01-01", "2025-01-02"]),
        id: "candidate",
        photoIds: new Set(["clean", "group"]),
      },
      {
        days: new Set(["2025-01-02"]),
        id: "third-person",
        photoIds: new Set(["group"]),
      },
    ],
    [
      { date: new Date("2025-01-01"), faceClusterIds: ["self", "candidate"], id: "clean" },
      {
        date: new Date("2025-01-02"),
        faceClusterIds: ["self", "candidate", "third-person"],
        id: "group",
      },
      { date: new Date("2025-01-03"), faceClusterIds: ["self"], id: "solo" },
    ],
    false,
  );

  assert.equal(result.specialFaceId, undefined);
  assert.deepEqual(result.visualPeople[0].pairDayPhotoIds, ["clean"]);
});
