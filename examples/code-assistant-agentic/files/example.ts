/**
 * A collection of type-safe sorting helper functions
 */

/**
 * Sort numbers in ascending or descending order
 */
export function sortNumbers(numbers: number[], descending = false): number[] {
  return [...numbers].sort((a, b) => (descending ? b - a : a - b));
}

/**
 * Sort strings alphabetically, with optional case sensitivity and direction
 */
export function sortStrings(
  strings: string[],
  options: {
    caseSensitive?: boolean;
    descending?: boolean;
  } = {}
): string[] {
  const { caseSensitive = false, descending = false } = options;

  return [...strings].sort((a, b) => {
    const compareA = caseSensitive ? a : a.toLowerCase();
    const compareB = caseSensitive ? b : b.toLowerCase();
    const comparison = compareA.localeCompare(compareB);
    return descending ? -comparison : comparison;
  });
}

/**
 * Sort objects by a specific key
 */
export function sortByKey<T extends object>(
  items: T[],
  key: keyof T,
  descending = false
): T[] {
  return [...items].sort((a, b) => {
    const valueA = a[key];
    const valueB = b[key];

    if (typeof valueA === "number" && typeof valueB === "number") {
      return descending ? valueB - valueA : valueA - valueB;
    }

    if (typeof valueA === "string" && typeof valueB === "string") {
      return descending
        ? valueB.localeCompare(valueA)
        : valueA.localeCompare(valueB);
    }

    if (valueA < valueB) return descending ? 1 : -1;
    if (valueA > valueB) return descending ? -1 : 1;
    return 0;
  });
}

/**
 * Sort by multiple keys with custom sorting options for each key
 */
export function sortByMultipleKeys<T extends object>(
  items: T[],
  sortKeys: Array<{
    key: keyof T;
    descending?: boolean;
    caseSensitive?: boolean;
  }>
): T[] {
  return [...items].sort((a, b) => {
    for (const { key, descending = false, caseSensitive = false } of sortKeys) {
      const valueA = a[key];
      const valueB = b[key];

      if (valueA === valueB) continue;

      if (typeof valueA === "number" && typeof valueB === "number") {
        return descending ? valueB - valueA : valueA - valueB;
      }

      if (typeof valueA === "string" && typeof valueB === "string") {
        const compareA = caseSensitive ? valueA : valueA.toLowerCase();
        const compareB = caseSensitive ? valueB : valueB.toLowerCase();
        const comparison = compareA.localeCompare(compareB);
        return descending ? -comparison : comparison;
      }

      return descending ? (valueA < valueB ? 1 : -1) : valueA < valueB ? -1 : 1;
    }
    return 0;
  });
}

/**
 * Sort dates in ascending or descending order
 */
export function sortDates(
  dates: (Date | string)[],
  descending = false
): Date[] {
  return [...dates]
    .map((d) => (d instanceof Date ? d : new Date(d)))
    .sort((a, b) =>
      descending ? b.getTime() - a.getTime() : a.getTime() - b.getTime()
    );
}
