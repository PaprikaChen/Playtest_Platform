import { NextResponse } from "next/server";
import { finalizeStaleSessions } from "./processing";
import { HttpError, purgeExpired } from "./repo";

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

/** Wrap a route handler: JSON errors, lazy 7-day retention purge. */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      purgeExpired();
      await finalizeStaleSessions();
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
  };
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Testers authenticate with the invite token, sent as a header. */
export const testerToken = (req: Request) => req.headers.get("x-invite-token");

/** Parse a JSON body. Empty body -> {}; malformed JSON -> 400 instead of being silently ignored. */
export async function readJson(req: Request): Promise<Record<string, unknown> & { [k: string]: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch { /* fall through */ }
  throw new HttpError(400, "Request body must be a JSON object.");
}
