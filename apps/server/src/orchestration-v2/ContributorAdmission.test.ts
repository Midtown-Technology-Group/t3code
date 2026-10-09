import { assert, it } from "@effect/vitest";
import { ProviderInstanceId, ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ContributorAdmission from "./ContributorAdmission.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";

it.effect(
  "rejects both Contributor versions before adapter lookup, regardless of instance alias",
  () =>
    Effect.gen(function* () {
      let lookups = 0;
      const registry = Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
        get: (instanceId) =>
          Effect.sync(() => {
            lookups++;
          }).pipe(
            Effect.andThen(
              Effect.fail(
                new ProviderAdapterRegistry.ProviderAdapterRegistryLookupError({ instanceId }),
              ),
            ),
          ),
      });
      for (const model of [
        "muse-spark-1.2-contributor",
        "muse-spark-1.3-contributor",
        "opencode-go/muse-spark-1.2-contributor",
        "opencode-go/muse-spark-1.3-contributor#default",
      ]) {
        const result = yield* Effect.gen(function* () {
          const adapters = yield* ProviderAdapterRegistry.ProviderAdapterRegistryV2;
          return yield* ContributorAdmission.admitSelection(adapters, {
            instanceId: ProviderInstanceId.make("unrelated-instance-alias"),
            model,
            options: [],
          });
        }).pipe(Effect.provide(registry), Effect.exit);
        assert(Exit.isFailure(result));
        assert.equal(lookups, 0);
      }
    }),
);

it.effect(
  "keeps unresolved Muse, OpenCode and ACP routes denied without a clean-session exception",
  () =>
    Effect.gen(function* () {
      for (const driver of ["muse", "opencode", "acpRegistry"] as const) {
        const result = yield* ContributorAdmission.denyUnqualifiedRoute(
          ProviderDriverKind.make(driver),
        ).pipe(Effect.exit);
        assert(Exit.isFailure(result));
      }
      yield* ContributorAdmission.denyUnqualifiedRoute(ProviderDriverKind.make("codex"));
      yield* ContributorAdmission.denySelectedContributor({
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-6.1-sol",
        options: [],
      });
    }),
);

it("exposes only validated content-free denial reasons from wrapped errors", () => {
  const denial = new ContributorAdmission.ContributorAdmissionDenied({
    reason: "MODEL_ROUTE_NOT_QUALIFIED",
  });
  assert.equal(
    ContributorAdmission.privacyAdmissionMessage({ cause: { cause: denial } }),
    "PRIVACY_ADMISSION_DENIED: MODEL_ROUTE_NOT_QUALIFIED",
  );
  assert.equal(
    ContributorAdmission.privacyAdmissionMessage({ cause: "HI_MARK_SYNTHETIC_SECRET" }),
    undefined,
  );
  assert.equal(
    ContributorAdmission.privacyAdmissionMessage({
      _tag: "ContributorAdmissionDenied",
      reason: "HI_MARK_SYNTHETIC_SECRET",
      message: "HI_MARK_SYNTHETIC_SECRET",
    }),
    undefined,
  );
  assert.equal(
    ContributorAdmission.privacyAdmissionMessage({
      _tag: "ContributorAdmissionDenied",
      reason: "MODEL_ROUTE_NOT_QUALIFIED",
      message: "HI_MARK_SYNTHETIC_SECRET",
    }),
    undefined,
  );
  Object.defineProperty(denial, "message", { value: "HI_MARK_SYNTHETIC_SECRET" });
  assert.equal(
    ContributorAdmission.privacyAdmissionMessage(denial),
    "PRIVACY_ADMISSION_DENIED: MODEL_ROUTE_NOT_QUALIFIED",
  );
});
