import test from "node:test";
import assert from "node:assert/strict";

import { convertNotionBlocks, richTextToPlain } from "../src/lib/notion-import";

const rt = (text: string) => [{ plain_text: text }];

test("richTextToPlain: joins segments, tolerates junk", () => {
  assert.equal(richTextToPlain([{ plain_text: "Hello " }, { plain_text: "world" }]), "Hello world");
  assert.equal(richTextToPlain(null), "");
  assert.equal(richTextToPlain([null, { plain_text: "x" }]), "x");
});

test("convertNotionBlocks: maps core kinds", () => {
  const { blocks } = convertNotionBlocks([
    { type: "heading_2", heading_2: { rich_text: rt("Plan") } },
    { type: "paragraph", paragraph: { rich_text: rt("Some context.") } },
    { type: "to_do", to_do: { rich_text: rt("Audit"), checked: true } },
    { type: "bulleted_list_item", bulleted_list_item: { rich_text: rt("A bullet") } },
    { type: "numbered_list_item", numbered_list_item: { rich_text: rt("Step one") } },
    { type: "code", code: { rich_text: rt("npm test") } },
    { type: "callout", callout: { rich_text: rt("Heads up") } },
  ]);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["h2", "p", "todo", "ul", "ol", "code", "callout"],
  );
  assert.equal(blocks[2].done, true);
});

test("convertNotionBlocks: child pages are returned separately, not inlined", () => {
  const { blocks, children } = convertNotionBlocks([
    { id: "abc-123", type: "child_page", child_page: { title: "Phase 1" } },
    { type: "paragraph", paragraph: { rich_text: rt("Body") } },
  ]);
  assert.deepEqual(children, [{ notionPageId: "abc-123", title: "Phase 1" }]);
  assert.equal(blocks.length, 1);
});

test("convertNotionBlocks: unsupported kinds degrade to a visible note; dividers and empty paragraphs drop", () => {
  const { blocks } = convertNotionBlocks([
    { type: "image", image: {} },
    { type: "divider", divider: {} },
    { type: "paragraph", paragraph: { rich_text: [] } },
  ]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "p");
  assert.match(blocks[0].text, /not imported: image/);
});
