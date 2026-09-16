/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Integration Platform implementation of the client the cloud commands use.
 *
 * It extends the Choreo RPC client rather than replacing it, so the methods
 * below are served over REST and everything else — connections, the
 * marketplace, databases, sign-in — keeps working through the bundled CLI
 * exactly as before. A method that is not overridden here is not "unsupported";
 * it simply still goes to Choreo.
 */

import type {
	ComponentEP,
	ComponentKind,
	ConnectionDetailed,
	ConnectionListItem,
	CreateComponentReq,
	CreateProjectReq,
	CredentialItem,
	DatabaseAdminCredential,
	DatabaseCredential,
	DatabaseServer,
	DeleteCompReq,
	Environment,
	GetBranchesReq,
	GetCliRpcResp,
	GetComponentItemReq,
	GetComponentUsageResp,
	GetComponentsReq,
	GetGitMetadataReq,
	GetGitMetadataResp,
	GetGitTokenForRepositoryResp,
	GetProjectEnvsReq,
	GithubOrganization,
	IsRepoAuthorizedReq,
	IsRepoAuthorizedResp,
	MarketplaceDatabaseListResp,
	MarketplaceIdlResp,
	MarketplaceItem,
	MarketplaceListResp,
	Project,
	ResolveConnectionSecretsResp,
	StartProxyServerResp,
	SubscriptionsResp,
	UpdateProjectReq,
	UserInfo,
} from "@wso2/wso2-platform-core";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { ext } from "../../extensionVariables";
import { ChoreoRPCClient } from "../choreo-cli-rpc";
import { BffClient, IpaasError, items, q, seg } from "./bff";
import axios from "axios";
import { type SecretStorage, commands, window } from "vscode";
import { decodeClaims } from "./claims";
import {
	buildAuthorizeUrl,
	buildTokenBody,
	decodeSignInNonce,
	encodeSignInState,
	generatePkce,
	type IdpConfig,
	newNonce,
	type PendingSignIn,
	type TokenResponse,
	toStoredSession,
} from "./oidc";
import { SessionStore } from "./session";
import { ENV_STS_TOKEN } from "./config";
import {
	type GitInstallation,
	type GitRepo,
	type OwnerIndexEntry,
	indexInstallations,
	installationFor,
	toGitOrgs,
	isGitHubAuthRequired,
} from "./github";
import {
	type IpaasComponentRepository,
	toComponentKind,
	toComponentSource,
	toCreateComponentBody,
	toEnvironmentName,
	toOrganization,
	toProject,
} from "./mappers";
import {
	type RepoTreeNode,
	flattenTree,
	hasFileInPath,
	isSubPathEmpty,
} from "./repo";
import { parseGitHubOwnerRepo } from "./repo-url";
import type {
	IpaasComponent,
	IpaasComponentDeployment,
	IpaasEnvironment,
	IpaasOrgComponentLimits,
	IpaasOrgEntry,
	IpaasOrgSubscription,
	IpaasProject,
	IpaasTriggerBuildResponse,
	IpaasWorkflowRun,
	ListResponse,
} from "./types";

export class IpaasRpcClient extends ChoreoRPCClient {
	private readonly bff: BffClient;
	/** The editor's own session, once the user has signed in. */
	private readonly sessions: SessionStore;
	/** True while a sign-in prompt is on screen, so only one is. */
	private signInOffered = false;
	/** The signed-in access token, "" when the injected one is still in use. */
	private sessionToken = "";
	/** What a sign-in in progress is waiting for; null when none is. */
	private pendingSignIn: PendingSignIn | null = null;
	/** undefined = not looked up yet, null = this deployment publishes none. */
	private idp: IdpConfig | null | undefined = undefined;
	private installations: Array<{
		installation: GitInstallation;
		repos: GitRepo[];
	}> | null = null;

	constructor(baseUrl: string, secrets: SecretStorage) {
		super();
		this.sessions = new SessionStore(secrets, (body) => this.exchangeForSession(body));
		this.bff = new BffClient({
			baseUrl,
			// The signed-in session when there is one, and the token the platform
			// injected otherwise. The injected token is what makes a freshly
			// provisioned editor work without asking anyone to sign in; it is
			// also what expires, which is what signing in is for.
			getToken: () => this.sessionToken || (process.env[ENV_STS_TOKEN] ?? ""),
			onUnauthorized: () => this.offerSignIn(),
		});
	}

	/**
	 * Bring the cached access token up to date.
	 *
	 * The transport reads the token synchronously on every request, so renewal
	 * cannot happen there. It happens here instead, at the moments that precede
	 * a burst of calls: activation, signing in, and the assistant asking.
	 */
	async refreshSession(): Promise<void> {
		this.sessionToken = await this.sessions.accessToken(await this.idpConfig());
	}

