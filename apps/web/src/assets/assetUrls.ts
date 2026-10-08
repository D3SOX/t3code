import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  type AssetUrlState,
  assetUrlStateFromResult,
  EMPTY_ASSET_URL_ATOM,
  isMutableAssetResource,
  resolveAssetUrl,
} from "@t3tools/client-runtime/state/assets";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { AssetResource, EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useContext, useEffect, useMemo } from "react";

import { assetEnvironment } from "~/state/assets";
import { useFilesystemReadAccess } from "~/state/filesystem";
import { usePreparedConnection } from "~/state/session";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";

export { resolveAssetUrl, type AssetUrlState } from "@t3tools/client-runtime/state/assets";

export function useAssetUrlState(
  environmentId: EnvironmentId | null,
  resource: AssetResource | null,
): AssetUrlState {
  const registry = useContext(RegistryContext);
  const fileAccess = useFilesystemReadAccess(environmentId);
  const mutableResource = isMutableAssetResource(resource);
  const canReadResource = fileAccess.canReadFiles || !mutableResource;
  const preparedConnection = usePreparedConnection(environmentId);
  const query =
    !canReadResource || environmentId === null || resource === null
      ? EMPTY_ASSET_URL_ATOM
      : assetEnvironment.createUrl({ environmentId, input: { resource } });
  const result = useAtomValue(query);
  useEffect(() => {
    if (!canReadResource || !mutableResource) return;
    const cached = registry.get(query);
    // A new image occurrence must not inherit another message's cached file version.
    // An in-flight request already supplies a fresh URL, so leave it alone.
    if (cached._tag === "Success" && !cached.waiting) registry.refresh(query);
  }, [canReadResource, mutableResource, query, registry]);
  if (!canReadResource) return { _tag: fileAccess.isPending ? "Loading" : "Failure" };
  return assetUrlStateFromResult(
    result,
    preparedConnection._tag === "Some" ? preparedConnection.value.httpBaseUrl : null,
  );
}

export function useAssetUrlRefresh(
  environmentId: EnvironmentId | null,
  resource: AssetResource | null,
): () => Promise<string | null> {
  const connection = usePreparedConnection(environmentId);
  const httpBaseUrl = connection._tag === "Some" ? connection.value.httpBaseUrl : null;
  const refresh = useAtomQueryRunner(assetEnvironment.createUrl, {
    reportFailure: false,
    refresh: true,
  });
  return useCallback(async () => {
    if (environmentId === null || resource === null || httpBaseUrl === null) return null;
    const result = await refresh({ environmentId, input: { resource } });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    return resolveAssetUrl(httpBaseUrl, result.value.relativeUrl);
  }, [environmentId, resource, refresh, httpBaseUrl]);
}

export function useAssetUrls(
  environmentId: EnvironmentId,
  resources: ReadonlyArray<AssetResource>,
): ReadonlyArray<string | null> {
  const preparedConnection = usePreparedConnection(environmentId);
  const { canReadFiles } = useFilesystemReadAccess(environmentId);
  const allowedResources = useMemo(
    () =>
      canReadFiles ? resources : resources.filter((resource) => !isMutableAssetResource(resource)),
    [canReadFiles, resources],
  );
  const results = useAtomValue(
    assetEnvironment.createUrls({
      environmentId,
      resources: allowedResources,
    }),
  );
  return useMemo(() => {
    if (preparedConnection._tag === "None") return resources.map(() => null);
    let resultIndex = 0;
    return resources.map((resource) => {
      if (!canReadFiles && isMutableAssetResource(resource)) return null;
      const result = results[resultIndex++];
      return result && AsyncResult.isSuccess(result)
        ? resolveAssetUrl(preparedConnection.value.httpBaseUrl, result.value.relativeUrl)
        : null;
    });
  }, [canReadFiles, preparedConnection, resources, results]);
}
