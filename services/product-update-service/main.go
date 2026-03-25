package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type updateCheckRequest struct {
	InstalledVersion string `json:"installedVersion"`
}

type updateCheckResponse struct {
	Status           string `json:"status"`
	Message          string `json:"message"`
	InstalledVersion string `json:"installedVersion,omitempty"`
	LatestVersion    string `json:"latestVersion,omitempty"`
	ReleaseURL       string `json:"releaseUrl,omitempty"`
}

type githubReleaseResponse struct {
	TagName string `json:"tag_name"`
	Name    string `json:"name"`
	HTMLURL string `json:"html_url"`
}

type githubTagResponse struct {
	Name string `json:"name"`
}

type remoteVersionDetails struct {
	Version    string
	ReleaseURL string
}

type remoteSourceConfig struct {
	releaseAPIURL   string
	tagsAPIURL      string
	releasesPageURL string
	resourceName    string
}

var versionPattern = regexp.MustCompile(`(\d+(?:\.\d+)+)`)

func main() {
	service := newUpdateService()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/api/v1/product-updates/check", service.handleProductCheck)

	server := &http.Server{
		Addr:              ":" + service.port,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("product update service listening on :%s", service.port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("failed to start server: %v", err)
	}
}

type updateService struct {
	port          string
	productSource remoteSourceConfig
	httpClient    *http.Client
}

func newUpdateService() *updateService {
	return &updateService{
		port: getEnv("PORT", "8080"),
		productSource: remoteSourceConfig{
			releaseAPIURL:   getEnv("RELEASE_API_URL", "https://api.github.com/repos/wso2/product-integrator/releases/latest"),
			tagsAPIURL:      getEnv("TAGS_API_URL", "https://api.github.com/repos/wso2/product-integrator/tags?per_page=20"),
			releasesPageURL: getEnv("RELEASES_PAGE_URL", "https://github.com/wso2/product-integrator/releases"),
			resourceName:    "WSO2 Integrator",
		},
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (service *updateService) handleProductCheck(writer http.ResponseWriter, request *http.Request) {
	service.handleCheck(writer, request, service.productSource)
}

func (service *updateService) handleCheck(writer http.ResponseWriter, request *http.Request, source remoteSourceConfig) {
	if request.Method != http.MethodPost {
		writeJSON(writer, http.StatusMethodNotAllowed, updateCheckResponse{
			Status:  "error",
			Message: "method not allowed",
		})
		return
	}

	var payload updateCheckRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeJSON(writer, http.StatusBadRequest, updateCheckResponse{
			Status:  "error",
			Message: "invalid request payload",
		})
		return
	}

	latest, err := service.fetchLatestVersion(source)
	if err != nil {
		writeJSON(writer, http.StatusBadGateway, updateCheckResponse{
			Status:           "error",
			Message:          "failed to resolve latest " + source.resourceName + " version",
			InstalledVersion: payload.InstalledVersion,
		})
		return
	}

	response := updateCheckResponse{
		InstalledVersion: payload.InstalledVersion,
		LatestVersion:    latest.Version,
		ReleaseURL:       latest.ReleaseURL,
	}

	if payload.InstalledVersion == "" {
		response.Status = "update-available"
		response.Message = "A new " + source.resourceName + " version is available."
		writeJSON(writer, http.StatusOK, response)
		return
	}

	if compareVersions(latest.Version, payload.InstalledVersion) <= 0 {
		response.Status = "up-to-date"
		response.Message = source.resourceName + " is up to date."
		writeJSON(writer, http.StatusOK, response)
		return
	}

	response.Status = "update-available"
	response.Message = "A newer " + source.resourceName + " version is available."
	writeJSON(writer, http.StatusOK, response)
}

func (service *updateService) fetchLatestVersion(source remoteSourceConfig) (*remoteVersionDetails, error) {
	if latest, err := service.fetchLatestRelease(source); err == nil && latest != nil {
		return latest, nil
	}

	if latest, err := service.fetchLatestTag(source); err == nil && latest != nil {
		return latest, nil
	}

	return nil, errors.New("latest version unavailable")
}

func (service *updateService) fetchLatestRelease(source remoteSourceConfig) (*remoteVersionDetails, error) {
	request, err := http.NewRequest(http.MethodGet, source.releaseAPIURL, nil)
	if err != nil {
		return nil, err
	}

	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "wso2-integrator-product-update-service")

	response, err := service.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return nil, errors.New("release api returned an error")
	}

	var payload githubReleaseResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	version := extractVersion(firstNonEmpty(payload.TagName, payload.Name))
	if version == "" {
		return nil, errors.New("release version missing")
	}

	return &remoteVersionDetails{
		Version:    version,
		ReleaseURL: firstNonEmpty(payload.HTMLURL, source.releasesPageURL),
	}, nil
}

func (service *updateService) fetchLatestTag(source remoteSourceConfig) (*remoteVersionDetails, error) {
	request, err := http.NewRequest(http.MethodGet, source.tagsAPIURL, nil)
	if err != nil {
		return nil, err
	}

	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "wso2-integrator-product-update-service")

	response, err := service.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return nil, errors.New("tags api returned an error")
	}

	var payload []githubTagResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}

	bestVersion := ""
	bestTag := ""
	for _, tag := range payload {
		version := extractVersion(tag.Name)
		if version == "" {
			continue
		}

		if bestVersion == "" || compareVersions(version, bestVersion) > 0 {
			bestVersion = version
			bestTag = tag.Name
		}
	}

	if bestVersion == "" {
		return nil, errors.New("tag version missing")
	}

	return &remoteVersionDetails{
		Version:    bestVersion,
		ReleaseURL: strings.TrimRight(source.releasesPageURL, "/") + "/tag/" + bestTag,
	}, nil
}

func extractVersion(raw string) string {
	match := versionPattern.FindStringSubmatch(strings.TrimSpace(raw))
	if len(match) < 2 {
		return ""
	}

	return match[1]
}

func compareVersions(left string, right string) int {
	leftParts := parseVersionParts(left)
	rightParts := parseVersionParts(right)
	maxLength := len(leftParts)
	if len(rightParts) > maxLength {
		maxLength = len(rightParts)
	}

	for index := 0; index < maxLength; index++ {
		leftValue := 0
		rightValue := 0

		if index < len(leftParts) {
			leftValue = leftParts[index]
		}

		if index < len(rightParts) {
			rightValue = rightParts[index]
		}

		if leftValue > rightValue {
			return 1
		}

		if leftValue < rightValue {
			return -1
		}
	}

	return 0
}

func parseVersionParts(version string) []int {
	rawParts := strings.Split(version, ".")
	parts := make([]int, 0, len(rawParts))
	for _, part := range rawParts {
		value, err := strconv.Atoi(part)
		if err != nil {
			parts = append(parts, 0)
			continue
		}

		parts = append(parts, value)
	}

	return parts
}

func writeJSON(writer http.ResponseWriter, statusCode int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(statusCode)
	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		log.Printf("failed to write response: %v", err)
	}
}

func withCORS(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET")

		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		handler.ServeHTTP(writer, request)
	})
}

func getEnv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}
