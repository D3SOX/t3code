import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const PushSubscriptionInput = Schema.Struct({
  deviceId: TrimmedNonEmptyString,
  endpoint: Schema.String.check(Schema.isPattern(/^https:\/\/[^\s]+$/)),
  publicKey: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{87}$/)),
  auth: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{22}$/)),
});
export type PushSubscriptionInput = typeof PushSubscriptionInput.Type;

export class PushNotificationError extends Schema.TaggedError<PushNotificationError>()(
  "PushNotificationError",
  { message: Schema.String },
) {}
