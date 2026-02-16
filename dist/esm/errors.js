/**
 * Base error for all Forgejo client errors.
 */
export class ForgejoError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ForgejoError';
    }
}
/**
 * Thrown when the Forgejo API returns a non-2xx HTTP response.
 */
export class ForgejoApiError extends ForgejoError {
    statusCode;
    statusText;
    responseBody;
    constructor(statusCode, statusText, responseBody) {
        super(`HTTP ${statusCode}: ${statusText}${responseBody ? ` - ${responseBody}` : ''}`);
        this.name = 'ForgejoApiError';
        this.statusCode = statusCode;
        this.statusText = statusText;
        this.responseBody = responseBody;
    }
}
/**
 * Thrown when a network error prevents the request from completing.
 */
export class ForgejoNetworkError extends ForgejoError {
    url;
    cause;
    constructor(url, cause) {
        const message = cause
            ? `Network error: Cannot reach ${url}. ${cause.message}`
            : `Network error: Cannot reach ${url}`;
        super(message);
        this.name = 'ForgejoNetworkError';
        this.url = url;
        this.cause = cause;
    }
}
//# sourceMappingURL=errors.js.map