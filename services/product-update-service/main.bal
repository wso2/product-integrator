import ballerina/http;

const string LATEST_VERSION = "5.0.0";
const string RELEASE_URL = "https://github.com/wso2/product-integrator/releases/tag/v5.0.0-alpha3";

type UpdateCheckRequest record {|
    string installedVersion?;
|};

type UpdateCheckResponse record {|
    string status;
    string message;
    string? installedVersion = ();
    string? latestVersion = ();
    string? releaseUrl = ();
|};

listener http:Listener productUpdateListener = new (8080);

service / on productUpdateListener {
    resource function get healthz() returns map<string> {
        return {status: "ok"};
    }
}

service /api/v1/product\-updates/'check on productUpdateListener {
    resource function post .(@http:Payload UpdateCheckRequest request) returns UpdateCheckResponse|http:BadRequest {
        string? installedVersion = request.installedVersion;

        if installedVersion is string {
            string normalizedInstalledVersion = installedVersion.trim();

            if normalizedInstalledVersion.length() == 0 {
                return {
                    status: "update-available",
                    message: "A new WSO2 Integrator version is available.",
                    latestVersion: LATEST_VERSION,
                    releaseUrl: RELEASE_URL
                };
            }

            if compareVersions(LATEST_VERSION, normalizedInstalledVersion) <= 0 {
                return {
                    status: "up-to-date",
                    message: "WSO2 Integrator is up to date.",
                    installedVersion: normalizedInstalledVersion,
                    latestVersion: LATEST_VERSION,
                    releaseUrl: RELEASE_URL
                };
            }

            return {
                status: "update-available",
                message: "A newer WSO2 Integrator version is available.",
                installedVersion: normalizedInstalledVersion,
                latestVersion: LATEST_VERSION,
                releaseUrl: RELEASE_URL
            };
        }

        return {
            status: "update-available",
            message: "A new WSO2 Integrator version is available.",
            latestVersion: LATEST_VERSION,
            releaseUrl: RELEASE_URL
        };
    }
}

function compareVersions(string left, string right) returns int {
    int[] leftParts = parseVersionParts(left);
    int[] rightParts = parseVersionParts(right);
    int maxLength = leftParts.length() > rightParts.length() ? leftParts.length() : rightParts.length();

    foreach int index in 0 ..< maxLength {
        int leftPart = index < leftParts.length() ? leftParts[index] : 0;
        int rightPart = index < rightParts.length() ? rightParts[index] : 0;

        if leftPart > rightPart {
            return 1;
        }

        if leftPart < rightPart {
            return -1;
        }
    }

    return 0;
}

function parseVersionParts(string version) returns int[] {
    int[] parts = [];
    int currentPart = 0;

    foreach int codePoint in version.toCodePointInts() {
        if codePoint == 46 {
            parts.push(currentPart);
            currentPart = 0;
            continue;
        }

        if codePoint >= 48 && codePoint <= 57 {
            currentPart = (currentPart * 10) + (codePoint - 48);
        }
    }

    parts.push(currentPart);
    return parts;
}
