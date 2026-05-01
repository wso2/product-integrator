/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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

// Simplified segment parser for the WI migration wizard AI enhancement view.
// Only handles <toolcall> and <toolresult> tags alongside free-form text.

export enum SegmentType {
    Text = "Text",
    ToolCall = "ToolCall",
    Error = "Error",
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
        /<toolcall(?:\s+[^>]*)?>([\s\S]*?)<\/toolcall>|<toolresult(?:\s+[^>]*)?>([\s\S]*?)<\/toolresult>|<errormsg>([\s\S]*?)<\/errormsg>/g;

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
        } else if (match[3] !== undefined) {
            // <errormsg> — decode HTML entities escaped at the insertion point
            const decoded = match[3]
                .replace(/&gt;/g, ">")
                .replace(/&lt;/g, "<")
                .replace(/&amp;/g, "&");
            segments.push({
                type: SegmentType.Error,
                loading: false,
                text: decoded,
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
