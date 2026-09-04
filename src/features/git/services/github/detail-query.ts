export const PULL_REQUEST_DETAILS_QUERY = `
query TuiminalPullRequestDetails($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    viewerPermission mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed
    pullRequest(number: $number) {
      body baseRefOid headRefOid mergeable mergeStateStatus state isDraft mergedAt
      mergeQueue { id }
      mergeQueueEntry { position state enqueuedAt }
      autoMergeRequest { mergeMethod enabledAt enabledBy { login } }
      viewerCanUpdateBranch viewerCanClose viewerCanReopen viewerCanMergeAsAdmin viewerCanUpdate
      assignees(first: 100) { nodes { login } }
      reviewRequests(first: 50) {
        totalCount pageInfo { hasNextPage endCursor }
        nodes { asCodeOwner requestedReviewer { __typename ... on User { login } ... on Team { slug name organization { login } } } }
      }
      reviews(first: 50) {
        totalCount pageInfo { hasNextPage endCursor }
        nodes { id state body submittedAt author { login } commit { oid } }
      }
      commits(first: 50) {
        totalCount pageInfo { hasNextPage endCursor }
        nodes { commit { oid messageHeadline authoredDate author { name user { login } } } }
      }
      files(first: 100) {
        totalCount pageInfo { hasNextPage endCursor }
        nodes { path additions deletions changeType }
      }
      comments(first: 50) {
        totalCount pageInfo { hasNextPage endCursor }
        nodes { id body createdAt url author { login } }
      }
      timelineItems(first: 50) {
        totalCount pageInfo { hasNextPage endCursor }
        nodes {
          __typename
          ... on IssueComment { id body createdAt author { login } }
          ... on PullRequestReview { id body submittedAt state author { login } }
          ... on ClosedEvent { id createdAt actor { login } }
          ... on ReopenedEvent { id createdAt actor { login } }
          ... on MergedEvent { id createdAt actor { login } commit { oid } }
          ... on ReadyForReviewEvent { id createdAt actor { login } }
          ... on ConvertToDraftEvent { id createdAt actor { login } }
          ... on ReviewRequestedEvent { id createdAt actor { login } requestedReviewer { ... on User { login } ... on Team { slug } } }
          ... on AssignedEvent { id createdAt actor { login } assignee { ... on User { login } } }
        }
      }
      statusCheckRollup {
        contexts(first: 50) {
          totalCount pageInfo { hasNextPage endCursor }
          nodes {
            __typename
            ... on CheckRun { databaseId name status conclusion detailsUrl checkSuite { app { name } } }
            ... on StatusContext { id context state targetUrl creator { login } }
          }
        }
      }
    }
  }
}`
