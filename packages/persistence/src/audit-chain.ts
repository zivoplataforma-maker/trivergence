import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import {
  auditEventSchema,
  auditEventTypeSchema,
  auditPayloadSchema,
  type AuditEvent,
  type AuditEventType,
  type AuditPayload,
} from "@trivergence/contracts";

export const GENESIS_DIGEST = "0".repeat(64);

export interface AuditChainVerification {
  readonly valid: boolean;
  readonly eventCount: number;
  readonly lastDigest: string;
  readonly failureSequence?: number;
  readonly reason?: string;
}

export interface AuditEventDraft {
  readonly eventType: AuditEventType;
  readonly subjectId: string;
  readonly payload: AuditPayload;
}

export interface AuditDependencies {
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

const normalizedPayload = (payload: AuditPayload): AuditPayload =>
  Object.fromEntries(
    Object.entries(auditPayloadSchema.parse(payload)).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

const digestEvent = (
  sequence: number,
  id: string,
  occurredAt: string,
  eventType: AuditEventType,
  subjectId: string,
  payload: AuditPayload,
  previousDigest: string,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        sequence,
        id,
        occurredAt,
        eventType,
        subjectId,
        normalizedPayload(payload),
        previousDigest,
      ]),
      "utf8",
    )
    .digest("hex");

const rowToEvent = (row: Record<string, unknown>): AuditEvent =>
  auditEventSchema.parse({
    sequence: row.sequence,
    id: row.id,
    occurredAt: row.occurred_at,
    eventType: row.event_type,
    subjectId: row.subject_id,
    payload: JSON.parse(String(row.payload_json)) as unknown,
    previousDigest: row.previous_digest,
    eventDigest: row.event_digest,
  });

export const listAuditEvents = (database: DatabaseSync): AuditEvent[] =>
  (
    database
      .prepare("SELECT * FROM audit_events ORDER BY sequence ASC")
      .all() as Record<string, unknown>[]
  ).map(rowToEvent);

export const verifyAuditChain = (
  database: DatabaseSync,
): AuditChainVerification => {
  let events: AuditEvent[];
  try {
    events = listAuditEvents(database);
  } catch (error) {
    return {
      valid: false,
      eventCount: 0,
      lastDigest: GENESIS_DIGEST,
      reason:
        error instanceof Error ? error.message : "Audit table unavailable",
    };
  }

  let previousDigest = GENESIS_DIGEST;
  for (const [index, event] of events.entries()) {
    const expectedSequence = index + 1;
    const expectedDigest = digestEvent(
      event.sequence,
      event.id,
      event.occurredAt,
      event.eventType,
      event.subjectId,
      event.payload,
      event.previousDigest,
    );

    if (
      event.sequence !== expectedSequence ||
      event.previousDigest !== previousDigest ||
      event.eventDigest !== expectedDigest
    ) {
      return {
        valid: false,
        eventCount: events.length,
        lastDigest: previousDigest,
        failureSequence: event.sequence,
        reason: "Audit digest chain verification failed",
      };
    }
    previousDigest = event.eventDigest;
  }

  return {
    valid: true,
    eventCount: events.length,
    lastDigest: previousDigest,
  };
};

export class AuditChain {
  readonly #database: DatabaseSync;
  readonly #clock: () => Date;
  readonly #idFactory: () => string;

  constructor(database: DatabaseSync, dependencies: AuditDependencies = {}) {
    this.#database = database;
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#idFactory = dependencies.idFactory ?? randomUUID;
  }

  append(draft: AuditEventDraft): AuditEvent {
    const eventType = auditEventTypeSchema.parse(draft.eventType);
    const subjectId = draft.subjectId.trim();
    if (subjectId.length < 1 || subjectId.length > 120) {
      throw new Error("Audit subjectId must contain 1 to 120 characters");
    }
    const payload = normalizedPayload(draft.payload);
    const previous = this.#database
      .prepare(
        "SELECT sequence, event_digest FROM audit_events ORDER BY sequence DESC LIMIT 1",
      )
      .get() as { sequence: number; event_digest: string } | undefined;
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousDigest = previous?.event_digest ?? GENESIS_DIGEST;
    const id = this.#idFactory();
    const occurredAt = this.#clock().toISOString();
    const eventDigest = digestEvent(
      sequence,
      id,
      occurredAt,
      eventType,
      subjectId,
      payload,
      previousDigest,
    );

    const event = auditEventSchema.parse({
      sequence,
      id,
      occurredAt,
      eventType,
      subjectId,
      payload,
      previousDigest,
      eventDigest,
    });
    this.#database
      .prepare(
        `INSERT INTO audit_events(
          sequence, id, occurred_at, event_type, subject_id, payload_json,
          previous_digest, event_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.sequence,
        event.id,
        event.occurredAt,
        event.eventType,
        event.subjectId,
        JSON.stringify(event.payload),
        event.previousDigest,
        event.eventDigest,
      );
    return event;
  }
}