	/**
	 * Offer the user the way back when the platform stops accepting them.
	 *
	 * Once per refusal at a time, not once per failed request: a single action
	 * can put several calls in flight, and a prompt for each would bury the
	 * editor under identical dialogs. Signing in is the recovery because the
	 * token this editor was provisioned with cannot be renewed -- it arrived
	 * without anything to renew it from.
	 */
	private offerSignIn(): void {
		if (this.signInOffered) {
			return;
		}
		this.signInOffered = true;
		window
			.showWarningMessage(
				"Your Integration Platform session has expired. Sign in to continue.",
				"Sign In",
			)
			.then(
				(choice) => {
					this.signInOffered = false;
					if (choice === "Sign In") {
						commands.executeCommand(WICommandIds.SignIn);
					}
				},
				() => {
					this.signInOffered = false;
				},
			);
	}

	/** The token endpoint, for the session store's renewals. */
	private async exchangeForSession(body: string): Promise<TokenResponse> {
		const idp = await this.idpConfig();
		if (!idp) {
			throw new Error("no sign-in configuration");
		}
		return this.postToken(idp, body);
	}

	/** The raw transport, for callers that need an endpoint with no platform-core equivalent. */
	get http(): BffClient {
		return this.bff;
	}

	/**
	 * Ready as soon as it is constructed: the token and base URL are resolved
	 * during activation and there is no session to establish. Inheriting the
	 * base implementation would instead report this client unusable whenever the
	 * bundled CLI failed to start, which would block deploying over a transport
	 * that never involved the CLI.
	 */
	override isActive(): boolean {
		return true;
	}

	/**
	 * Identity comes from the token, not from a call: the platform has no
	 * "current user" endpoint, and every field below is a claim the gateway has
	 * already validated. The organization list is a single entry because a
	 * platform token is issued for one organization.
	 */
	override async getUserInfo(): Promise<UserInfo> {
		const token = process.env[ENV_STS_TOKEN] ?? "";
		const claims = decodeClaims(token);
		if (!claims?.sub) {
			throw new Error(
				"No Integration Platform session was found. Reload the editor to obtain a fresh token, then try again.",
			);
		}

		// The org endpoint resolves the numeric id and uuid the token does not
		// carry. It is not worth failing sign-in over, so fall back to the claims.
		let organizations = [
			toOrganization({
				handle: claims.ouHandle ?? "",
				numericId: 0,
				uuid: claims.ouId ?? "",
			}),
		];
		try {
			const listed = items(
				await this.bff.get<ListResponse<IpaasOrgEntry>>("/orgs"),
			);
			if (listed.length > 0) {
				organizations = listed.map(toOrganization);
			}
		} catch (err) {
			ext.logError(
				"Could not list organizations; using the token's claims",
				err as Error,
			);
		}

		return {
			displayName: claims.name ?? claims.email ?? claims.sub,
			userEmail: claims.email ?? "",
			userProfilePictureUrl: "",
			idpId: claims.sub,
			organizations,
			userId: claims.sub,
			userCreatedAt: new Date(0),
		};
	}

	/**
	 * Regions are a Choreo concept the platform does not have, but the sign-in
	 * path treats a missing one as fatal: initAuth throws, resets the state and
	 * leaves the session looking signed out, with the real cause only in the log.
	 * Report a fixed value — it is carried as a session label and nothing here
	 * branches on it.
	 */
	override async getCurrentRegion(): Promise<"US" | "EU"> {
		return "US";
	}

	/**
	 * Nothing to switch: the organization is fixed by the token, and every
	 * request is scoped to it server-side. Inherited, this reaches the CLI
	 * un-awaited, so a rejection surfaces as an unhandled promise rejection
	 * rather than anything actionable.
	 */
	override async changeOrgContext(_orgId: string): Promise<void> {}

	/**
	 * Console URLs, which on this backend are configured rather than fetched.
	 * The inherited version asks the CLI, whose answer points at Choreo and
	 * whose failure aborts activation.
	 */
	override async getConfigFromCli(): Promise<GetCliRpcResp> {
		return {
			billingConsoleUrl: "",
			choreoConsoleUrl: ext.ipaasConsoleUrl,
			devantConsoleUrl: ext.ipaasConsoleUrl,
			ghApp: { installUrl: "", authUrl: "", clientId: "" },
		};
	}

	/**
	 * The platform token, for other extensions.
	 *
	 * Handed out through WICloudExtensionAPI.getStsToken, whose caller is
	 * Ballerina's copilot (ballerina-extension/src/utils/ai/auth.ts): it
	 * exchanges this at the copilot backend for a token of its own, and
	 * re-exchanges when that one expires.
	 *
	 * Read from the environment on each call rather than captured, because the
	 * copilot asks again after its own token expires, and by then the editor's
	 * copy may have been replaced.
	 */
	override async getStsToken(): Promise<string> {
		await this.refreshSession();
		return this.sessionToken || (process.env[ENV_STS_TOKEN] ?? "");
	}

