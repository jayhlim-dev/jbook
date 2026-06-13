import { Storage } from '@google-cloud/storage';

function normalizeOuterQuotes(value) {
    const trimmed = value.trim();
    if (
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function normalizeSingleQuotedJson(value) {
    return value
        .replace(/([{,]\s*)'([^']+?)'(\s*:)/g, '$1"$2"$3')
        .replace(/:\s*'([^']*?)'/g, ': "$1"');
}

function parseJsonWithFallbacks(rawValue, envName) {
    const attempts = [];
    const normalized = normalizeOuterQuotes(rawValue);
    attempts.push(normalized);
    attempts.push(normalizeSingleQuotedJson(normalized));

    for (const candidate of attempts) {
        try {
            return JSON.parse(candidate);
        } catch (_error) {
            // Try next normalization strategy.
        }
    }

    throw new Error(
        `Invalid ${envName}. Paste exact service-account JSON (double quotes) as a single-line value in .env.`
    );
}

export function parseServiceAccountCredentials() {
    const rawJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
    if (rawJson) {
        const parsed = parseJsonWithFallbacks(rawJson, 'GCP_SERVICE_ACCOUNT_KEY_JSON');
        if (!parsed?.client_email || !parsed?.private_key || !parsed?.project_id) {
            throw new Error(
                'GCP_SERVICE_ACCOUNT_KEY_JSON is missing required keys (project_id, client_email, private_key).'
            );
        }

        return parsed;
    }

    const base64 = process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64;
    if (!base64) {
        return null;
    }

    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    return parseJsonWithFallbacks(decoded, 'GCP_SERVICE_ACCOUNT_KEY_BASE64');
}

export function buildStorageClient() {
    const projectId = process.env.GCP_PROJECT_ID;
    const credentials = parseServiceAccountCredentials();
    if (!credentials) {
        throw new Error('Missing Google Cloud service account key.');
    }

    return new Storage({
        projectId: projectId || credentials.project_id,
        credentials
    });
}

export function getBucketName() {
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
        throw new Error('GCS_BUCKET_NAME is not configured on the server.');
    }

    return bucketName;
}

export function isValidBookId(bookId) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookId);
}
