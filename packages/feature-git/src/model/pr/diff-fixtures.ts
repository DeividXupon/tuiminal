import { boundedPullRequestDiff, type PullRequestDiffTarget } from "./diff"
import type { PullRequestDetails, PullRequestSummary } from "./types"

const DEMO_DIFF = `diff --git a/src/cache.ts b/src/cache.ts
index 1111111..2222222 100644
--- a/src/cache.ts
+++ b/src/cache.ts
@@ -1,4 +1,5 @@
 export function cacheKey(id: string) {
-  return id
+  const normalized = id.trim()
+  return normalized
 }
diff --git a/assets/logo.bin b/assets/logo.bin
new file mode 100644
index 0000000..3333333
Binary files /dev/null and b/assets/logo.bin differ`

export function demoPullRequestDiff(
  item: PullRequestSummary,
  details: PullRequestDetails,
  target: PullRequestDiffTarget,
) {
  const bounded = boundedPullRequestDiff(DEMO_DIFF)
  return {
    identity: item.identity,
    target,
    baseSha: details.baseSha,
    headSha: item.headSha,
    ...bounded,
  }
}