	override async getProjects(orgID: string): Promise<Project[]> {
		const projects = items(
			await this.bff.get<ListResponse<IpaasProject>>("/projects"),
		);
		return projects.map((project) => toProject(project, orgID));
	}

	override async createProject(params: CreateProjectReq): Promise<Project> {
		const handler = params.projectHandler || params.projectName;
		const created = await this.bff.post<IpaasProject>("/projects", {
			name: handler,
			displayName: params.projectName,
			description: "",
			// Every project binds to a delivery pipeline; "default" is the one
			// provisioned into each organization at bootstrap.
			deploymentPipeline: "default",
		});
		return toProject(created, params.orgId);
	}

	/**
	 * The project's components, each carrying its bound repository.
	 *
	 * The repository is fetched per component because the list does not include
	 * it, and without it nothing can tell which local directory an integration
	 * belongs to — which is what decides whether a directory offers "deploy" or
	 * shows its already-deployed state. A component whose repository cannot be
	 * read keeps an empty source rather than failing the whole list.
	 */
	override async getComponentList(
		params: GetComponentsReq,
	): Promise<ComponentKind[]> {
		const components = items(
			await this.bff.get<ListResponse<IpaasComponent>>(
				`/projects/${seg(params.projectHandle)}/components`,
			),
		);
		return Promise.all(
			components.map(async (component) => {
				const kind = toComponentKind(component);
				kind.spec.source = toComponentSource(
					await this.componentRepository(
						component.handler || component.id,
						params.projectHandle,
					),
				);
				return kind;
			}),
		);
	}

	/** A component's bound repository, or null when it has none or cannot be read. */
	private async componentRepository(
		componentName: string,
		projectName: string,
	): Promise<IpaasComponentRepository | null> {
		if (!componentName) {
			return null;
		}
		try {
			return (
				(await this.bff.get<IpaasComponentRepository | null>(
					`/components/${seg(componentName)}/repository${q({ projectName })}`,
				)) ?? null
			);
		} catch (err) {
			ext.logError(
				`Could not read the repository of ${componentName}`,
				err as Error,
			);
			return null;
		}
	}

	/**
	 * The platform's per-component detail route returns a stub today, so the
	 * component is picked out of the project's list — the same thing the console
	 * does for this reason.
	 */
	override async getComponentItem(
		params: GetComponentItemReq,
	): Promise<ComponentKind> {
		const components = await this.getComponentList({
			orgId: params.orgId,
			orgHandle: "",
			projectId: params.projectHandle,
			projectHandle: params.projectHandle,
		});
		const match = components.find(
			(component) =>
				component.metadata.handler === params.componentName ||
				component.metadata.name === params.componentName,
		);
		if (!match) {
			throw new Error(
				`Integration "${params.componentName}" was not found in project "${params.projectHandle}".`,
			);
		}
		return match;
	}

	/**
	 * Create the component, returning it under the name the platform actually
	 * assigned. A name collision is resolved server-side by suffixing, so the
	 * requested name and the created one are not always the same string, and
	 * every later call has to use the created one.
	 */
	override async createComponent(
		params: CreateComponentReq,
	): Promise<ComponentKind> {
		const repoSubPath = await resolveRepoSubPath(params.componentDir);
		// A private repository builds only when the component is bound to the App
		// installation covering it. A public one needs no binding, and sending one
		// it does not have would name an installation that cannot reach it.
		const owner = parseGitHubOwnerRepo(params.repoUrl)?.owner;
		const installation = installationFor(await this.installationIndex(), owner);
		const created = await this.bff.post<IpaasComponent>(
			`/projects/${seg(params.projectHandle)}/components`,
			toCreateComponentBody(params, repoSubPath, installation?.installationId),
		);
		if (created?.warning) {
			ext.log(
				`Integration "${created.name}" was created with a warning: ${created.warning}`,
			);
		}
		return toComponentKind(created);
	}

	/**
	 * `componentId` is the address, not `componentName` — callers put the
	 * human-readable display name in the latter, and the platform routes on the
	 * slug. `projectId` carries the handler, which is what toProject stores.
	 */
	override async deleteComponent(params: DeleteCompReq): Promise<void> {
		await this.bff.delete(
			`/projects/${seg(params.projectId)}/components/${seg(params.componentId)}`,
		);
	}

	/**
	 * Environments are organization-scoped on the platform, with no project
	 * association, so the project in the request is not a filter — it is ignored.
	 */
	override async getEnvs(_params: GetProjectEnvsReq): Promise<Environment[]> {
		const environments = items(
			await this.bff.get<ListResponse<IpaasEnvironment>>("/environments"),
		);
		return environments.map(
			(environment) =>
				({
					id: toEnvironmentName(environment),
					name: toEnvironmentName(environment),
					description: environment.description ?? "",
					critical: environment.critical,
				}) as Environment,
		);
	}

