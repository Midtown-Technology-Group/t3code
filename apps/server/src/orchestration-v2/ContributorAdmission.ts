import type { ModelSelection, ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ProviderAdapterRegistryV2 } from "./ProviderAdapterRegistry.ts";

export class ContributorAdmissionDenied extends Schema.TaggedError<ContributorAdmissionDenied>()(
  "ContributorAdmissionDenied",
  { reason: Schema.Literals(["CONTRIBUTOR_NOT_QUALIFIED", "MODEL_ROUTE_NOT_QUALIFIED"]) },
) {
  override get message(): string {
    return `PRIVACY_ADMISSION_DENIED: ${this.reason}`;
  }
}

const isAdmissionDenied = Schema.is(ContributorAdmissionDenied);

/** Only expose this closed, content-free reason through wrapped service errors. */
export function privacyAdmissionMessage(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 8; depth++) {
    if (isAdmissionDenied(current)) return `PRIVACY_ADMISSION_DENIED: ${current.reason}`;
    if (typeof current !== "object" || current === null || !("cause" in current)) return;
    current = current.cause;
  }
}

const contributorModels = new Set([
  "muse-spark-1.2-contributor",
  "muse-spark-1.3-contributor",
  "opencode-go/muse-spark-1.2-contributor",
  "opencode-go/muse-spark-1.3-contributor",
]);

export function denySelectedContributor(
  selection: ModelSelection,
): Effect.Effect<void, ContributorAdmissionDenied> {
  return contributorModels.has(selection.model.split("#", 1)[0]!)
    ? Effect.fail(new ContributorAdmissionDenied({ reason: "CONTRIBUTOR_NOT_QUALIFIED" }))
    : Effect.void;
}

/**
 * Denial-only: no clean-session authorization exists yet. These drivers can
 * resolve defaults/aliases or issue calls outside T3's selected model, so they
 * remain unqualified as a whole until trusted route/provenance admission exists.
 * This deliberately denies their standard models too; it is not a tier resolver.
 */
export function denyUnqualifiedRoute(
  driver: ProviderDriverKind,
): Effect.Effect<void, ContributorAdmissionDenied> {
  return driver === "muse" || driver === "opencode" || driver === "acpRegistry"
    ? Effect.fail(new ContributorAdmissionDenied({ reason: "MODEL_ROUTE_NOT_QUALIFIED" }))
    : Effect.void;
}

export const admitSelection = (
  registry: ProviderAdapterRegistryV2["Service"],
  selection: ModelSelection,
) =>
  denySelectedContributor(selection).pipe(
    Effect.andThen(registry.get(selection.instanceId)),
    Effect.flatMap((adapter) => denyUnqualifiedRoute(adapter.driver)),
  );
