function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function filterFacilityMatches(facilities, query) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [];
  }

  return facilities.filter((facility) => {
    const title = facility && facility.Title ? String(facility.Title) : "";
    return normalizeSearchText(title).includes(normalizedQuery);
  });
}

if (typeof window !== "undefined") {
  window.filterFacilityMatches = filterFacilityMatches;
  window.normalizeSearchText = normalizeSearchText;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeSearchText,
    filterFacilityMatches
  };
}