	// --- Features the platform does not serve ---------------------------------
	//
	// These reach the bundled CLI when not overridden, and the CLI needs a
	// Choreo session it cannot obtain inside this editor — identity here is the
	// platform token. Every one of them then fails with "not logged in", which
	// read as a broken session rather than an absent feature, and which the
	// shared error handler used to escalate into a forced sign-out.
	//
	// Reads answer empty so the UI shows "nothing here" instead of an error.
	// Writes refuse, because quietly succeeding at nothing is worse than saying
	// so. Nothing is fabricated either way.

	/**
	 * The platform's OIDC endpoints, as the console publishes them.
	 *
	 * Read from the console's own config rather than configured again here: the
	 * editor is told where the console is, the console already states which
	 * provider and client it uses, and a second copy is one that can disagree.
	 */
	private async idpConfig(): Promise<IdpConfig | null> {
		if (this.idp !== undefined) {
			return this.idp;
		}
		this.idp = null;
		if (!ext.ipaasConsoleUrl) {
			return null;
		}
		try {
			const response = await axios.get<Record<string, string>>(
				`${ext.ipaasConsoleUrl}/config.json`,
				{ timeout: 15_000, responseType: "json" },
			);
			const config = response.data ?? {};
			const authorizeEndpoint = config.ASGARDEO_AUTHORIZE_ENDPOINT ?? "";
			const tokenEndpoint = config.ASGARDEO_TOKEN_ENDPOINT ?? "";
			const clientId = config.ASGARDEO_CLIENT_ID ?? "";
			if (authorizeEndpoint && tokenEndpoint && clientId) {
				this.idp = {
					authorizeEndpoint,
					tokenEndpoint,
					clientId,
					scope: config.ASGARDEO_SCOPE ?? "",
				};
			}
		} catch (err) {
			ext.logError("Could not read the console's sign-in configuration", err as Error);
		}
		return this.idp;
	}

	/** POST a form body to the provider's token endpoint. */
	private async postToken(idp: IdpConfig, body: string): Promise<TokenResponse> {
		const response = await axios.post<TokenResponse>(idp.tokenEndpoint, body, {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			timeout: 30_000,
			validateStatus: () => true,
		});
		if (response.status < 200 || response.status >= 300) {
			throw new IpaasError(
				response.status,
				typeof response.data === "string" ? response.data : JSON.stringify(response.data ?? ""),
				`Signing in failed (HTTP ${response.status})`,
			);
		}
		return response.data ?? {};
	}

	private unsupported(feature: string): never {
		throw new Error(
			`${feature} is not available on the Integration Platform yet.`,
		);
	}

	override async getConnections(): Promise<ConnectionListItem[]> {
		return [];
	}
	override async getConnectionItem(): Promise<ConnectionDetailed> {
		return this.unsupported("Connections");
	}
	override async createComponentConnection(): Promise<ConnectionDetailed> {
		return this.unsupported("Creating connections");
	}
	override async createThirdPartyConnection(): Promise<ConnectionDetailed> {
		return this.unsupported("Creating connections");
	}
	override async createDatabaseConnection(): Promise<ConnectionDetailed> {
		return this.unsupported("Creating database connections");
	}
	override async deleteConnection(): Promise<void> {
		return this.unsupported("Deleting connections");
	}

	override async getMarketplaceItems(): Promise<MarketplaceListResp> {
		return {
			count: 0,
			pagination: { offset: 0, limit: 0, total: 0 } as never,
			data: [],
		};
	}
	override async getMarketplaceDatabases(): Promise<MarketplaceDatabaseListResp> {
		return {
			count: 0,
			pagination: { offset: 0, limit: 0, total: 0 } as never,
			data: [],
		};
	}

	/**
	 * Branches of a public repository.
	 *
	 * The platform proxies GitHub unauthenticated here, so a private repository
	 * answers empty rather than failing — which `isRepoAuthorized` below turns
	 * into an honest "no access" for the form.
	 */
	override async getRepoBranches(params: GetBranchesReq): Promise<string[]> {
		const repo = parseGitHubOwnerRepo(params.repoUrl);
		if (!repo) {
			return [];
		}
		// A private repository is only reachable through the App installation
		// covering its owner; a public one is readable either way, so the
		// anonymous route is the fallback rather than the first choice.
		const installation = installationFor(
			await this.installationIndex(),
			repo.owner,
		);
		if (installation) {
			try {
				const names = items(
					await this.bff.get<ListResponse<string>>(
						`/git/github/branches${q({ installationId: installation.installationId, owner: repo.owner, repo: repo.repo })}`,
					),
				);
				if (names.length > 0) {
					return names.filter(Boolean);
				}
			} catch (err) {
				ext.logError(
					`Could not list branches of ${repo.owner}/${repo.repo} via the GitHub App`,
					err as Error,
				);
			}
		}
		const branches = items(
			await this.bff.get<ListResponse<{ name: string; isDefault?: boolean }>>(
				`/repos/${seg(repo.owner)}/${seg(repo.repo)}/branches`,
			),
		);
		return branches.map((branch) => branch.name).filter(Boolean);
	}

