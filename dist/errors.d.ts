/**
 * Base error for all Forgejo client errors.
 */
export declare class ForgejoError extends Error {
    constructor(message: string);
}
/**
 * Thrown when the Forgejo API returns a non-2xx HTTP response.
 */
export declare class ForgejoApiError extends ForgejoError {
    readonly statusCode: number;
    readonly statusText: string;
    readonly responseBody: string;
    constructor(statusCode: number, statusText: string, responseBody: string);
}
/**
 * Thrown when a network error prevents the request from completing.
 */
export declare class ForgejoNetworkError extends ForgejoError {
    readonly url: string;
    readonly cause: Error | undefined;
    constructor(url: string, cause?: Error);
}
//# sourceMappingURL=errors.d.ts.map