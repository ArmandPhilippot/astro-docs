import { CHECK_STATES, type Check } from '../github/checks.ts';
import type { PullRequestDetails, Repository } from '../github/repository.ts';
import { REVIEW_STATES } from '../github/reviews.ts';
import type { ReleaseAssistantContext } from '../run.ts';
import { filterAsync } from '../utils/filter-async.ts';

type ReadinessContext = Pick<ReleaseAssistantContext, 'docs' | 'ownCheckName'>;

/** What decides whether a docs PR can be merged. Reviews count only from maintainers. */
export type Readiness = {
	isDraft: boolean;
	isApprovedByMaintainer: boolean;
	hasChangesRequestedByMaintainer: boolean;
	/** `null` when GitHub took too long to check for conflicts. */
	isMergeable: boolean | null;
	hasFailingChecks: boolean;
	hasPendingChecks: boolean;
};

/**
 * Reads the readiness of a docs PR.
 *
 * Can take a few seconds while GitHub checks the PR for conflicts.
 *
 * @param {ReadinessContext} context - The docs repository, and the check of the release assistant to leave out.
 * @param {PullRequestDetails} pullRequest - The docs PR.
 * @returns {Promise<Readiness>} The state of the PR, its reviews, and its checks.
 * @throws {GitHubError} When GitHub answers with an error status.
 */
export async function readReadiness(
	{ docs, ownCheckName }: ReadinessContext,
	pullRequest: PullRequestDetails
): Promise<Readiness> {
	const [maintainerReviewStates, isMergeable, checks] = await Promise.all([
		getMaintainerReviewStates(docs, pullRequest.number),
		docs.waitForMergeability(pullRequest),
		getOtherChecks({ docs, ownCheckName }, pullRequest.head.sha),
	]);

	return {
		isDraft: pullRequest.draft ?? false,
		isApprovedByMaintainer: maintainerReviewStates.includes(REVIEW_STATES.approved),
		hasChangesRequestedByMaintainer: maintainerReviewStates.includes(
			REVIEW_STATES.changesRequested
		),
		isMergeable,
		hasFailingChecks: checks.some(({ state }) => state === CHECK_STATES.failure),
		hasPendingChecks: checks.some(({ state }) => state === CHECK_STATES.pending),
	};
}

/** Gets the review state of each maintainer. Dismissed reviews don't count. */
async function getMaintainerReviewStates(docs: Repository, prNumber: number) {
	const latestStates = await docs.getLatestReviewStates(prNumber);
	const activeReviews = [...latestStates].filter(([, state]) => state !== REVIEW_STATES.dismissed);
	const maintainerReviews = await filterAsync(activeReviews, ([login]) =>
		docs.hasWriteAccess(login)
	);
	return maintainerReviews.map(([, state]) => state);
}

async function getOtherChecks(
	{ docs, ownCheckName }: ReadinessContext,
	ref: string
): Promise<Check[]> {
	const checks = await docs.getChecks(ref);
	return checks.filter(({ name }) => name !== ownCheckName);
}
