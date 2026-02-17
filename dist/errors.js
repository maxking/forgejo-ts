"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgejoNetworkError = exports.ForgejoApiError = exports.ForgejoError = void 0;
/**
 * Base error for all Forgejo client errors.
 */
class ForgejoError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ForgejoError';
    }
}
exports.ForgejoError = ForgejoError;
/**
 * Thrown when the Forgejo API returns a non-2xx HTTP response.
 */
class ForgejoApiError extends ForgejoError {
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
exports.ForgejoApiError = ForgejoApiError;
/**
 * Thrown when a network error prevents the request from completing.
 */
class ForgejoNetworkError extends ForgejoError {
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
exports.ForgejoNetworkError = ForgejoNetworkError;
//# sourceMappingURL=errors.js.map