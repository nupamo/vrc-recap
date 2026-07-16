import assert from "node:assert/strict";
import test from "node:test";
import {
  inferMetadataPeople,
  inferRecurringFaces,
} from "../.test-dist/recapInference.js";

function photo(id, day, participants) {
  return {
    date: new Date(`${day}T12:00:00Z`),
    id,
    participants,
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
    photo("pair-1", "2025-01-01", [self, special]),
    photo("pair-2", "2025-01-02", [special, self]),
    photo("group", "2025-01-03", [self, special, friend]),
    photo("friend-pair", "2025-01-04", [self, friend]),
    photo("special-without-self", "2025-01-05", [special, friend]),
  ]);

  assert.equal(result.special?.key, special.key);
  assert.deepEqual(result.special?.pairPhotoIds, ["pair-1", "pair-2"]);
  assert.equal(
    result.people.find((person) => person.key === friend.key)?.pairPhotoIds.length,
    1,
  );
});

test("recurring faces infer self and the strongest two-face pairing without metadata", () => {
  const faceSelf = {
    days: new Set(["2025-01-01", "2025-01-02", "2025-01-03"]),
    id: "face-self",
    photoIds: new Set(["a", "b", "c", "d"]),
  };
  const faceSpecial = {
    days: new Set(["2025-01-01", "2025-01-02"]),
    id: "face-special",
    photoIds: new Set(["a", "b", "x"]),
  };
  const faceOther = {
    days: new Set(["2025-01-03"]),
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
      { date: new Date("2025-01-01"), faceClusterIds: ["face-self", "face-special"], id: "a" },
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
});