	/**
	 * Owner-to-installation index, built once per session.
	 *
	 * Cached because every repository lookup consults it and rebuilding costs one
	 * call per installation. Authorizing or installing resets it, which is the
	 * only thing that changes the answer.
	 */
	private async installationIndex(): Promise<Map<
		string,
		OwnerIndexEntry
	> | null> {
		try {
			const entries = await this.installationEntries();
			return entries && indexInstallations(entries);
		} catch {
			// Resolving a repository tolerates not knowing: a public repository
			// needs no installation, so an unusable index is "unknown", not a
			// failure to report here. The pickers report it instead, because
			// there the answer is the whole point.
			return null;
		}
	}

	/**
	 * The App's installations and their repositories, as fetched.
	 *
	 * Cached rather than the index built from it, because the repository
	 * pickers need the repositories themselves and rebuilding costs one call
	 * per installation either way.
	 */
	private async installationEntries(): Promise<Array<{
		installation: GitInstallation;
		repos: GitRepo[];
	}> | null> {
		// An empty result is not cached. Empty is what a user sees right before
		// they go and install the App, so caching it would survive the install
		// and leave the pickers permanently empty — the callback that would
		// clear it does not arrive when GitHub has no setup URL to return to.
		if (this.installations?.length) {
			return this.installations;
		}
		try {
			const installations = items(
				await this.bff.get<ListResponse<GitInstallation>>(
					"/git/github/installations",
				),
			);
			const entries = await Promise.all(
				installations.map(async (installation) => ({
					installation,
					repos: await this.installationRepos(installation.installationId),
				})),
			);
			this.installations = entries;
			return entries;
		} catch (err) {
			// Missing authorization is a state with a remedy, not a failure, so
			// it travels to the caller: the pickers turn it into the authorize
			// prompt, and swallowing it here leaves them with nothing to show.
			if (err instanceof IpaasError && isGitHubAuthRequired(err.status)) {
				throw err;
			}
			ext.logError("Could not list GitHub App installations", err as Error);
			return null;
		}
	}

	private async installationRepos(installationId: number): Promise<GitRepo[]> {
		try {
			return items(
				await this.bff.get<ListResponse<GitRepo>>(
					`/git/github/repos${q({ installationId })}`,
				),
			);
		} catch (err) {
			// Missing authorization is not this installation's problem: the App
			// is installed, but the user has never granted it, so every
			// installation answers the same way and the remedy is the authorize
			// flow. Reported rather than absorbed, or the pickers show an
			// account whose repositories are silently always empty.
			if (err instanceof IpaasError && isGitHubAuthRequired(err.status)) {
				throw err;
			}
			// One suspended installation drops only its own repositories.
			ext.logError(
				`Could not list repositories of installation ${installationId}`,
				err as Error,
			);
			return [];
		}
	}

	/** Forget the cached index, after anything that can change which repositories are reachable. */
	resetGitHubInstallations(): void {
		this.installations = null;
	}

	/**
	 * Bind the GitHub App installations behind an OAuth code.
	 *
	 * A 409 means the user authorized the App but has not installed it on any
	 * account, which is a different remedy — the install page, not the authorize
	 * page — so it is reported rather than treated as a failure.
	 */
	override async obtainGithubToken(params: {
		code: string;
		orgId: string;
	}): Promise<void> {
		try {
			await this.bff.post("/git/github/installations", { code: params.code });
		} catch (err) {
			if (err instanceof IpaasError && isGitHubAuthRequired(err.status)) {
				throw new Error(
					"The GitHub App is not installed on any of your accounts. Install it, then try again.",
				);
			}
			throw err;
		} finally {
			// Also on failure. Binding is several steps — exchanging the code,
			// then discovering the installations — and an error in a later one
			// still leaves the authorization granted, so what is known about
			// the reachable repositories is stale either way. Keeping the old
			// answer here is what makes a failed bind look permanent when the
			// grant actually went through, and sends the user to reload the
			// window to see their repositories.
			this.resetGitHubInstallations();
		}
	}

