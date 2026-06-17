type JsonRecord = Record<string, unknown>;

export type BunnyDocConfig = {
  apiKey?: string;
  baseUrl?: string;
};

export type DormantBunnyDocResult = {
  ok: false;
  dormant: true;
  message: string;
};

const DORMANT_MESSAGE =
  "BunnyDoc integration is dormant in this Next.js app. No signature request or webhook subscription was sent.";

export async function sendSignatureRequest(
  _payload: JsonRecord,
  _cfg: BunnyDocConfig = {},
): Promise<DormantBunnyDocResult> {
  return {
    ok: false,
    dormant: true,
    message: DORMANT_MESSAGE,
  };
}

export async function subscribeWebhook(
  _url: string,
  _cfg: BunnyDocConfig = {},
): Promise<DormantBunnyDocResult> {
  return {
    ok: false,
    dormant: true,
    message: DORMANT_MESSAGE,
  };
}
