import fileIcon from "./file.svg";
import billingIcon from "./Billing.svg";
import aiAgentIcon from "./AIAgent.svg";

const LOCAL_SVG_URLS: Record<string, string> = {
    "file.svg": fileIcon,
    "Billing.svg": billingIcon,
    "AIAgent.svg": aiAgentIcon,
};

export function getLocalSvg(name: string): string | undefined {
    return LOCAL_SVG_URLS[name];
}
