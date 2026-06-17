import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export type SignedPdfInput = {
  contentHtml: string;
  signerName: string;
  signatureImage: string | null; // data URL (image/png) or null
  audit: { signedAt: string; signerIp: string | null; userAgent: string | null; templateHash: string; candidateId: string };
};

type Block =
  | { type: "h1" | "h2" | "h3" | "p" | "li"; text: string }
  | { type: "hr" };

/** Minimal HTML-subset → blocks. Strips inline tags to text; keeps block order. */
function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(h1|h2|h3|p|li)>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].toLowerCase().startsWith("<hr")) { blocks.push({ type: "hr" }); continue; }
    const tag = m[1].toLowerCase() as "h1" | "h2" | "h3" | "p" | "li";
    const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type: tag, text });
  }
  return blocks;
}

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.5, color: "#222" },
  h1: { fontSize: 18, marginBottom: 10, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 13, marginTop: 12, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  h3: { fontSize: 12, marginTop: 8, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  p: { marginBottom: 6 },
  li: { marginBottom: 3, marginLeft: 12 },
  hr: { borderBottomWidth: 1, borderBottomColor: "#ccc", marginVertical: 8 },
  sigBox: { marginTop: 28, borderTopWidth: 1, borderTopColor: "#222", paddingTop: 10 },
  sigImg: { height: 48, marginVertical: 6 },
  audit: { marginTop: 24, fontSize: 8, color: "#888" },
});

export async function generateSignedPdf(input: SignedPdfInput): Promise<Buffer> {
  const blocks = htmlToBlocks(input.contentHtml);
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        {blocks.map((b, i) =>
          b.type === "hr" ? (
            <View key={i} style={s.hr} />
          ) : b.type === "li" ? (
            <Text key={i} style={s.li}>{"• " + b.text}</Text>
          ) : (
            <Text key={i} style={s[b.type]}>{b.text}</Text>
          ),
        )}
        <View style={s.sigBox}>
          <Text>Signed by: {input.signerName}</Text>
          {input.signatureImage ? <Image style={s.sigImg} src={input.signatureImage} /> : null}
          <Text>Date: {input.audit.signedAt}</Text>
        </View>
        <Text style={s.audit}>
          Audit — candidate {input.audit.candidateId} · IP {input.audit.signerIp ?? "n/a"} · {input.audit.userAgent ?? "n/a"} · template {input.audit.templateHash}
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
