export interface ActionTasksResponse {
    total_count: number;
    workflow_runs: WorkflowRunListItem[];
}
export interface WorkflowRunListItem {
    id: number;
    name: string;
    run_number: number;
    status: WorkflowRunStatus;
    conclusion: WorkflowRunConclusion | null;
    workflow_id: string;
    head_branch: string;
    head_sha: string;
    event: WorkflowEvent;
    created_at: string;
    updated_at: string;
    url: string;
    html_url?: string;
    display_title: string;
}
export interface WorkflowRun extends WorkflowRunListItem {
    started_at: string | null;
    stopped_at: string | null;
    run_started_at: string;
}
export interface WorkflowJob {
    id: number;
    run_id: number;
    name: string;
    status: WorkflowRunStatus;
    conclusion: WorkflowRunConclusion | null;
    started_at: string | null;
    completed_at: string | null;
    steps: WorkflowStep[];
    html_url?: string;
}
export interface WorkflowStep {
    name: string;
    status: WorkflowRunStatus;
    conclusion: WorkflowRunConclusion | null;
    number: number;
    started_at?: string;
    completed_at?: string;
}
export interface WorkflowJobsResponse {
    total_count: number;
    jobs: WorkflowJob[];
}
export type WorkflowRunStatus = 'waiting' | 'queued' | 'in_progress' | 'success' | 'failure' | 'cancelled' | 'skipped';
export type WorkflowRunConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | 'timed_out' | 'action_required';
export type WorkflowEvent = 'push' | 'pull_request' | 'pull_request_target' | 'schedule' | 'workflow_dispatch' | 'repository_dispatch' | 'release' | 'create' | 'delete' | 'fork' | 'issues' | 'issue_comment' | 'watch' | (string & NonNullable<unknown>);
//# sourceMappingURL=action.d.ts.map