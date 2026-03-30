// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
// Simplified segment parser for the WI migration wizard AI enhancement view.
// Only handles <toolcall> and <toolresult> tags alongside free-form text.

export enum SegmentType {
    Text = "Text",
    ToolCall = "ToolCall",
}

export interface Segment {
    type: SegmentType;
    loading: boolean;
    text: string;
    failed?: boolean;
    toolName?: string;
}

export function splitContent(content: string): Segment[] {
    const segments: Segment[] = [];

    const regexPattern =
        /<toolcall(?:\s+[^>]*)?>([\s\S]*?)<\/toolcall>|<toolresult(?:\s+[^>]*)?>([\s\S]*?)<\/toolresult>/g;

    const matches = Array.from(content.matchAll(regexPattern));
    let lastIndex = 0;

    for (const match of matches) {
        if (match.index! > lastIndex) {
            const text = content.slice(lastIndex, match.index);
            if (text) {
                segments.push({ type: SegmentType.Text, loading: false, text });
            }
        }

        const toolNameMatch = match[0].match(/tool="([^"]+)"/);
        const toolName = toolNameMatch?.[1];

        if (match[1] !== undefined) {
            // <toolcall>
            segments.push({
                type: SegmentType.ToolCall,
                loading: true,
                text: match[1],
                toolName,
            });
        } else if (match[2] !== undefined) {
            // <toolresult>
            const failedAttr = match[0].includes('failed="true"');
            segments.push({
                type: SegmentType.ToolCall,
                loading: false,
                text: match[2],
                failed: failedAttr,
                toolName,
            });
        }

        lastIndex = match.index! + match[0].length;
    }

    if (lastIndex < content.length) {
        const remaining = content.slice(lastIndex);
        if (remaining) {
            segments.push({ type: SegmentType.Text, loading: false, text: remaining });
        }
    }

    return segments;
}
