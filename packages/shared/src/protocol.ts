import { MessageType, Source } from "./constants";

export interface Envelope {
  type: MessageType;
  seq: number;
  ts: string;
  source: Source;
  sessionId: string;
  payload: Record<string, unknown>;
}

let seqCounter = 0;

export function createEnvelope(opts: {
  type: MessageType;
  source: Source;
  sessionId: string;
  payload: Record<string, unknown>;
}): Envelope {
  return {
    type: opts.type,
    seq: ++seqCounter,
    ts: new Date().toISOString(),
    source: opts.source,
    sessionId: opts.sessionId,
    payload: opts.payload,
  };
}

export function resetSeq(): void {
  seqCounter = 0;
}
