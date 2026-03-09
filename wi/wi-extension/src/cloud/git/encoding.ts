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

import * as jschardet from "jschardet";

function detectEncodingByBOM(buffer: Buffer): string | null {
	if (!buffer || buffer.length < 2) {
		return null;
	}

	const b0 = buffer.readUInt8(0);
	const b1 = buffer.readUInt8(1);

	// UTF-16 BE
	if (b0 === 0xfe && b1 === 0xff) {
		return "utf16be";
	}

	// UTF-16 LE
	if (b0 === 0xff && b1 === 0xfe) {
		return "utf16le";
	}

	if (buffer.length < 3) {
		return null;
	}

	const b2 = buffer.readUInt8(2);

	// UTF-8
	if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
		return "utf8";
	}

	return null;
}

const IGNORE_ENCODINGS = ["ascii", "utf-8", "utf-16", "utf-32"];

const JSCHARDET_TO_ICONV_ENCODINGS: { [name: string]: string } = {
	ibm866: "cp866",
	big5: "cp950",
};

export function detectEncoding(buffer: Buffer): string | null {
	const result = detectEncodingByBOM(buffer);

	if (result) {
		return result;
	}

	const detected = jschardet.detect(buffer);

	if (!detected || !detected.encoding) {
		return null;
	}

	const encoding = detected.encoding;

	// Ignore encodings that cannot guess correctly
	// (http://chardet.readthedocs.io/en/latest/supported-encodings.html)
	if (0 <= IGNORE_ENCODINGS.indexOf(encoding.toLowerCase())) {
		return null;
	}

	const normalizedEncodingName = encoding.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
	const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];

	return mapped || normalizedEncodingName;
}