	/**
	 * Whether the platform can read the repository.
	 *
	 * There is no "is authorized" endpoint, so this is answered by doing the
	 * read: branches come back for a public repository and not for anything
	 * else. `retrievedRepos` stays true because the lookup itself worked — that
	 * is what steers the form to "WSO2 lacks access to this repository" rather
	 * than "authorize WSO2", and the former is the accurate advice while the
	 * GitHub App flow is not wired.
	 */
	override async isRepoAuthorized(
		params: IsRepoAuthorizedReq,
	): Promise<IsRepoAuthorizedResp> {
		try {
			const branches = await this.getRepoBranches(params as GetBranchesReq);
			return { retrievedRepos: true, isAccessible: branches.length > 0 };
		} catch (err) {
			ext.logError("Could not read repository branches", err as Error);
			return { retrievedRepos: true, isAccessible: false };
		}
	}

	/**
	 * Repository facts the create form checks before it will submit.
	 *
	 * Only the fields it actually reads are derived — chiefly `isSubPathEmpty`,
	 * which blocks creating an integration over an occupied path. The rest are
	 * reported permissively rather than invented: a false negative here blocks a
	 * legitimate create, and the build validates the real constraints anyway.
	 */
	override async getGitRepoMetadata(
		params: GetGitMetadataReq,
	): Promise<GetGitMetadataResp> {
		const paths = await this.repoTreePaths(
			params.gitOrgName,
			params.gitRepoName,
			params.branch,
		);
		const subPath = params.relativePath ?? "";
		return {
			metadata: {
				isBareRepo: paths.length === 0,
				isSubPathEmpty: isSubPathEmpty(paths, subPath),
				isSubPathValid: true,
				isValidRepo: true,
				hasBallerinaTomlInPath: hasFileInPath(paths, subPath, "Ballerina.toml"),
				hasBallerinaTomlInRoot: hasFileInPath(paths, "", "Ballerina.toml"),
				isDockerfilePathValid: true,
				hasDockerfileInPath: hasFileInPath(paths, subPath, "Dockerfile"),
				isDockerContextPathValid: true,
				isOpenApiFilePathValid: true,
				hasOpenApiFileInPath: false,
				hasPomXmlInPath: hasFileInPath(paths, subPath, "pom.xml"),
			} as GetGitMetadataResp["metadata"],
		};
	}

	/** Every path in a public repository's tree, or [] when it cannot be read. */
	private async repoTreePaths(
		owner: string,
		repo: string,
		branch?: string,
	): Promise<string[]> {
		if (!owner || !repo) {
			return [];
		}
		try {
			const tree = await this.bff.get<{ items?: RepoTreeNode[] }>(
				`/repos/${seg(owner)}/${seg(repo)}/contents${q({ branch })}`,
			);
			return flattenTree(tree?.items);
		} catch (err) {
			ext.logError(`Could not read the tree of ${owner}/${repo}`, err as Error);
			return [];
		}
	}

	// Git credentials and organizations belong to the GitHub App flow, which is
	// not wired yet. Empty keeps the pickers quiet rather than erroring.
	/**
	 * The GitHub accounts the App is installed on, with their repositories.
	 *
	 * Empty is the answer whenever the App has not been authorized or installed
	 * yet, which is the state a fresh editor starts in — the pickers show
	 * nothing and the user is sent to the install flow, rather than an error.
	 */
	override async getAuthorizedGitOrgs(): Promise<{
		gitOrgs: GithubOrganization[];
	}> {
		const entries = await this.installationEntries();
		return { gitOrgs: entries ? toGitOrgs(entries) : [] };
	}

	override async getCredentials(): Promise<CredentialItem[]> {
		return [];
	}

	// Endpoints belong to a release, and nothing on this path has one yet.
	override async getComponentEndpoints(): Promise<ComponentEP[]> {
		return [];
	}

	/**
	 * The editor is keyed on (user, project, component) and provisioned by the
	 * platform, so pointing it at a newly created component would provision a
	 * second editor rather than re-point this one. There is nothing to update.
	 */
	override async updateCodeServer(): Promise<void> {}

	/**
	 * Sign-out is meaningless here: the session is the token the platform
	 * injected, and no local credential exists to discard. Inherited, this
	 * reaches a CLI that is not signed in and times out.
	 */
	override async signOut(): Promise<void> {}

	/**
	 * The organization's subscriptions, as the create flow's quota check reads
	 * them.
	 *
	 * Both this and getComponentUsage below are keyed on the organization UUID,
	 * which the request does not carry — GetSubscriptionsReq has only `orgId`,
	 * and on this backend that is 0 unless a billing service is wired. The UUID
	 * is taken from the token's ouId claim instead, which is the same value the
	 * platform resolves the organization from server-side.
	 */
	override async getSubscriptions(): Promise<SubscriptionsResp> {
		const orgUuid = decodeClaims(process.env[ENV_STS_TOKEN] ?? "")?.ouId ?? "";
		const subscriptions = items(
			await this.bff.get<ListResponse<IpaasOrgSubscription>>(
				`/orgs/${seg(orgUuid)}/subscriptions`,
			),
		);
		return {
			count: subscriptions.length,
			cloudType: "",
			emailType: "",
			list: subscriptions.map(
				(subscription) =>
					({
						subscriptionId: subscription.subscriptionId ?? "",
						tierId: subscription.tierId ?? "",
						supportPlanId: "",
						cloudType: "",
						subscriptionType: subscription.subscriptionType ?? "",
						subscriptionBillingProvider: "",
						subscriptionBillingProviderStatus:
							subscription.subscriptionStatus ?? "",
					}) as SubscriptionsResp["list"][number],
			),
		};
	}

