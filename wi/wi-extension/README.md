# **WSO2 Integrator Extension for Visual Studio Code**

Open-source integration for the agentic enterprise

---

The **WSO2 Integrator** extension for VS Code brings an AI-first integration development experience to Visual Studio Code. Build integrations, long-running workflows, MCP servers, and AI agents in one place: describe what you need in natural language, and let AI help you build, map data, test, and debug.

Connect agents, APIs, data, and events wherever they run, across cloud, on-premises, and hybrid environments, with governance built in. WSO2 Integrator is 100% open source and built on open standards, so you keep full ownership of your integration stack with no vendor lock-in.

## **What You Can Build**

A single, integrated development experience for everything the agentic enterprise needs to connect:

* **Integrations:** Scheduled [automations](https://wso2.com/integration-platform/docs/integrator/get-started/quickstarts/build-automation), [integrations as APIs](https://wso2.com/integration-platform/docs/integrator/get-started/quickstarts/build-integration-api) (REST, GraphQL, gRPC, WebSocket, and async APIs), [event-driven integrations](https://wso2.com/integration-platform/docs/integrator/get-started/quickstarts/build-event-driven-integration) over Kafka, AMQP, MQTT, and JMS, and [file-driven integrations](https://wso2.com/integration-platform/docs/integrator/get-started/quickstarts/build-file-driven-integration) that trigger when files arrive.

* **Long-running workflows:** Stateful, multi-step [workflows](https://wso2.com/integration-platform/docs/integrator/get-started/quickstarts/build-durable-workflow) that span systems, agents, and people, with human tasks and approvals, agent-triggered workflows, and built-in error handling and retry.

* **MCP servers:** Build an [MCP server](https://wso2.com/integration-platform/docs/integrator/develop-and-test/integration-artifacts/ai-integrations/mcp) from scratch with no boilerplate, or convert an existing REST API into one, and test it with the MCP inspector, making enterprise data and systems available to agents.

* **AI agents:** Build autonomous [agents](https://wso2.com/integration-platform/docs/integrator/get-started/quickstarts/build-ai-agent) in natural language, connect them to tools over MCP, give them short- and long-term memory, and orchestrate multiple agents with human-in-the-loop guardrails. Combine an agent with a long-running workflow to create a [durable agent](https://wso2.com/integration-platform/docs/integrator/get-started/quickstarts/build-durable-agent) that saves its progress and resumes where it left off.

## **Key Features**

* **AI-First Development:** Describe what you want to build in natural language. The AI assistant generates the integration, maps data between systems, and helps you refine your flows as you go.

<img src="https://github.com/wso2/ballerina-vscode/blob/main/resources/images/wso2-integrator-ai.gif?raw=true" width="100%" />

* **Governance Built In:** Govern what agents know, do, and did. Connect agents to trusted enterprise context, evaluate their reasoning at development time, add human-in-the-loop approvals, and trace every step they take.

* **600+ Pre-Built Connectors:** Connect to SaaS APIs, databases, event streams, and files, with native support for MCP, HTTP, GraphQL, gRPC, and more.

* **Local Testing & Debugging:** Run, test, and debug locally in VS Code before you deploy, with AI-assisted testing and debugging and OpenTelemetry-based observability during development.

<img src="https://github.com/wso2/ballerina-vscode/blob/main/resources/images/wso2-integrator-debug.gif?raw=true" width="100%" />

* **Deploy Your Way:** Deploy directly from VS Code to a WSO2-managed SaaS, or self-host on your own infrastructure (Kubernetes, Docker, VMs, or bare metal) for complete data sovereignty.

<img src="https://github.com/wso2/ballerina-vscode/blob/main/resources/images/wso2-integrator-deploy.gif?raw=true" width="100%" />

## **Prerequisites**

To use all technical features of the WSO2 Integrator, your workstation needs these minimum requirements:

* [Ballerina VS Code Extension](https://marketplace.visualstudio.com/items?itemName=WSO2.ballerina) — For core language support, syntax, and compiler services.

* [Ballerina Swan Lake Update 13 (2201.13.0)](https://ballerina.io/downloads/) or higher.

If these prerequisites are not met on your local workstation, the extension offers automated guidance to assist with the download and configuration of the necessary setup, particularly when switching between runtime profiles.

## **Get Started**

Start building with the quickstarts in the [official documentation](https://wso2.com/integration-platform/docs/get-started/introduction/).

## **Contributing**

We welcome developer contributions. Please see our [repository documentation](https://github.com/wso2/product-integrator) for contributing workflows, branch management, and pull request standards.

## **Support & Resources**

* **Product Overview:** Learn more about [WSO2 Integrator](https://wso2.com/integration-platform/integrator/) and the [WSO2 Integration Platform](https://wso2.com/integration-platform/).

* **Product Documentation:** See the full [WSO2 Integration Platform Documentation](https://wso2.com/integration-platform/docs/).

* **Issue Tracker:** Report bugs, request features, or track development status on the [WSO2 Product Integrator](https://github.com/wso2/product-integrator/issues) repository.
