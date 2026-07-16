import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { readEmbeddedPhotoMetadata } from "../.test-dist/pngMetadata.js";

function uint32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function chunk(type, data) {
  return Buffer.concat([
    uint32(data.length),
    Buffer.from(type, "ascii"),
    data,
    Buffer.alloc(4),
  ]);
}

function internationalText(keyword, text) {
  return Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0, 0, 0, 0, 0]),
    Buffer.from(text, "utf8"),
  ]);
}

function pngWithMetadata(description, xmp = "") {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [
    chunk("iTXt", internationalText("Description", JSON.stringify(description))),
  ];
  if (xmp) {
    chunks.push(chunk("iTXt", internationalText("XML:com.adobe.xmp", xmp)));
  }
  chunks.push(chunk("IDAT", Buffer.from([0])));
  return Buffer.concat([signature, ...chunks]);
}

test("reads original world and nickname values from VRChat description metadata", async () => {
  const bytes = pngWithMetadata({
    author: { displayName: "OriginalNickname", id: "usr_self" },
    players: [
      { displayName: "OriginalNickname", id: "usr_self" },
      { displayName: "FriendName", id: "usr_friend" },
    ],
    world: {
      displayName: "Original World Name",
      id: "wrld_example",
      instanceId: "instance-example",
    },
  });
  const file = new File([bytes], "VRChat_2025-01-02_03-04-05.png", {
    type: "image/png",
  });
  const metadata = await readEmbeddedPhotoMetadata(file);

  assert.equal(metadata?.authorName, "OriginalNickname");
  assert.equal(metadata?.authorId, "usr_self");
  assert.equal(metadata?.worldName, "Original World Name");
  assert.equal(metadata?.worldId, "wrld_example");
  assert.equal(metadata?.instanceId, "instance-example");
  assert.deepEqual(metadata?.players, [
    { displayName: "OriginalNickname", id: "usr_self" },
    { displayName: "FriendName", id: "usr_friend" },
  ]);
});

test("uses XMP date and world fields when description metadata is incomplete", async () => {
  const xmp = [
    "<rdf:Description",
    ' xmp:CreateDate="2025-03-04T05:06:07+09:00"',
    ' vrc:WorldID="wrld_xmp"',
    ' vrc:WorldDisplayName="XMP World"',
    "/>",
  ].join("");
  const bytes = pngWithMetadata({ players: [] }, xmp);
  const file = new File([bytes], "memory.png", { type: "image/png" });
  const metadata = await readEmbeddedPhotoMetadata(file);

  assert.equal(metadata?.captureDate, "2025-03-04T05:06:07+09:00");
  assert.equal(metadata?.worldId, "wrld_xmp");
  assert.equal(metadata?.worldName, "XMP World");
});