	/**
	 * Component usage against the organization's quota. Only the billable count
	 * is populated, because it is the only field the quota check reads and the
	 * platform reports no breakdown to fill the rest from.
	 */
	override async getComponentUsage(): Promise<GetComponentUsageResp> {
		const orgUuid = decodeClaims(process.env[ENV_STS_TOKEN] ?? "")?.ouId ?? "";
		const limits = await this.bff.get<IpaasOrgComponentLimits>(
			`/orgs/${seg(orgUuid)}/component-limits`,
		);
		return {
			success: true,
			message: "",
			data: {
				billableComponentCount: limits?.billableComponentCount ?? 0,
				componentCount: limits?.componentCount ?? 0,
				externalConsumerComponentCount: 0,
				systemComponentCount: 0,
				orgId: 0,
				isWebappConstrained: false,
				distinctTypeCount: [],
			},
		} as GetComponentUsageResp;
	}

	// Everything below has no platform endpoint. Each would otherwise reach the
	// bundled CLI and fail with "not logged in", which reads as a broken session
	// rather than an absent feature. Refusing by name says which feature is
	// missing, and keeps the failure at the call rather than in a later log.

	override async getMarketplaceItem(): Promise<MarketplaceItem> {
		return this.unsupported("The connection marketplace");
	}
	override async getMarketplaceIdl(): Promise<MarketplaceIdlResp> {
		return this.unsupported("The connection marketplace");
	}
	override async getMarketplaceDatabaseItem(): Promise<MarketplaceItem> {
		return this.unsupported("Managed databases");
	}
	override async getDatabaseServer(): Promise<DatabaseServer> {
		return this.unsupported("Managed databases");
	}
	override async getDatabaseAdminCredential(): Promise<DatabaseAdminCredential> {
		return this.unsupported("Managed databases");
	}
	override async getDatabaseCredentials(): Promise<DatabaseCredential[]> {
		return this.unsupported("Managed databases");
	}
	override async registerMarketplaceConnection(): Promise<MarketplaceItem> {
		return this.unsupported("The connection marketplace");
	}
	override async resolveConnectionSecrets(): Promise<ResolveConnectionSecretsResp> {
		return this.unsupported("Connection secrets");
	}
	override async getCredentialDetails(): Promise<CredentialItem> {
		return this.unsupported("Git credentials");
	}

	// Git write access. Reading a public repository works (see getRepoBranches);
	// pushing and private-repository access both need a GitHub App installation,
	// which is not wired yet.
	override async getGitTokenForRepository(): Promise<GetGitTokenForRepositoryResp> {
		return this.unsupported("Git push credentials");
	}

	/**
	 * Where to send the user to sign in.
	 *
	 * The identity provider redirects only to an address registered against the
	 * client, and an editor's address is a per-component subdomain that cannot
	 * be. The console's callback is registered, so the editor asks to be
	 * returned there and names itself in `state` for the console to forward —
	 * the detour the GitHub App flow already takes, for the same reason.
	 */
	override async getSignInUrl({
		callbackUrl,
	}: { callbackUrl: string }): Promise<string | undefined> {
		const idp = await this.idpConfig();
		if (!idp) {
			throw new Error(
				"This deployment publishes no sign-in configuration, so the editor cannot start one. Reload the editor to obtain a fresh token.",
			);
		}
		const redirectUri = `${ext.ipaasConsoleUrl}/signin`;
		const pkce = generatePkce();
		const nonce = newNonce();
		this.pendingSignIn = { pkce, nonce, redirectUri };
		return buildAuthorizeUrl(
			idp,
			redirectUri,
			encodeSignInState(callbackUrl, nonce),
			pkce.challenge,
		);
	}

	/** One platform, one sign-in: the Devant entry point leads to the same place. */
	override async getDevantSignInUrl(params: {
		callbackUrl: string;
	}): Promise<string | undefined> {
		return this.getSignInUrl(params);
	}

