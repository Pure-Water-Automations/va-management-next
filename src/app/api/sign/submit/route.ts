import { signContract } from "@/lib/actions/contract";

// PUBLIC — must be on the Cloudflare Access bypass.
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      token?: string; signerName?: string; signatureImage?: string | null; agree?: boolean;
    };
    if (!body.token) return Response.json({ ok: false, error: "Missing token" }, { status: 400 });
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent");
    const result = await signContract(
      body.token,
      { signerName: body.signerName ?? "", signatureImage: body.signatureImage ?? null, agree: !!body.agree },
      { ip, userAgent },
    );
    return Response.json(result);
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
