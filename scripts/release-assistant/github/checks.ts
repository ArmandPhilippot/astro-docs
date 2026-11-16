const COMPLETED_CHECK_RUN_STATUS = 'completed';
/** The conclusions GitHub accepts for a check required by branch protection. */
const PASSING_CONCLUSIONS = ['success', 'neutral', 'skipped'];

export const CHECK_STATES = {
	pending: 'pending',
	success: 'success',
	failure: 'failure',
} as const;

export type CheckState = (typeof CHECK_STATES)[keyof typeof CHECK_STATES];

const CHECK_STATES_BY_COMMIT_STATUS_STATE: Record<string, CheckState> = {
	error: CHECK_STATES.failure,
	failure: CHECK_STATES.failure,
	pending: CHECK_STATES.pending,
	success: CHECK_STATES.success,
};

/** A check run or a commit status, with GitHub's states reduced to the outcome. */
export type Check = { name: string; state: CheckState };

/** The fields of a check run the release assistant reads, as GitHub names them. */
export type CheckRun = { name: string; status: string; conclusion: string | null };

/** The fields of a commit status the release assistant reads, as GitHub names them. */
export type CommitStatus = { context: string; state: string };

/**
 * Reduces the check runs and the commit statuses of a commit to their outcomes.
 *
 * A check run is pending until it completes, then passes only with a
 * conclusion branch protection accepts. Unknown conclusions and commit status
 * states fail.
 *
 * @param {CheckRun[]} checkRuns - The check runs of the commit.
 * @param {CommitStatus[]} statuses - The commit statuses of the commit.
 * @returns {Check[]} The check runs, then the commit statuses.
 */
export function toChecks(checkRuns: CheckRun[], statuses: CommitStatus[]): Check[] {
	return [...checkRuns.map(toCheckFromRun), ...statuses.map(toCheckFromStatus)];
}

function toCheckFromRun({ name, status, conclusion }: CheckRun): Check {
	if (status !== COMPLETED_CHECK_RUN_STATUS) return { name, state: CHECK_STATES.pending };
	const isPassing = conclusion !== null && PASSING_CONCLUSIONS.includes(conclusion);
	return { name, state: isPassing ? CHECK_STATES.success : CHECK_STATES.failure };
}

function toCheckFromStatus({ context, state }: CommitStatus): Check {
	return {
		name: context,
		state: CHECK_STATES_BY_COMMIT_STATUS_STATE[state] ?? CHECK_STATES.failure,
	};
}