	/**
	 * Redeem the code the console forwarded, and keep the session.
	 *
	 * The nonce is checked first: `state` travels by way of the provider and the
	 * console, so a code arriving with one this editor never issued answers no
	 * request it made.
	 */
	override async signInWithAuthCode(
		authCode: string,
		_region?: string,
		_orgId?: string,
		state?: string,
	): Promise<UserInfo | undefined> {
		const pending = this.pendingSignIn;
		this.pendingSignIn = null;
		if (!pending) {
			throw new Error("No sign-in is in progress. Start one from the editor and try again.");
		}
		if (state !== undefined && decodeSignInNonce(state) !== pending.nonce) {
			throw new Error("This sign-in does not answer a request from this editor.");
		}
		const idp = await this.idpConfig();
		if (!idp) {
			throw new Error("This deployment publishes no sign-in configuration.");
		}
		const session = toStoredSession(
			await this.postToken(
				idp,
				buildTokenBody(idp, authCode, pending.redirectUri, pending.pkce.verifier),
			),
			Date.now(),
		);
		if (!session) {
			throw new Error("Signing in returned no token.");
		}
		await this.sessions.write(session);
		this.sessionToken = session.accessToken;
		return this.getUserInfo();
	}

	override async signInDevantWithAuthCode(
		authCode: string,
		region?: string,
		orgId?: string,
		state?: string,
	): Promise<UserInfo | undefined> {
		return this.signInWithAuthCode(authCode, region, orgId, state);
	}

	override async startProxyServer(): Promise<StartProxyServerResp> {
		return this.unsupported("The connection proxy");
	}
	override async stopProxyServer(): Promise<void> {
		return this.unsupported("The connection proxy");
	}
	override async changePrebuiltIntegrationRepository(): Promise<void> {
		return this.unsupported("Changing a prebuilt integration's repository");
	}

	/** Renaming and re-describing a project, which the platform does serve. */
	override async updateProject(params: UpdateProjectReq): Promise<Project> {
		// Only displayName is sent: the request carries no description, and the
		// platform's PUT replaces what it is given, so including an empty one
		// would erase the stored description.
		const updated = await this.bff.put<IpaasProject>(
			`/projects/${seg(params.projectId)}`,
			{
				displayName: params.name,
			},
		);
		return toProject(updated, params.orgId);
	}

	// --- Operations with no platform-core equivalent ---------------------------

	/** Builds for a component, as the platform returns them. */
	async listBuilds(
		componentName: string,
		projectName?: string,
	): Promise<IpaasWorkflowRun[]> {
		return items(
			await this.bff.get<ListResponse<IpaasWorkflowRun>>(
				`/components/${seg(componentName)}/builds${q({ projectName })}`,
			),
		);
	}

	async getBuild(
		componentName: string,
		buildName: string,
		projectName?: string,
	): Promise<IpaasWorkflowRun> {
		return this.bff.get<IpaasWorkflowRun>(
			`/components/${seg(componentName)}/builds/${seg(buildName)}${q({ projectName })}`,
		);
	}

	/**
	 * Start a build. The answer confirms only that one was started — it does not
	 * name the run, which is why callers identify it by time instead.
	 */
	async triggerBuild(
		componentName: string,
		projectName?: string,
	): Promise<IpaasTriggerBuildResponse> {
		return this.bff.post<IpaasTriggerBuildResponse>(
			`/components/${seg(componentName)}/builds${q({ projectName })}`,
		);
	}

	/** Snapshot the current build into a release and bind it to an environment. */
	async deploy(
		componentName: string,
		environment: string,
		projectName?: string,
	): Promise<void> {
		await this.bff.post(
			`/components/${seg(componentName)}/deploy${q({ projectName, environment })}`,
		);
	}

	/**
	 * The component's deployment in one environment, or null when it has none
	 * yet — which the platform reports as an empty 200, not a 404.
	 */
	async getDeployment(
		componentName: string,
		environmentId: string,
	): Promise<IpaasComponentDeployment | null> {
		try {
			const deployment = await this.bff.get<IpaasComponentDeployment | null>(
				`/components/${seg(componentName)}/deployments${q({ environmentId })}`,
			);
			return deployment ?? null;
		} catch (err) {
			if (err instanceof IpaasError && err.isNotFound) {
				return null;
			}
			throw err;
		}
	}
}

/**
 * The integration's path within its repository.
 *
 * `componentDir` is an absolute workspace path, and the platform stores a
 * repository-relative one. Resolving it needs the git root, so it happens here
 * rather than in the pure mapper. An unresolvable root yields "" — the
 * repository root — which is correct for a single-integration repository and
 * the only safe guess for anything else.
 */
async function resolveRepoSubPath(componentDir: string): Promise<string> {
	if (!componentDir) {
		return "";
	}
	// Imported lazily: the git module reaches for the vscode API at load time,
	// which makes it unusable from a plain unit test of anything importing it.
	const { getGitRoot, relativePath } = await import("../git/util");
	const gitRoot = await getGitRoot(ext.context, componentDir);
	if (!gitRoot) {
		ext.log(
			`No git root found for ${componentDir}; treating the integration as the repository root`,
		);
		return "";
	}
	return relativePath(gitRoot, componentDir);
}
