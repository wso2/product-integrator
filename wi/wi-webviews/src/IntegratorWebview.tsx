/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { ViewType } from "@wso2/wi-core";
import { WelcomeView } from "./views/WelcomeView";
import { CreationView } from "./views/creationView";
import { ImportIntegration } from "./views/ImportIntegration";
import { SamplesView } from "./views/samplesView";
import { useVisualizerContext } from "./contexts";
import { ProgressIndicator } from "@wso2/ui-toolkit";

function IntegratorWebview() {
	const { rpcClient, webviewContext } = useVisualizerContext();

	const goBackToWelcome = () => {
		rpcClient.getMainRpcClient().closeWebview();
	};

	switch (webviewContext?.currentView) {
		case ViewType.LOADING:
		case undefined:
			return (
				<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px' }}>
					<ProgressIndicator />
				</div>
			);
		case ViewType.WELCOME:
			return <WelcomeView />;
		case ViewType.CREATE_PROJECT:
			return <CreationView onBack={goBackToWelcome} />;
		case ViewType.SAMPLES:
			return (
				<SamplesView onBack={goBackToWelcome} />
			);
		case ViewType.IMPORT_EXTERNAL:
			return (
				<ImportIntegration onBack={goBackToWelcome} />
			);
		default:
			return (
				<div style={{ padding: "2rem", textAlign: "center" }}>
					<h2>Unknown View Type</h2>
					<p>The requested view is not available.</p>
				</div>
			);
	}
}

export default IntegratorWebview;
