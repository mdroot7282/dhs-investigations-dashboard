#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const xlsx = require("xlsx");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const FACILITIES_JSON_PATH = path.join(PROJECT_ROOT, "facilities.json");

const workbookPathArg = process.argv[2];

if (!workbookPathArg) {
	console.error("Usage: node tools/excel-to-json.js <path-to-workbook.xlsx>");
	process.exit(1);
}

const workbookPath = path.resolve(process.cwd(), workbookPathArg);

if (!fs.existsSync(workbookPath)) {
	console.error(`Workbook not found: ${workbookPath}`);
	process.exit(1);
}

if (!fs.existsSync(FACILITIES_JSON_PATH)) {
	console.error(`Template JSON not found: ${FACILITIES_JSON_PATH}`);
	process.exit(1);
}

function normalizeHeader(value) {
	return String(value || "").trim();
}

function normalizeName(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
}

function toTrimmedValue(value) {
	if (typeof value === "string") {
		return value.trim();
	}
	return value;
}

function formatDateParts(year, month, day) {
	const yyyy = String(year).padStart(4, "0");
	const mm = String(month).padStart(2, "0");
	const dd = String(day).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}T00:00:00`;
}

function toDateString(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return formatDateParts(
			value.getUTCFullYear(),
			value.getUTCMonth() + 1,
			value.getUTCDate()
		);
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		const parsed = xlsx.SSF.parse_date_code(value);
		if (parsed && parsed.y && parsed.m && parsed.d) {
			return formatDateParts(parsed.y, parsed.m, parsed.d);
		}
	}

	const asText = String(value || "").trim();
	if (!asText) {
		return "";
	}

	const parsedTime = Date.parse(asText);
	if (!Number.isNaN(parsedTime)) {
		const date = new Date(parsedTime);
		return formatDateParts(
			date.getUTCFullYear(),
			date.getUTCMonth() + 1,
			date.getUTCDate()
		);
	}

	return asText;
}

function isDateField(fieldName) {
	const normalized = fieldName.trim().toLowerCase();
	return normalized.includes("date") || normalized.includes("updated");
}

function toTypedValue(value, fieldName = "") {
	if (fieldName && isDateField(fieldName)) {
		return toDateString(value);
	}

	const trimmed = toTrimmedValue(value);

	if (trimmed === "") {
		return "";
	}

	if (typeof trimmed === "number") {
		return Number.isFinite(trimmed) ? trimmed : "";
	}

	if (typeof trimmed === "boolean") {
		return trimmed;
	}

	if (typeof trimmed === "string") {
		const numericPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
		if (numericPattern.test(trimmed)) {
			const asNumber = Number(trimmed);
			if (Number.isFinite(asNumber)) {
				return asNumber;
			}
		}
		return trimmed;
	}

	return trimmed;
}

function normalizeComparableName(value) {
	return normalizeName(value).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function findFallbackNameMatch(candidateName, facilityList) {
	const comparableCandidate = normalizeComparableName(candidateName);
	if (!comparableCandidate) {
		return null;
	}

	const matches = facilityList.filter((facility) => {
		const comparableTemplate = normalizeComparableName(getFacilityNameFromRecord(facility));
		if (!comparableTemplate) {
			return false;
		}

		return (
			comparableTemplate.includes(comparableCandidate) ||
			comparableCandidate.includes(comparableTemplate)
		);
	});

	return matches.length === 1 ? matches[0] : null;
}

function getFacilityNameFromRecord(record) {
	return (
		record["Facility Name"] ||
		record.Title ||
		record.Name ||
		record["Facility"] ||
		""
	);
}

function findFacilityIdKey(record) {
	if (!record || typeof record !== "object") {
		return null;
	}

	const keys = Object.keys(record);
	const exactMatch = keys.find((key) => /^facility\s*id$/i.test(key.trim()));
	if (exactMatch) {
		return exactMatch;
	}

	return keys.find((key) => /(^|\s)id$/i.test(key.trim()) || /facility.*id/i.test(key));
}

function isBlankRow(record) {
	return Object.values(record).every((value) => {
		const normalized = toTrimmedValue(value);
		return normalized === "" || normalized === null || typeof normalized === "undefined";
	});
}

function isPreservedField(fieldName) {
	const normalized = fieldName.trim().toLowerCase();

	if (["latitude", "longitude"].includes(normalized)) {
		return true;
	}

	if (/id$/.test(normalized) || /facility\s*id/.test(normalized)) {
		return true;
	}

	return false;
}

function isMetadataField(fieldName) {
	const normalized = fieldName.trim().toLowerCase();
	return [
		"facility name",
		"title",
		"name",
		"facility",
		"address",
		"city",
		"latitude",
		"longitude",
		"notes",
		"item type",
		"path"
	].includes(normalized);
}

function resolveTargetKey(sourceKey, schemaKeys, templateIdKey) {
	const normalized = sourceKey.trim().toLowerCase();

	if (schemaKeys.has(sourceKey)) {
		return sourceKey;
	}

	if (["facility name", "name", "facility"].includes(normalized) && schemaKeys.has("Title")) {
		return "Title";
	}

	if (normalized === "facility id" && templateIdKey && schemaKeys.has(templateIdKey)) {
		return templateIdKey;
	}

	return sourceKey;
}

const facilitiesTemplate = JSON.parse(fs.readFileSync(FACILITIES_JSON_PATH, "utf8"));

if (!Array.isArray(facilitiesTemplate)) {
	console.error("Template JSON must be an array of facilities.");
	process.exit(1);
}

const templateNameMap = new Map();
const templateIdMap = new Map();
const templateDuplicateNames = new Set();
const templateFacilityIdKey = facilitiesTemplate.length ? findFacilityIdKey(facilitiesTemplate[0]) : null;

for (const facility of facilitiesTemplate) {
	const normalizedName = normalizeName(getFacilityNameFromRecord(facility));
	if (normalizedName) {
		if (templateNameMap.has(normalizedName)) {
			templateDuplicateNames.add(getFacilityNameFromRecord(facility));
		}
		templateNameMap.set(normalizedName, facility);
	}

	if (templateFacilityIdKey && facility[templateFacilityIdKey] !== undefined && facility[templateFacilityIdKey] !== null) {
		const normalizedId = String(facility[templateFacilityIdKey]).trim();
		if (normalizedId) {
			templateIdMap.set(normalizedId, facility);
		}
	}
}

const workbook = xlsx.readFile(workbookPath, { cellDates: false });

if (!workbook.SheetNames.length) {
	console.error("Workbook does not contain any worksheets.");
	process.exit(1);
}

const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
const rawRows = xlsx.utils.sheet_to_json(firstSheet, {
	defval: "",
	raw: true
});

const rows = rawRows
	.map((row) => {
		const normalizedRecord = {};
		for (const [key, value] of Object.entries(row)) {
			normalizedRecord[normalizeHeader(key)] = value;
		}
		return normalizedRecord;
	})
	.filter((row) => !isBlankRow(row));

const facilitiesProcessed = rows.length;
const workbookDuplicateNameCounts = new Map();
const workbookDuplicateNames = new Set();

for (const row of rows) {
	const facilityName = String(getFacilityNameFromRecord(row) || "").trim();
	if (!facilityName) {
		continue;
	}
	const duplicateKey = normalizeName(facilityName);
	const count = (workbookDuplicateNameCounts.get(duplicateKey) || 0) + 1;
	workbookDuplicateNameCounts.set(duplicateKey, count);
	if (count > 1) {
		workbookDuplicateNames.add(facilityName);
	}
}

const workbookFacilityIdKey = rows.length ? findFacilityIdKey(rows[0]) : null;

const templateSchemaKeys = new Set(
	facilitiesTemplate.length ? Object.keys(facilitiesTemplate[0]) : []
);

const rowByTemplateFacility = new Map();
const unmatchedWorkbookFacilities = [];

for (const row of rows) {
	const candidateName = normalizeName(getFacilityNameFromRecord(row));
	const candidateId = workbookFacilityIdKey
		? String(row[workbookFacilityIdKey] || "").trim()
		: "";

	let matchedFacility = null;

	if (candidateId && templateIdMap.has(candidateId)) {
		matchedFacility = templateIdMap.get(candidateId);
	}

	if (!matchedFacility && candidateName && templateNameMap.has(candidateName)) {
		matchedFacility = templateNameMap.get(candidateName);
	}

	if (!matchedFacility && candidateName) {
		matchedFacility = findFallbackNameMatch(candidateName, facilitiesTemplate);
	}

	if (!matchedFacility) {
		unmatchedWorkbookFacilities.push(String(getFacilityNameFromRecord(row) || "(Unnamed facility)").trim());
		continue;
	}

	rowByTemplateFacility.set(matchedFacility, row);
}

const discoveredFields = new Set();

for (const row of rows) {
	for (const key of Object.keys(row)) {
		if (!templateSchemaKeys.has(key) && !isMetadataField(key)) {
			discoveredFields.add(key);
		}
	}
}

const updatedFacilities = facilitiesTemplate.map((facility) => {
	const row = rowByTemplateFacility.get(facility);

	if (!row) {
		return { ...facility };
	}

	const updated = { ...facility };

	for (const [key, value] of Object.entries(row)) {
		if (!key) {
			continue;
		}

		const targetKey = resolveTargetKey(key, templateSchemaKeys, templateFacilityIdKey);

		if (!templateSchemaKeys.has(targetKey) && isMetadataField(key)) {
			continue;
		}

		if (isPreservedField(targetKey)) {
			continue;
		}

		updated[targetKey] = toTypedValue(value, targetKey);
	}

	return updated;
});

const missingFacilities = facilitiesTemplate
	.filter((facility) => !rowByTemplateFacility.has(facility))
	.map((facility) => String(getFacilityNameFromRecord(facility) || "(Unnamed facility)").trim());

fs.writeFileSync(
	FACILITIES_JSON_PATH,
	`${JSON.stringify(updatedFacilities, null, 2)}\n`,
	"utf8"
);

console.log("facilities.json regenerated successfully.");
console.log(`Facilities processed: ${facilitiesProcessed}`);
console.log(`Facilities updated: ${updatedFacilities.length - missingFacilities.length}`);
console.log(
	`New fields discovered: ${discoveredFields.size}${
		discoveredFields.size ? ` (${Array.from(discoveredFields).sort().join(", ")})` : ""
	}`
);

if (missingFacilities.length) {
	console.log(`Missing facilities (${missingFacilities.length}): ${missingFacilities.join("; ")}`);
} else {
	console.log("Missing facilities: none");
}

const duplicateFacilityNames = new Set([
	...templateDuplicateNames,
	...workbookDuplicateNames
]);

if (duplicateFacilityNames.size) {
	console.log(
		`Duplicate facility names (${duplicateFacilityNames.size}): ${Array.from(duplicateFacilityNames)
			.sort()
			.join("; ")}`
	);
} else {
	console.log("Duplicate facility names: none");
}

if (unmatchedWorkbookFacilities.length) {
	console.log(
		`Workbook facilities not found in template (${unmatchedWorkbookFacilities.length}): ${unmatchedWorkbookFacilities.join("; ")}`
	);
}
